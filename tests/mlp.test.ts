import { describe, expect, it } from 'vitest';
import { softmax } from '../src/model/mlp';
import { fixtureInput, model, modelFile, parity } from './helpers';

describe('model file', () => {
  it('has layer sizes 784/64/32/10', () => {
    const [l1, l2, l3] = model.layers;
    expect([l1.inputs, l1.units, l2.units, l3.units]).toEqual([784, 64, 32, 10]);
    expect(l1.W.length).toBe(64 * 784);
    expect(l2.W.length).toBe(32 * 64);
    expect(l3.W.length).toBe(10 * 32);
  });

  it('reports at least 97% MNIST test accuracy', () => {
    expect(modelFile.metrics?.test_accuracy ?? 0).toBeGreaterThanOrEqual(0.97);
  });
});

describe('forward pass', () => {
  it('matches PyTorch on the 200 parity digits within 1e-4 per probability', () => {
    expect(parity.count).toBe(200);
    let worst = 0;
    for (let n = 0; n < parity.count; n++) {
      const out = model.forward(fixtureInput(n));
      for (let d = 0; d < 10; d++) worst = Math.max(worst, Math.abs(out.probs[d] - parity.probs[n][d]));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('classifies the parity digits like the labels say', () => {
    let right = 0;
    for (let n = 0; n < parity.count; n++) if (model.forward(fixtureInput(n)).prediction === parity.labels[n]) right++;
    expect(right / parity.count).toBeGreaterThanOrEqual(0.95);
  });

  it('returns every intermediate the animation needs', () => {
    const out = model.forward(fixtureInput(0));
    expect([out.x.length, out.z1.length, out.a1.length, out.z2.length, out.a2.length, out.logits.length, out.probs.length]).toEqual(
      [784, 64, 64, 32, 32, 10, 10],
    );
    for (let j = 0; j < 64; j++) expect(out.a1[j]).toBe(Math.max(0, out.z1[j]));
    expect(out.probs[out.prediction]).toBe(Math.max(...out.probs));
  });

  it('softmax sums to 1, also for huge logits', () => {
    const out = model.forward(fixtureInput(3));
    expect(out.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    const big = new Float32Array(10).fill(1000);
    big[4] = 1010;
    const p = new Float32Array(10);
    softmax(big, p);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(p.every((v) => Number.isFinite(v))).toBe(true);
  });
});
