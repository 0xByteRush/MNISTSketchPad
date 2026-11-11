// Everything derived from one prediction, computed once when the visitor presses Read it!.
// One instance is reused for every run, so a full day of runs allocates almost nothing.
// All numbers here are real values from the forward pass (AGENTS.md section 7.2).

import { BUDGET } from '../config';
import { createForward, type Forward, type MLP } from '../model/mlp';
import { createEdgeSet, selectDenseEdges, selectInputEdges, selectNeuronWeights, type EdgeSet } from './edges';

const GAMMA = 0.6; // mild gamma so middle activations stay visible

export function formatNumber(v: number, digits: number): string {
  const s = Math.abs(v).toFixed(digits);
  return v < 0 && Number(s) !== 0 ? `−${s}` : s;
}

export class RunData {
  valid = false;
  readonly fwd: Forward = createForward();

  /** Display brightness per neuron, normalized per layer for this run. */
  readonly bright1 = new Float32Array(64);
  readonly bright2 = new Float32Array(32);
  /** Output scores mapped to 0..1 between the lowest and highest logit (bar length only). */
  readonly logitLevel = new Float32Array(10);

  winner = 0;
  second = 0;

  // Spotlight: the most active neuron of hidden layer 1.
  spot = 0;
  readonly spotProducts = new Float32Array(784); // w_i * x_i
  spotMaxWeight = 1;
  spotMaxProduct = 1;
  /** Running sum of the products after each of the 28 rows; [28] is the full sum. */
  readonly spotPartial = new Float64Array(29);
  readonly spotPartialText: string[] = new Array<string>(29).fill('0.00');
  spotBiasText = '';
  spotOutText = '';

  readonly logitText: string[] = new Array<string>(10).fill('');
  readonly percentText: string[] = new Array<string>(10).fill('');

  readonly edgesIn: EdgeSet = createEdgeSet(BUDGET.inputEdges);
  readonly edgesSpot: EdgeSet = createEdgeSet(784);
  readonly edgesH1: EdgeSet = createEdgeSet(64 * 32);
  readonly edgesOut: EdgeSet = createEdgeSet(32 * 10);
  /** Input pixels ordered by |w * x| into the spotlight neuron (for its pulses). */
  readonly spotPulseOrder = new Int32Array(784);
  spotPulseCount = 0;

  compute(model: MLP, x: ArrayLike<number>): void {
    const f = model.forward(x, this.fwd);
    const [l1, l2, l3] = model.layers;

    normalize(f.a1, this.bright1);
    normalize(f.a2, this.bright2);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 10; i++) {
      lo = Math.min(lo, f.logits[i]);
      hi = Math.max(hi, f.logits[i]);
    }
    for (let i = 0; i < 10; i++) {
      this.logitLevel[i] = hi > lo ? (f.logits[i] - lo) / (hi - lo) : 1;
      this.logitText[i] = formatNumber(f.logits[i], 1);
      this.percentText[i] = `${Math.round(f.probs[i] * 100)}%`;
    }
    this.winner = f.prediction;
    let second = this.winner === 0 ? 1 : 0;
    for (let i = 0; i < 10; i++) if (i !== this.winner && f.probs[i] > f.probs[second]) second = i;
    this.second = second;

    // Spotlight neuron and its real arithmetic.
    let spot = 0;
    for (let j = 1; j < 64; j++) if (f.a1[j] > f.a1[spot]) spot = j;
    this.spot = spot;
    const row = spot * 784;
    let maxW = 0;
    let maxP = 0;
    let sum = 0;
    this.spotPartial[0] = 0;
    for (let i = 0; i < 784; i++) {
      const w = l1.W[row + i];
      const prod = w * f.x[i];
      this.spotProducts[i] = prod;
      sum += prod;
      maxW = Math.max(maxW, Math.abs(w));
      maxP = Math.max(maxP, Math.abs(prod));
      if (i % 28 === 27) this.spotPartial[(i + 1) / 28] = sum;
    }
    this.spotMaxWeight = maxW || 1;
    this.spotMaxProduct = maxP || 1;
    for (let r = 0; r <= 28; r++) this.spotPartialText[r] = formatNumber(this.spotPartial[r], 2);
    const bias = l1.b[spot];
    this.spotBiasText = (bias < 0 ? '− ' : '+ ') + Math.abs(bias).toFixed(2);
    this.spotOutText = formatNumber(f.a1[spot], 2);

    let n = 0;
    for (let i = 0; i < 784; i++) if (this.spotProducts[i] !== 0) this.spotPulseOrder[n++] = i;
    const products = this.spotProducts;
    this.spotPulseOrder.subarray(0, n).sort((a, b) => Math.abs(products[b]) - Math.abs(products[a]));
    this.spotPulseCount = Math.min(n, BUDGET.spotlightPulses);

    selectInputEdges(f.x, l1, this.edgesIn);
    selectNeuronWeights(l1, spot, this.edgesSpot);
    selectDenseEdges(f.a1, l2, this.edgesH1);
    selectDenseEdges(f.a2, l3, this.edgesOut);
    this.valid = true;
  }
}

function normalize(a: Float32Array, out: Float32Array): void {
  let max = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > max) max = a[i];
  for (let i = 0; i < a.length; i++) out[i] = max > 0 ? Math.pow(a[i] / max, GAMMA) : 0;
}
