import { describe, expect, it } from 'vitest';
import { fromRaster } from '../src/preprocess/raster';
import { centerOfMass } from '../src/preprocess/strokes';
import { model, mulberry32, parity } from './helpers';

const SIZE = 400;

/** Bilinear upscale of fixture digit n into a 400x400 raster at a random size and position. */
function upscale(n: number, rnd: () => number): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE);
  const side = Math.round(70 + rnd() * 250); // rendered size of the 28x28 image
  const ox = Math.floor(rnd() * (SIZE - side));
  const oy = Math.floor(rnd() * (SIZE - side));
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x > 27 || y > 27 ? 0 : parity.images[n * 784 + y * 28 + x]);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const sx = ((x + 0.5) / side) * 28 - 0.5;
      const sy = ((y + 0.5) / side) * 28 - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const v =
        at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      out[(oy + y) * SIZE + ox + x] = Math.round(v);
    }
  }
  return out;
}

describe('fromRaster', () => {
  it('round trip: upscaled fixture digits at random sizes and positions score >= 95%', () => {
    const rnd = mulberry32(2024);
    let right = 0;
    for (let n = 0; n < parity.count; n++) {
      const img = fromRaster({ data: upscale(n, rnd), width: SIZE, height: SIZE })!;
      const com = centerOfMass(img)!;
      expect(Math.abs(com.x - 14)).toBeLessThan(0.5);
      expect(Math.abs(com.y - 14)).toBeLessThan(0.5);
      if (model.forward(img).prediction === parity.labels[n]) right++;
    }
    expect(right / parity.count).toBeGreaterThanOrEqual(0.95);
  });

  it('returns null for a blank image and stays in [0, 1]', () => {
    expect(fromRaster({ data: new Uint8Array(100), width: 10, height: 10 })).toBeNull();
    const data = new Float32Array(50 * 50);
    for (let y = 10; y < 40; y++) for (let x = 22; x < 27; x++) data[y * 50 + x] = 1;
    const img = fromRaster({ data, width: 50, height: 50 })!;
    for (const v of img) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
