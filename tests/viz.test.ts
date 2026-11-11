import { describe, expect, it } from 'vitest';
import { BUDGET, SCENE_SECONDS, loadConfig } from '../src/config';
import { RunData } from '../src/viz/run';
import { Timeline } from '../src/viz/timeline';
import { fixtureInput, model } from './helpers';

describe('timeline', () => {
  it('plays all scenes in about 8 s and ends on hold', () => {
    const total = Object.values(SCENE_SECONDS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(8, 1);
    const tl = new Timeline();
    tl.start(true, false);
    let t = 0;
    while (!tl.atHold && t < 20) {
      tl.update(1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(7.9);
    expect(t).toBeLessThan(8.2);
    expect(tl.p('softmax')).toBe(1);
  });

  it('runs about 6 s without the spotlight and never reports spotlight progress', () => {
    const tl = new Timeline();
    tl.start(false, false);
    let t = 0;
    while (!tl.atHold && t < 20) {
      tl.update(1 / 60);
      expect(tl.p('spotlight')).toBe(0);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(5.9);
    expect(t).toBeLessThan(6.2);
  });

  it('skip, speed, pause and step mode', () => {
    const tl = new Timeline();
    tl.start(true, false);
    tl.update(0.3);
    tl.skip();
    expect(tl.atHold).toBe(true);

    tl.start(true, false);
    tl.speed = 2;
    tl.update(0.35);
    expect(tl.scene).toBe('flatten');
    tl.paused = true;
    tl.update(5);
    expect(tl.scene).toBe('flatten');

    tl.start(true, true);
    tl.update(5);
    expect(tl.scene).toBe('pixelate');
    expect(tl.waiting).toBe(true);
    expect(tl.p('pixelate')).toBe(1);
    tl.next();
    expect(tl.scene).toBe('flatten');
    expect(tl.waiting).toBe(false);

    tl.reset();
    expect(tl.active).toBe(false);
    tl.update(1);
    tl.skip();
    tl.next();
    expect(tl.active).toBe(false);
  });
});

describe('run data', () => {
  const run = new RunData();
  run.compute(model, fixtureInput(0));
  const f = run.fwd;
  const l1 = model.layers[0];

  it('spotlights the most active hidden-1 neuron with real arithmetic', () => {
    expect(f.a1[run.spot]).toBe(Math.max(...f.a1));
    expect(run.spotPartial[28] + l1.b[run.spot]).toBeCloseTo(f.z1[run.spot], 3);
    expect(run.spotPartialText[28]).toBe(run.spotPartial[28].toFixed(2).replace('-', '−'));
  });

  it('draws only the strongest input connections, from inked pixels, strongest first', () => {
    const e = run.edgesIn;
    expect(e.n).toBeLessThanOrEqual(BUDGET.inputEdges);
    expect(e.n).toBeGreaterThan(100);
    expect(e.strength[0]).toBeCloseTo(1, 5);
    for (let k = 0; k < e.n; k++) {
      expect(f.x[e.from[k]]).toBeGreaterThan(0.05);
      if (k > 0) expect(e.strength[k]).toBeLessThanOrEqual(e.strength[k - 1]);
      expect(e.sign[k]).toBe(l1.W[e.to[k] * 784 + e.from[k]] >= 0 ? 1 : -1);
    }
  });

  it('normalizes brightness per layer and keeps ReLU-zeroed neurons dark', () => {
    expect(Math.max(...run.bright1)).toBeCloseTo(1, 5);
    expect(Math.max(...run.bright2)).toBeCloseTo(1, 5);
    for (let j = 0; j < 64; j++) if (f.z1[j] <= 0) expect(run.bright1[j]).toBe(0);
    expect(run.winner).toBe(f.prediction);
    expect(run.second).not.toBe(run.winner);
  });
});

describe('config', () => {
  it('reads URL parameter overrides', () => {
    const c = loadConfig('?speed=1.5&spotlight=0&step=1&autorun=1&idle=20&debug=1&lang=en');
    expect(c).toEqual({ speed: 1.5, spotlight: false, step: true, autorun: true, idle: 20, debug: true, lang: 'en' });
    expect(loadConfig('?speed=banana').speed).toBe(1);
    expect(loadConfig('').spotlight).toBe(true);
  });
});
