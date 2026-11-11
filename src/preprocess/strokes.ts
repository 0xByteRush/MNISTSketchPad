// Drawing -> 28x28 model input, the way MNIST digits were made: the digit is scaled to span a
// 20x20 box, anti-aliased, and placed so its center of mass sits at the center of 28x28.
// Pure TypeScript (no canvas, no DOM): identical in every browser and testable in Node.

import { PREPROCESS } from '../config';

/** One stroke as flat coordinates [x0, y0, x1, y1, ...] in any consistent unit (pad pixels). */
export type Stroke = number[];

export interface StrokeOptions {
  /** Stroke width in 28x28 pixels. */
  strokeWidth?: number;
  /** Supersampling factor per axis. */
  supersample?: number;
  /**
   * Smallest bounding-box side considered a real drawing, in stroke units. Anything smaller
   * (a tap with a little finger jitter) is treated as a dot instead of being blown up.
   */
  minExtent?: number;
}

const N = 28;
const MAX_SHIFT = 4; // center-of-mass correction limit in pixels, so nothing can be pushed out of frame

let hiRes = new Float32Array(0);

/** Paints one round-capped segment into the supersampled buffer (coordinates in hi-res samples). */
function capsule(buf: Float32Array, size: number, ax: number, ay: number, bx: number, by: number, radius: number): void {
  const reach = radius + 1;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
  const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + reach));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
  const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + reach));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5 - ay;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax;
      let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx;
      const ey = py - t * dy;
      // Soft one-sample edge: full inside, linear falloff across the boundary.
      const cover = radius - Math.sqrt(ex * ex + ey * ey) + 0.5;
      if (cover <= 0) continue;
      const idx = y * size + x;
      const c = cover > 1 ? 1 : cover;
      if (c > buf[idx]) buf[idx] = c;
    }
  }
}

function rasterize(
  strokes: Stroke[],
  scale: number,
  tx: number,
  ty: number,
  width: number,
  ss: number,
  out: Float32Array,
): void {
  const size = N * ss;
  if (hiRes.length !== size * size) hiRes = new Float32Array(size * size);
  hiRes.fill(0);
  const radius = (width / 2) * ss;
  for (const s of strokes) {
    if (s.length < 2) continue;
    let ax = (s[0] * scale + tx) * ss;
    let ay = (s[1] * scale + ty) * ss;
    if (s.length === 2) capsule(hiRes, size, ax, ay, ax, ay, radius);
    for (let i = 2; i + 1 < s.length; i += 2) {
      const bx = (s[i] * scale + tx) * ss;
      const by = (s[i + 1] * scale + ty) * ss;
      capsule(hiRes, size, ax, ay, bx, by, radius);
      ax = bx;
      ay = by;
    }
  }
  // Box filter down to 28x28.
  const norm = 1 / (ss * ss);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let sum = 0;
      for (let j = 0; j < ss; j++) {
        const row = (y * ss + j) * size + x * ss;
        for (let i = 0; i < ss; i++) sum += hiRes[row + i];
      }
      const v = sum * norm;
      out[y * N + x] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
}

/** Center of mass in pixel coordinates (pixel centers at +0.5). Returns null for an empty image. */
export function centerOfMass(img: ArrayLike<number>): { x: number; y: number } | null {
  let m = 0;
  let mx = 0;
  let my = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = img[y * N + x];
      m += v;
      mx += v * (x + 0.5);
      my += v * (y + 0.5);
    }
  }
  return m > 0 ? { x: mx / m, y: my / m } : null;
}

export function hasInk(strokes: Stroke[]): boolean {
  for (const s of strokes) if (s.length >= 2) return true;
  return false;
}

/**
 * Renders strokes to the model's input: Float32Array(784), row-major, [0, 1], ink = 1.
 * Returns null when there is no ink. Because the stroke width is applied after scaling,
 * a tiny or a huge drawing gets the same thickness the model was trained on.
 */
export function strokesToInput(strokes: Stroke[], options: StrokeOptions = {}, out?: Float32Array): Float32Array | null {
  if (!hasInk(strokes)) return null;
  const width = options.strokeWidth ?? PREPROCESS.strokeWidth;
  const ss = options.supersample ?? PREPROCESS.supersample;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (let i = 0; i + 1 < s.length; i += 2) {
      if (s[i] < minX) minX = s[i];
      if (s[i] > maxX) maxX = s[i];
      if (s[i + 1] < minY) minY = s[i + 1];
      if (s[i + 1] > maxY) maxY = s[i + 1];
    }
  }
  const longer = Math.max(maxX - minX, maxY - minY);
  // A dot (or a line of zero length) has no size to scale: draw it as-is in the center.
  const usable = longer > Math.max(options.minExtent ?? 0, 1e-9);
  const scale = usable ? (PREPROCESS.box - width) / longer : 0;

  const result = out ?? new Float32Array(N * N);
  let tx = N / 2 - ((minX + maxX) / 2) * scale;
  let ty = N / 2 - ((minY + maxY) / 2) * scale;
  rasterize(strokes, scale, tx, ty, width, ss, result);

  // Shift so the center of mass lands on (14, 14) by re-rasterizing with an offset (no clipping).
  const com = centerOfMass(result);
  if (com) {
    const sx = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, N / 2 - com.x));
    const sy = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, N / 2 - com.y));
    if (Math.abs(sx) > 1e-3 || Math.abs(sy) > 1e-3) {
      tx += sx;
      ty += sy;
      rasterize(strokes, scale, tx, ty, width, ss, result);
    }
  }
  return result;
}
