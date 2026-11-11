// Chooses which connections to draw (AGENTS.md section 7.3). Computed once per run.
// Which edges are drawn is an approximation; their sign and relative strength are real.

import type { Layer } from '../model/mlp';

export interface EdgeSet {
  /** Number of edges in use; sorted strongest first. */
  n: number;
  from: Int32Array;
  to: Int32Array;
  /** |w * activation| relative to the strongest edge of the set, 0..1. */
  strength: Float32Array;
  sign: Int8Array;
}

export function createEdgeSet(capacity: number): EdgeSet {
  return {
    n: 0,
    from: new Int32Array(capacity),
    to: new Int32Array(capacity),
    strength: new Float32Array(capacity),
    sign: new Int8Array(capacity),
  };
}

// Scratch space for ranking, sized for the largest layer (64 x 784) and reused across runs.
const score = new Float32Array(64 * 784);
const order = new Int32Array(64 * 784);
const byScore = (a: number, b: number): number => score[b] - score[a];

function rank(layer: Layer, input: Float32Array, minInput: number, out: EdgeSet): void {
  const { W, units, inputs } = layer;
  let n = 0;
  let max = 0;
  for (let i = 0; i < inputs; i++) {
    const v = input[i];
    if (v <= minInput) continue;
    for (let j = 0; j < units; j++) {
      const id = j * inputs + i;
      const s = Math.abs(W[id] * v);
      score[id] = s;
      order[n++] = id;
      if (s > max) max = s;
    }
  }
  order.subarray(0, n).sort(byScore);
  const count = Math.min(n, out.from.length);
  const norm = max > 0 ? 1 / max : 0;
  for (let k = 0; k < count; k++) {
    const id = order[k];
    out.from[k] = id % inputs;
    out.to[k] = (id / inputs) | 0;
    out.strength[k] = score[id] * norm;
    out.sign[k] = W[id] >= 0 ? 1 : -1;
  }
  out.n = count;
}

/** Input -> hidden 1: the strongest |w * x| connections over inked pixels only. */
export function selectInputEdges(x: Float32Array, layer1: Layer, out: EdgeSet): void {
  rank(layer1, x, 0.05, out);
}

/** A dense layer drawn completely: every connection from an active input, strongest first. */
export function selectDenseEdges(activations: Float32Array, layer: Layer, out: EdgeSet): void {
  rank(layer, activations, 0, out);
}

/** All 784 weights into one hidden-1 neuron; strength is |w| relative to its largest weight. */
export function selectNeuronWeights(layer1: Layer, neuron: number, out: EdgeSet): void {
  const { W, inputs } = layer1;
  const row = neuron * inputs;
  let max = 0;
  for (let i = 0; i < inputs; i++) max = Math.max(max, Math.abs(W[row + i]));
  const norm = max > 0 ? 1 / max : 0;
  for (let i = 0; i < inputs; i++) {
    out.from[i] = i;
    out.to[i] = neuron;
    out.strength[i] = Math.abs(W[row + i]) * norm;
    out.sign[i] = W[row + i] >= 0 ? 1 : -1;
  }
  out.n = inputs;
}
