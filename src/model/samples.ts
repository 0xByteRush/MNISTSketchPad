// Bundled MNIST test digits (3 per class): attract mode plays the story on them and the debug
// overlay shows them next to the processed drawing.

import { decodeBytes } from './mlp';
import samplesJson from './samples.json';

export interface Sample {
  label: number;
  /** 784 values in [0, 1], ink = 1. */
  pixels: Float32Array;
}

export const SAMPLES: Sample[] = (samplesJson as { samples: { label: number; pixels: string }[] }).samples.map((s) => {
  const bytes = decodeBytes(s.pixels);
  const pixels = new Float32Array(784);
  for (let i = 0; i < 784; i++) pixels[i] = bytes[i] / 255;
  return { label: s.label, pixels };
});
