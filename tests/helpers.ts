import { MLP, decodeBytes, type ModelFile } from '../src/model/mlp';
import modelJson from '../src/model/mnist-mlp.json';
import parityJson from './fixtures/parity.json';

export const modelFile = modelJson as ModelFile;
export const model = new MLP(modelFile);

interface ParityFile {
  count: number;
  images: string;
  labels: number[];
  probs: number[][];
}

const parityFile = parityJson as ParityFile;
export const parity = {
  count: parityFile.count,
  images: decodeBytes(parityFile.images), // uint8, count * 784
  labels: parityFile.labels,
  probs: parityFile.probs,
};

/** Fixture digit n as model input (values in [0, 1]). */
export function fixtureInput(n: number): Float32Array {
  const x = new Float32Array(784);
  for (let i = 0; i < 784; i++) x[i] = parity.images[n * 784 + i] / 255;
  return x;
}

/** Deterministic random numbers for tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Width and height of the inked bounding box of a 28x28 image. */
export function inkSpan(img: Float32Array, threshold = 0.1): { w: number; h: number } {
  let minX = 28, minY = 28, maxX = -1, maxY = -1;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 28; x++) {
      if (img[y * 28 + x] > threshold) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}
