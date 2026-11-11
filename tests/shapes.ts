import type { Stroke } from '../src/preprocess/strokes';

/** Synthetic drawings in a unit box (x right, y down), scaled and moved by place(). */

export function oval(): Stroke[] {
  const s: Stroke = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    s.push(0.5 + 0.33 * Math.sin(a), 0.5 - 0.5 * Math.cos(a));
  }
  return [s];
}

export function verticalLine(): Stroke[] {
  return [[0.5, 0, 0.5, 1]];
}

export function seven(): Stroke[] {
  return [[0.1, 0.05, 0.9, 0.05, 0.4, 1]];
}

export function place(strokes: Stroke[], scale: number, dx: number, dy: number): Stroke[] {
  return strokes.map((s) => s.map((v, i) => v * scale + (i % 2 === 0 ? dx : dy)));
}
