import { describe, expect, it } from 'vitest';
import { PREPROCESS } from '../src/config';
import { centerOfMass, strokesToInput, type Stroke } from '../src/preprocess/strokes';
import { inkSpan, model } from './helpers';
import { oval, place, seven, verticalLine } from './shapes';

const shapes: [string, Stroke[]][] = [
  ['oval', oval()],
  ['vertical line', verticalLine()],
  ['seven', seven()],
];

describe('strokesToInput', () => {
  it.each(shapes)('%s: values in [0, 1], centered by mass, spans about 20 px', (_name, shape) => {
    const img = strokesToInput(place(shape, 400, 100, 100))!;
    expect(img.length).toBe(784);
    for (const v of img) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...img)).toBeGreaterThan(0.9);
    const com = centerOfMass(img)!;
    expect(Math.abs(com.x - 14)).toBeLessThan(0.5);
    expect(Math.abs(com.y - 14)).toBeLessThan(0.5);
    const span = inkSpan(img);
    const longer = Math.max(span.w, span.h);
    expect(longer).toBeGreaterThanOrEqual(19);
    expect(longer).toBeLessThanOrEqual(22);
  });

  it.each(shapes)('%s: small, large or off-center drawings give near-identical images', (_name, shape) => {
    const ref = strokesToInput(place(shape, 300, 150, 150))!;
    const variants = [place(shape, 40, 5, 500), place(shape, 590, 10, 10), place(shape, 120, 470, 30)];
    for (const v of variants) {
      const img = strokesToInput(v)!;
      let worst = 0;
      for (let i = 0; i < 784; i++) worst = Math.max(worst, Math.abs(img[i] - ref[i]));
      expect(worst).toBeLessThan(0.02);
    }
  });

  it('returns null for an empty pad', () => {
    expect(strokesToInput([])).toBeNull();
    expect(strokesToInput([[]])).toBeNull();
  });

  it('draws a single tap as a centered dot', () => {
    const img = strokesToInput([[321, 77]])!;
    const com = centerOfMass(img)!;
    expect(Math.abs(com.x - 14)).toBeLessThan(0.5);
    expect(Math.abs(com.y - 14)).toBeLessThan(0.5);
    const span = inkSpan(img);
    expect(span.w).toBeLessThanOrEqual(5);
    expect(span.h).toBeLessThanOrEqual(5);
    expect(img.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('keeps a jittery tap a dot when minExtent is set', () => {
    const img = strokesToInput([[300, 300, 302, 301, 303, 303]], { minExtent: 18 })!;
    expect(inkSpan(img).w).toBeLessThanOrEqual(5);
  });

  it('handles perfectly straight lines (zero-width bounding box)', () => {
    for (const line of [[[50, 10, 50, 500]], [[10, 80, 500, 80]]] as Stroke[][]) {
      const img = strokesToInput(line)!;
      expect(img.every((v) => Number.isFinite(v))).toBe(true);
      const span = inkSpan(img);
      expect(Math.max(span.w, span.h)).toBeGreaterThanOrEqual(19);
      expect(Math.min(span.w, span.h)).toBeLessThanOrEqual(Math.ceil(PREPROCESS.strokeWidth) + 2);
    }
  });
});

describe('synthetic strokes through the real model', () => {
  it.each([
    ['an oval', oval(), 0],
    ['a vertical line', verticalLine(), 1],
    ['a 7-shaped polyline', seven(), 7],
  ] as [string, Stroke[], number][])('%s reads as %#', (_name, shape, digit) => {
    const out = model.forward(strokesToInput(place(shape, 380, 120, 90))!);
    expect(out.prediction).toBe(digit);
  });
});
