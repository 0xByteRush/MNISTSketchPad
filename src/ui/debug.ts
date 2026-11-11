// Staff debug overlay (key D): fps, the processed 28x28 the model actually sees, MNIST samples
// of the predicted class for comparison, and the probabilities. Use it to tune
// PREPROCESS.strokeWidth: the processed digit should look like the samples.

import { SAMPLES } from '../model/samples';
import type { Strings } from '../strings';

function pixelCanvas(className: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 28;
  c.height = 28;
  c.className = className;
  return c;
}

function paint(canvas: HTMLCanvasElement, pixels: ArrayLike<number> | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(28, 28);
  for (let i = 0; i < 784; i++) {
    const g = pixels ? Math.round(pixels[i] * 255) : 0;
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export class DebugOverlay {
  private readonly root: HTMLElement;
  private readonly fpsLine = document.createElement('div');
  private readonly input = pixelCanvas('input');
  private readonly samples = [pixelCanvas('sample'), pixelCanvas('sample'), pixelCanvas('sample')];
  private readonly probs = document.createElement('div');
  private readonly note = document.createElement('div');
  visible = false;

  constructor(root: HTMLElement, private readonly s: Strings) {
    this.root = root;
    const row = document.createElement('div');
    row.className = 'row';
    this.probs.className = 'probs';
    this.note.className = 'note';
    row.append(this.input, ...this.samples, this.probs);
    root.append(this.fpsLine, row, this.note);
    this.setInput(null, null, -1);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.hidden = !visible;
  }

  setStats(fps: number, dpr: number, mode: string, scene: string): void {
    this.fpsLine.textContent = `${fps.toFixed(0)} fps · dpr ${dpr} · ${mode}${scene ? ' · ' + scene : ''}`;
  }

  setInput(pixels: Float32Array | null, probs: Float32Array | null, prediction: number): void {
    paint(this.input, pixels);
    const ofClass = prediction >= 0 ? SAMPLES.filter((x) => x.label === prediction) : [];
    this.samples.forEach((canvas, i) => paint(canvas, ofClass[i]?.pixels ?? null));
    if (!probs) {
      this.probs.textContent = '';
      this.note.textContent = `${this.s.staff.debugGuess}: –`;
      return;
    }
    let text = '';
    for (let d = 0; d < 10; d++) {
      const p = probs[d];
      text += `${d} ${(p * 100).toFixed(1).padStart(5)}% ${'█'.repeat(Math.round(p * 10))}\n`;
    }
    this.probs.textContent = text;
    this.note.textContent = `${this.s.staff.debugGuess}: ${prediction} · ${this.s.staff.debugSamples} →`;
  }
}
