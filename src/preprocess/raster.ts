// Raster image -> 28x28 model input: crop to the bounding box, area-resample to fit 20x20,
// center by mass. Used by the tests (round trip through an upscaled image); same conventions
// as strokes.ts.

import { PREPROCESS } from '../config';
import { centerOfMass } from './strokes';

export interface RasterImage {
  /** Row-major brightness, ink = high. Uint8 data is read as 0..255, anything else as 0..1. */
  data: ArrayLike<number>;
  width: number;
  height: number;
}

const N = 28;
const MAX_SHIFT = 4;

function resample(
  img: RasterImage,
  norm: number,
  bx: number,
  by: number,
  scale: number, // target pixels per source pixel
  ox: number,
  oy: number,
  out: Float32Array,
): void {
  const { data, width, height } = img;
  const inv = 1 / scale;
  for (let ty = 0; ty < N; ty++) {
    // Source rectangle covered by this target pixel.
    const sy0 = by + (ty - oy) * inv;
    const sy1 = sy0 + inv;
    const y0 = Math.max(0, Math.floor(sy0));
    const y1 = Math.min(height, Math.ceil(sy1));
    for (let tx = 0; tx < N; tx++) {
      const sx0 = bx + (tx - ox) * inv;
      const sx1 = sx0 + inv;
      const x0 = Math.max(0, Math.floor(sx0));
      const x1 = Math.min(width, Math.ceil(sx1));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (wy <= 0) continue;
        for (let x = x0; x < x1; x++) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (wx > 0) sum += data[y * width + x] * wx * wy;
        }
      }
      const v = (sum * norm) / (inv * inv);
      out[ty * N + tx] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
}

/** Returns Float32Array(784) in [0, 1], or null when the image has no ink. */
export function fromRaster(img: RasterImage, threshold = 0.1): Float32Array | null {
  const { data, width, height } = img;
  const norm = data instanceof Uint8Array || data instanceof Uint8ClampedArray ? 1 / 255 : 1;
  const cut = threshold / norm;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] > cut) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const scale = PREPROCESS.box / Math.max(bw, bh);

  const out = new Float32Array(N * N);
  let ox = N / 2 - (bw * scale) / 2;
  let oy = N / 2 - (bh * scale) / 2;
  resample(img, norm, minX, minY, scale, ox, oy, out);
  const com = centerOfMass(out);
  if (com) {
    ox += Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, N / 2 - com.x));
    oy += Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, N / 2 - com.y));
    resample(img, norm, minX, minY, scale, ox, oy, out);
  }
  return out;
}
