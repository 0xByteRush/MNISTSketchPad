// Forward pass of the 784 -> 64 -> 32 -> 10 network in plain TypeScript.
// Weights file contract: AGENTS.md section 5.3. W is [units, inputs], row-major (PyTorch layout).

export interface LayerFile {
  name: string;
  units: number;
  activation: string;
  W: string;
  b: string;
}

export interface ModelFile {
  format: string;
  layers: LayerFile[];
  metrics?: { test_accuracy?: number };
}

export interface Layer {
  name: string;
  units: number;
  inputs: number;
  /** Row j = incoming weights of neuron j. */
  W: Float32Array;
  b: Float32Array;
}

/** Everything the animation needs from one forward pass. */
export interface Forward {
  x: Float32Array; // 784 input pixels
  z1: Float32Array; // 64 weighted sums + bias
  a1: Float32Array; // 64 after ReLU
  z2: Float32Array; // 32
  a2: Float32Array; // 32
  logits: Float32Array; // 10
  probs: Float32Array; // 10
  prediction: number;
}

export function decodeBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** base64 of little-endian float32 -> Float32Array (correct on any host byte order). */
export function decodeFloat32(b64: string): Float32Array {
  const bytes = decodeBytes(b64);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length >> 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export function createForward(): Forward {
  return {
    x: new Float32Array(784),
    z1: new Float32Array(64),
    a1: new Float32Array(64),
    z2: new Float32Array(32),
    a2: new Float32Array(32),
    logits: new Float32Array(10),
    probs: new Float32Array(10),
    prediction: 0,
  };
}

function affine(layer: Layer, input: Float32Array, out: Float32Array): void {
  const { W, b, units, inputs } = layer;
  for (let j = 0; j < units; j++) {
    let sum = b[j];
    const row = j * inputs;
    for (let i = 0; i < inputs; i++) sum += W[row + i] * input[i];
    out[j] = sum;
  }
}

function relu(z: Float32Array, a: Float32Array): void {
  for (let i = 0; i < z.length; i++) a[i] = z[i] > 0 ? z[i] : 0;
}

export function softmax(logits: Float32Array, out: Float32Array): void {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    out[i] = Math.exp(logits[i] - max);
    sum += out[i];
  }
  for (let i = 0; i < logits.length; i++) out[i] /= sum;
}

export class MLP {
  readonly layers: [Layer, Layer, Layer];

  constructor(file: ModelFile) {
    if (file.format !== 'mnist-mlp/v1') throw new Error(`Unknown model format: ${file.format}`);
    if (file.layers.length !== 3) throw new Error('Expected 3 layers');
    let inputs = 784;
    const layers = file.layers.map((spec) => {
      const W = decodeFloat32(spec.W);
      const b = decodeFloat32(spec.b);
      if (W.length !== spec.units * inputs || b.length !== spec.units) {
        throw new Error(`Layer ${spec.name}: weights do not match ${spec.units} x ${inputs}`);
      }
      const layer: Layer = { name: spec.name, units: spec.units, inputs, W, b };
      inputs = spec.units;
      return layer;
    });
    this.layers = layers as [Layer, Layer, Layer];
    const sizes = this.layers.map((l) => l.units).join('/');
    if (sizes !== '64/32/10') throw new Error(`Expected layer sizes 64/32/10, got ${sizes}`);
  }

  /** Runs the network on 784 values in [0, 1] (ink = 1). Reuses `out` when given. */
  forward(x: ArrayLike<number>, out: Forward = createForward()): Forward {
    if (x.length !== 784) throw new Error('Input must have 784 values');
    out.x.set(x);
    const [l1, l2, l3] = this.layers;
    affine(l1, out.x, out.z1);
    relu(out.z1, out.a1);
    affine(l2, out.a1, out.z2);
    relu(out.z2, out.a2);
    affine(l3, out.a2, out.logits);
    softmax(out.logits, out.probs);
    let best = 0;
    for (let i = 1; i < 10; i++) if (out.probs[i] > out.probs[best]) best = i;
    out.prediction = best;
    return out;
  }
}
