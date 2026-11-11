// Screen layout in "design pixels": everything is laid out on a fixed 1920x1080 board that is
// scaled uniformly to fit the window (main.ts). Layers flow left to right.

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

/** Drawing pad; reused for the 28x28 grid and the spotlight panel. Mirrors #pad-wrap in style.css. */
export const PAD = { x: 48, y: 120, size: 620 } as const;

/** The flattened input: 784 cells, 1 design px each. */
export const STRIP = { x: 742, y: 108, w: 16, h: 784 } as const;

/** Vertical band that holds the connection layers. */
export const BAND = { y0: 96, y1: 904 } as const;

export const H1 = { x: 1010, r: 7, zig: 8, n: 64 } as const;
export const H2 = { x: 1230, r: 9, n: 32 } as const;
export const OUT = { x: 1420, r: 24, n: 10 } as const;
export const BARS = { x: 1458, maxLen: 100, h: 18 } as const;
export const LABEL_Y = 940;
export const RESULT_X = 1765; // center of the answer card column (#card in style.css)

export const h1x = new Float32Array(H1.n);
export const h1y = new Float32Array(H1.n);
export const h2y = new Float32Array(H2.n);
export const outy = new Float32Array(OUT.n);

for (let j = 0; j < H1.n; j++) {
  // Two staggered sub-columns so 64 neurons fit with a readable size.
  h1x[j] = H1.x + (j % 2 === 0 ? -H1.zig : H1.zig);
  h1y[j] = STRIP.y + 6 + (j * (STRIP.h - 12)) / (H1.n - 1);
}
for (let j = 0; j < H2.n; j++) h2y[j] = 150 + (j * 700) / (H2.n - 1);
for (let j = 0; j < OUT.n; j++) outy[j] = 175 + (j * 650) / (OUT.n - 1);

export function stripCellY(i: number): number {
  return STRIP.y + i + 0.5;
}
