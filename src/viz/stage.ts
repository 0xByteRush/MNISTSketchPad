// The stage canvas: draws any frame of the story as a pure function of (run data, timeline).
//
// Performance rules (AGENTS.md section 7.4):
//  - static parts (node outlines, backdrop) are pre-rendered once per resize;
//  - each run's connection lines are pre-rendered once into small per-layer canvases, batched
//    into color x opacity buckets (one stroke() per bucket), then blitted every frame;
//  - the frame loop only blits layers and draws moving parts, and allocates nothing.

import { BUDGET, COLORS, FONTS, NEG_RGB, POS_RGB } from '../config';
import type { Strings } from '../strings';
import type { EdgeSet } from './edges';
import { BAND, BARS, DESIGN_H, DESIGN_W, H1, H2, LABEL_Y, OUT, PAD, RESULT_X, STRIP, h1x, h1y, h2y, outy, stripCellY } from './layout';
import type { RunData } from './run';
import type { Timeline } from './timeline';

const F_LABEL = `400 22px ${FONTS.mono}`;
const F_SMALL = `500 21px ${FONTS.body}`;
const F_OUT = `600 26px ${FONTS.head}`;
const F_SCORE = `600 22px ${FONTS.body}`;
const F_SPOT_TITLE = `700 30px ${FONTS.head}`;
const F_SPOT_ROW = `500 25px ${FONTS.body}`;
const F_SPOT_NUM = `700 44px ${FONTS.head}`;
const F_SPOT_OUT = `700 58px ${FONTS.head}`;
const F_OP = `600 40px ${FONTS.head}`;

const BUCKETS = 8;
const enum Group {
  In,
  H1,
  Out,
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function easeOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic pseudo-random numbers, so every booth shows the same backdrop and jitter. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Palettes are built once, so the frame loop never builds a color string.
const ACT: string[] = []; // neuron fill by activation: dark -> white
const GRAY: string[] = []; // input pixel brightness
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  ACT.push(`rgb(${Math.round(lerp(20, 255, t))},${Math.round(lerp(23, 255, t))},${Math.round(lerp(29, 255, t))})`);
  GRAY.push(`rgb(${i},${i},${i})`);
}
const COUNT: string[] = [];
for (let i = 0; i <= 784; i++) COUNT.push(String(i));
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const JITTER = new Float32Array(1024);
{
  const rnd = mulberry32(7);
  for (let i = 0; i < JITTER.length; i++) JITTER[i] = rnd();
}

interface EdgeLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  x0: number;
  w: number;
}

interface PulseGroup {
  n: number;
  travel: number;
  x0: Float32Array;
  y0: Float32Array;
  x1: Float32Array;
  y1: Float32Array;
  size: Float32Array;
  sign: Int8Array;
  delay: Float32Array;
}

function pulseGroup(capacity: number): PulseGroup {
  return {
    n: 0,
    travel: 0.55,
    x0: new Float32Array(capacity),
    y0: new Float32Array(capacity),
    x1: new Float32Array(capacity),
    y1: new Float32Array(capacity),
    size: new Float32Array(capacity),
    sign: new Int8Array(capacity),
    delay: new Float32Array(capacity),
  };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

function glowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const size = 64;
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** A tiny pixel image (28x28 or 1x784) that is filled once per run and blitted scaled. */
class PixelImage {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor(w: number, h: number) {
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas);
    this.image = this.ctx.createImageData(w, h);
    const d = this.image.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
  }

  set(i: number, r: number, g: number, b: number): void {
    const d = this.image.data;
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
  }

  commit(): void {
    this.ctx.putImageData(this.image, 0, 0);
  }
}

export class Stage {
  private readonly ctx: CanvasRenderingContext2D;
  /** Device pixels per design pixel. */
  private k = 1;
  private readonly staticLayer = makeCanvas(1, 1);
  private readonly layerIn: EdgeLayer;
  private readonly layerSpot: EdgeLayer;
  private readonly layerH1: EdgeLayer;
  private readonly layerOut: EdgeLayer;

  private readonly spritePos = glowSprite(POS_RGB[0], POS_RGB[1], POS_RGB[2]);
  private readonly spriteNeg = glowSprite(NEG_RGB[0], NEG_RGB[1], NEG_RGB[2]);
  private readonly spriteWhite = glowSprite(255, 255, 255);
  private readonly spriteAccent = glowSprite(51, 125, 254);

  private readonly digitImg = new PixelImage(28, 28);
  private readonly weightImg = new PixelImage(28, 28);
  private readonly productImg = new PixelImage(28, 28);
  private readonly stripImg = new PixelImage(1, 784);

  private readonly pulsesIn = pulseGroup(BUDGET.inputPulses);
  private readonly pulsesSpot = pulseGroup(BUDGET.spotlightPulses);
  private readonly pulsesH1 = pulseGroup(BUDGET.hidden1Pulses);
  private readonly pulsesOut = pulseGroup(BUDGET.outputPulses);

  private lastRun: RunData | null = null;
  // Scratch for edge endpoints.
  private ax = 0;
  private ay = 0;
  private bx = 0;
  private by = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly strings: Strings,
  ) {
    this.ctx = ctx2d(canvas);
    const layer = (x0: number, x1: number): EdgeLayer => {
      const c = makeCanvas(1, 1);
      return { canvas: c, ctx: ctx2d(c), x0, w: x1 - x0 };
    };
    this.layerIn = layer(STRIP.x + STRIP.w, H1.x + H1.zig);
    this.layerSpot = layer(STRIP.x + STRIP.w, H1.x + H1.zig);
    this.layerH1 = layer(H1.x - H1.zig, H2.x);
    this.layerOut = layer(H2.x, OUT.x);
  }

  /** Call on start and whenever the window size or pixel ratio changes. */
  resize(k: number): void {
    this.k = k;
    this.canvas.width = Math.round(DESIGN_W * k);
    this.canvas.height = Math.round(DESIGN_H * k);
    this.staticLayer.width = this.canvas.width;
    this.staticLayer.height = this.canvas.height;
    for (const l of [this.layerIn, this.layerSpot, this.layerH1, this.layerOut]) {
      l.canvas.width = Math.max(1, Math.round(l.w * k));
      l.canvas.height = Math.max(1, Math.round((BAND.y1 - BAND.y0) * k));
    }
    this.renderStatic();
    if (this.lastRun?.valid) this.renderRunLayers(this.lastRun);
  }

  /** Call once per run, right after RunData.compute(). */
  prepareRun(run: RunData): void {
    this.lastRun = run;
    const f = run.fwd;
    for (let i = 0; i < 784; i++) {
      const v = f.x[i];
      const g = Math.round(v * 255);
      this.digitImg.set(i, g, g, g);
      const s = Math.pow(v, 0.8);
      this.stripImg.set(i, Math.round(lerp(17, 255, s)), Math.round(lerp(23, 255, s)), Math.round(lerp(36, 255, s)));
      const strength = run.edgesSpot.strength[i];
      tint(this.weightImg, i, run.edgesSpot.sign[i], Math.pow(strength, 0.75));
      const prod = run.spotProducts[i];
      tint(this.productImg, i, prod >= 0 ? 1 : -1, Math.pow(Math.abs(prod) / run.spotMaxProduct, 0.6));
    }
    this.digitImg.commit();
    this.stripImg.commit();
    this.weightImg.commit();
    this.productImg.commit();

    this.fillPulses(this.pulsesIn, Group.In, run.edgesIn, BUDGET.inputPulses, 0, 0.35, 0.55);
    this.fillPulses(this.pulsesH1, Group.H1, run.edgesH1, BUDGET.hidden1Pulses, 0, 0.35, 0.55);
    this.fillPulses(this.pulsesOut, Group.Out, run.edgesOut, BUDGET.outputPulses, 0, 0.35, 0.55);
    // Spotlight pulses: the pixels that contribute most to the spotlight neuron.
    const g = this.pulsesSpot;
    g.n = run.spotPulseCount;
    g.travel = 0.4;
    for (let k = 0; k < g.n; k++) {
      const i = run.spotPulseOrder[k];
      const prod = run.spotProducts[i];
      this.endpoints(Group.In, i, run.spot);
      g.x0[k] = this.ax;
      g.y0[k] = this.ay;
      g.x1[k] = this.bx;
      g.y1[k] = this.by;
      g.size[k] = Math.sqrt(Math.abs(prod) / run.spotMaxProduct);
      g.sign[k] = prod >= 0 ? 1 : -1;
      g.delay[k] = 0.12 + 0.3 * JITTER[k];
    }
    this.renderRunLayers(run);
  }

  private endpoints(group: Group, from: number, to: number): void {
    if (group === Group.In) {
      this.ax = STRIP.x + STRIP.w + 2;
      this.ay = stripCellY(from);
      this.bx = h1x[to] - H1.r;
      this.by = h1y[to];
    } else if (group === Group.H1) {
      this.ax = h1x[from] + H1.r;
      this.ay = h1y[from];
      this.bx = H2.x - H2.r;
      this.by = h2y[to];
    } else {
      this.ax = H2.x + H2.r;
      this.ay = h2y[from];
      this.bx = OUT.x - OUT.r;
      this.by = outy[to];
    }
  }

  private fillPulses(g: PulseGroup, group: Group, set: EdgeSet, max: number, delay0: number, spread: number, travel: number): void {
    const n = Math.min(set.n, max);
    let used = 0;
    for (let k = 0; k < n; k++) {
      if (set.strength[k] < 0.02) break; // sorted: the rest are weaker still
      this.endpoints(group, set.from[k], set.to[k]);
      g.x0[used] = this.ax;
      g.y0[used] = this.ay;
      g.x1[used] = this.bx;
      g.y1[used] = this.by;
      g.size[used] = Math.sqrt(set.strength[k]);
      g.sign[used] = set.sign[k];
      g.delay[used] = delay0 + spread * JITTER[(k * 7 + group * 131) % JITTER.length];
      used++;
    }
    g.n = used;
    g.travel = travel;
  }

  // ---- pre-rendering -------------------------------------------------------------------

  private renderStatic(): void {
    const c = ctx2d(this.staticLayer);
    const k = this.k;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, DESIGN_W, DESIGN_H);

    // Pad box (the live drawing pad is a DOM element on top of this while drawing).
    c.fillStyle = '#000';
    roundRect(c, PAD.x, PAD.y, PAD.size, PAD.size, 18);
    c.fill();
    c.strokeStyle = COLORS.outline;
    c.lineWidth = 2;
    c.stroke();

    // Faint "everything connects" backdrop.
    const rnd = mulberry32(42);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(174,182,196,0.045)';
    c.beginPath();
    for (let n = 0; n < BUDGET.backdropEdges; n++) {
      this.endpoints(Group.In, Math.floor(rnd() * 784), Math.floor(rnd() * 64));
      c.moveTo(this.ax, this.ay);
      c.lineTo(this.bx, this.by);
    }
    c.stroke();
    c.strokeStyle = 'rgba(174,182,196,0.04)';
    c.beginPath();
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 32; j++) {
        this.endpoints(Group.H1, i, j);
        c.moveTo(this.ax, this.ay);
        c.lineTo(this.bx, this.by);
      }
    }
    c.stroke();
    c.strokeStyle = 'rgba(174,182,196,0.07)';
    c.beginPath();
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 10; j++) {
        this.endpoints(Group.Out, i, j);
        c.moveTo(this.ax, this.ay);
        c.lineTo(this.bx, this.by);
      }
    }
    c.stroke();

    // Input strip.
    c.fillStyle = COLORS.panel;
    c.fillRect(STRIP.x, STRIP.y, STRIP.w, STRIP.h);
    c.strokeStyle = COLORS.outline;
    c.lineWidth = 1.5;
    c.strokeRect(STRIP.x - 2, STRIP.y - 2, STRIP.w + 4, STRIP.h + 4);

    // Neuron outlines.
    c.fillStyle = ACT[0];
    c.strokeStyle = COLORS.neuron;
    c.lineWidth = 1.2;
    for (let j = 0; j < H1.n; j++) circle(c, h1x[j], h1y[j], H1.r);
    for (let j = 0; j < H2.n; j++) circle(c, H2.x, h2y[j], H2.r);
    c.lineWidth = 2;
    for (let j = 0; j < OUT.n; j++) circle(c, OUT.x, outy[j], OUT.r);
    c.font = F_OUT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = COLORS.dim;
    for (let j = 0; j < OUT.n; j++) c.fillText(DIGITS[j], OUT.x, outy[j] + 1);

    // Layer labels (the input label is drawn per frame: it doubles as the 0 -> 784 counter).
    c.font = F_LABEL;
    c.fillStyle = COLORS.dim;
    c.fillText(this.strings.layers.hidden1, H1.x, LABEL_Y);
    c.fillText(this.strings.layers.hidden2, H2.x, LABEL_Y);
    c.fillText(this.strings.layers.output, OUT.x + 30, LABEL_Y);
    c.fillText(this.strings.layers.result, RESULT_X, LABEL_Y);
  }

  private renderRunLayers(run: RunData): void {
    this.renderEdges(this.layerIn, Group.In, run.edgesIn, 0.08, 0.75, 2.2, -1, false);
    this.renderEdges(this.layerSpot, Group.In, run.edgesSpot, 0.05, 0.9, 2.4, -1, false);
    this.renderEdges(this.layerH1, Group.H1, run.edgesH1, 0.03, 0.8, 2.4, -1, false);
    // Hidden 2 -> output: all connections, with the ones into the winning digit emphasized.
    this.renderEdges(this.layerOut, Group.Out, run.edgesOut, 0.03, 0.4, 2.0, run.winner, true);
    this.renderEdges(this.layerOut, Group.Out, run.edgesOut, 0.25, 1, 4, run.winner, false, false);
  }

  /**
   * Draws an edge set into its layer, batched into sign x strength buckets: one stroke() each.
   * `onlyTo` >= 0 restricts to edges into that neuron (or all but that neuron when `invert`).
   */
  private renderEdges(
    layer: EdgeLayer,
    group: Group,
    set: EdgeSet,
    alphaMin: number,
    alphaMax: number,
    widthMax: number,
    onlyTo: number,
    invert: boolean,
    clear = true,
  ): void {
    const c = layer.ctx;
    const k = this.k;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (clear) c.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    c.setTransform(k, 0, 0, k, -layer.x0 * k, -BAND.y0 * k);
    c.lineCap = 'round';
    for (let sign = 1; sign >= -1; sign -= 2) {
      c.strokeStyle = sign > 0 ? COLORS.pos : COLORS.neg;
      for (let b = 1; b <= BUCKETS; b++) {
        const level = b / BUCKETS;
        c.globalAlpha = alphaMin + (alphaMax - alphaMin) * Math.pow(level, 1.6);
        c.lineWidth = 0.5 + widthMax * level;
        c.beginPath();
        let any = false;
        for (let e = 0; e < set.n; e++) {
          if (set.sign[e] !== sign) continue;
          if (onlyTo >= 0 && (set.to[e] === onlyTo) === invert) continue;
          const s = set.strength[e];
          if (s < 0.004) continue;
          if (Math.min(BUCKETS, Math.ceil(Math.sqrt(s) * BUCKETS)) !== b) continue;
          this.endpoints(group, set.from[e], set.to[e]);
          c.moveTo(this.ax, this.ay);
          c.lineTo(this.bx, this.by);
          any = true;
        }
        if (any) c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  // ---- per frame ------------------------------------------------------------------------

  draw(run: RunData | null, tl: Timeline): void {
    const c = this.ctx;
    const k = this.k;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, DESIGN_W, DESIGN_H);
    c.drawImage(this.staticLayer, 0, 0, DESIGN_W, DESIGN_H);

    const story = run !== null && run.valid && tl.active;
    const pFlat = story ? tl.p('flatten') : 0;
    let arrived = -1;

    if (story) {
      const inSpot = tl.is('spotlight');
      const pSpot = tl.p('spotlight');
      const pH1 = tl.p('hidden1');
      const pH2 = tl.p('hidden2');
      const pOut = tl.p('output');
      const pSoft = tl.p('softmax');

      arrived = this.drawInput(run, tl.p('pixelate'), pFlat, pH1, inSpot);
      if (inSpot) this.drawSpotlightPanel(run, pSpot);

      // Connection layers: wipe in left to right with the pulses, then settle a little dimmer.
      if (inSpot) this.blit(this.layerSpot, smooth(clamp01((pSpot - 0.04) / 0.3)), 1 - 0.6 * clamp01((pSpot - 0.9) / 0.1));
      this.blit(this.layerIn, smooth(clamp01(pH1 / 0.55)), 1 - 0.4 * pH2);
      this.blit(this.layerH1, smooth(clamp01(pH2 / 0.55)), 1 - 0.35 * pOut);
      this.blit(this.layerOut, smooth(clamp01(pOut / 0.55)), 1);

      c.globalCompositeOperation = 'lighter';
      if (inSpot) this.drawPulses(this.pulsesSpot, pSpot);
      this.drawPulses(this.pulsesIn, pH1);
      this.drawPulses(this.pulsesH1, pH2);
      this.drawPulses(this.pulsesOut, pOut);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;

      // The spotlight neuron lights up at the end of its scene and stays lit.
      const spotLit = clamp01((pSpot - 0.84) / 0.12);
      this.drawHidden(h1x, 0, h1y, H1.r, H1.n, run.bright1, run.fwd.z1, pH1, run.spot, spotLit);
      this.drawHidden(null, H2.x, h2y, H2.r, H2.n, run.bright2, run.fwd.z2, pH2, -1, 0);
      if (inSpot) {
        c.strokeStyle = COLORS.accent;
        c.lineWidth = 2.5;
        c.globalAlpha = smooth(clamp01(pSpot / 0.15));
        c.beginPath();
        c.arc(h1x[run.spot], h1y[run.spot], H1.r + 5, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      }
      this.drawOutput(run, pOut, pSoft);
    }

    // Input label; during the flatten it is the 0 -> 784 counter.
    c.font = F_LABEL;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (story && arrived >= 0 && pFlat > 0 && pFlat < 1) {
      c.fillStyle = COLORS.text;
      c.fillText(COUNT[arrived], STRIP.x + STRIP.w / 2, LABEL_Y);
    } else {
      c.fillStyle = COLORS.dim;
      c.fillText(this.strings.layers.input, STRIP.x + STRIP.w / 2, LABEL_Y);
    }
  }

  /** The 28x28 grid in the pad area, the rows flying into the strip, and the strip itself. */
  private drawInput(run: RunData, pPix: number, pFlat: number, pH1: number, inSpot: boolean): number {
    const c = this.ctx;
    const cs = PAD.size / 28;
    c.imageSmoothingEnabled = false;

    // Grid: fades in over the ink (pixelate), dims to a ghost while rows fly out, then returns.
    if (!inSpot) {
      const base = pFlat <= 0 ? easeOut(pPix) : pFlat < 1 ? lerp(1, 0.22, clamp01(pFlat * 4)) : lerp(0.22, 0.9, clamp01(pH1 * 3 + (pH1 >= 1 ? 1 : 0)));
      if (base > 0) {
        c.globalAlpha = base;
        c.drawImage(this.digitImg.canvas, PAD.x, PAD.y, PAD.size, PAD.size);
        // Cell borders, flashing briefly as the drawing snaps to the grid.
        c.globalAlpha = Math.min(1, base * (0.1 + 0.3 * Math.sin(Math.PI * pPix)));
        c.strokeStyle = COLORS.dim;
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 1; i < 28; i++) {
          c.moveTo(PAD.x + i * cs, PAD.y);
          c.lineTo(PAD.x + i * cs, PAD.y + PAD.size);
          c.moveTo(PAD.x, PAD.y + i * cs);
          c.lineTo(PAD.x + PAD.size, PAD.y + i * cs);
        }
        c.stroke();
        c.globalAlpha = 1;
      }
    }

    // Flatten: rows peel off top to bottom; each cell travels from its grid square to its strip cell.
    let arrived = 0;
    let rowsDone = 0;
    if (pFlat > 0 && pFlat < 1) {
      const x = run.fwd.x;
      for (let r = 0; r < 28; r++) {
        const q = clamp01((pFlat - r * 0.02) / 0.44);
        if (q >= 1) {
          rowsDone = r + 1;
          arrived += 28;
          continue;
        }
        if (q <= 0) {
          // Rows that have not started yet stay in the grid at full brightness.
          c.drawImage(this.digitImg.canvas, 0, r, 28, 28 - r, PAD.x, PAD.y + r * cs, PAD.size, (28 - r) * cs);
          break;
        }
        arrived += Math.floor(q * 28);
        const e = smooth(q);
        // The row's outline, so the peel is visible even where the row is all black.
        const rowX = lerp(PAD.x, STRIP.x, e);
        const rowY = lerp(PAD.y + r * cs, STRIP.y + r * 28, e);
        const rowW = lerp(PAD.size, STRIP.w, e);
        const rowH = lerp(cs, 28, e);
        c.globalAlpha = 0.5;
        c.fillStyle = COLORS.outline;
        c.fillRect(rowX, rowY, rowW, rowH);
        c.globalAlpha = 1;
        for (let col = 0; col < 28; col++) {
          const v = x[r * 28 + col];
          if (v < 0.03) continue;
          c.fillStyle = GRAY[Math.round(v * 255)];
          c.fillRect(
            lerp(PAD.x + col * cs, STRIP.x, e),
            lerp(PAD.y + r * cs, STRIP.y + r * 28 + col, e),
            lerp(cs, STRIP.w, e),
            lerp(cs, 1.5, e),
          );
        }
      }
    } else if (pFlat >= 1) {
      rowsDone = 28;
      arrived = 784;
    }
    if (rowsDone > 0) {
      const cells = rowsDone * 28;
      c.drawImage(this.stripImg.canvas, 0, 0, 1, cells, STRIP.x, STRIP.y, STRIP.w, cells);
    }
    c.imageSmoothingEnabled = true;
    return arrived;
  }

  /** Scene 4: digit x weight image = contribution map -> sum + bias -> ReLU, with real numbers. */
  private drawSpotlightPanel(run: RunData, p: number): void {
    const c = this.ctx;
    const s = this.strings.spot;
    const a = smooth(clamp01(p / 0.1));
    const left = PAD.x + 40;
    const right = PAD.x + PAD.size - 40;
    const img = 150;
    const gap = 45;
    const top = PAD.y + 92;

    c.globalAlpha = a;
    c.fillStyle = COLORS.panel;
    roundRect(c, PAD.x, PAD.y, PAD.size, PAD.size, 18);
    c.fill();

    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = F_SPOT_TITLE;
    c.fillStyle = COLORS.text;
    c.fillText(s.title, left, PAD.y + 46);

    c.imageSmoothingEnabled = false;
    c.drawImage(this.digitImg.canvas, left, top, img, img);
    c.drawImage(this.weightImg.canvas, left + img + gap, top, img, img);
    // The contribution map fills in row by row while the sum counts up.
    const q = clamp01((p - 0.25) / 0.45);
    const rows = Math.floor(q * 28 + 1e-6);
    const px = left + 2 * (img + gap);
    c.fillStyle = '#000';
    c.fillRect(px, top, img, img);
    if (rows > 0) c.drawImage(this.productImg.canvas, 0, 0, 28, rows, px, top, img, (img * rows) / 28);
    c.imageSmoothingEnabled = true;

    c.strokeStyle = COLORS.outline;
    c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) c.strokeRect(left + i * (img + gap), top, img, img);

    c.textAlign = 'center';
    c.font = F_OP;
    c.fillStyle = COLORS.text;
    c.fillText('×', left + img + gap / 2, top + img / 2);
    c.fillText('=', left + 2 * img + gap * 1.5, top + img / 2);
    c.font = F_SMALL;
    c.fillStyle = COLORS.dim;
    c.fillText(s.digit, left + img / 2, top + img + 24);
    c.fillText(s.weights, left + img + gap + img / 2, top + img + 24);
    c.fillText(s.product, px + img / 2, top + img + 24);

    // Sum, bias, ReLU.
    const y1 = PAD.y + 358;
    const y2 = PAD.y + 428;
    const y3 = PAD.y + 530;
    c.textAlign = 'left';
    c.font = F_SPOT_ROW;
    c.fillStyle = COLORS.text;
    c.fillText(s.sum, left, y1);
    c.textAlign = 'right';
    c.font = F_SPOT_NUM;
    c.fillText(run.spotPartialText[rows], right, y1);

    const aBias = a * smooth(clamp01((p - 0.72) / 0.08));
    if (aBias > 0) {
      c.globalAlpha = aBias;
      c.textAlign = 'left';
      c.font = F_SPOT_ROW;
      c.fillText(s.bias, left, y2);
      c.textAlign = 'right';
      c.font = F_SPOT_NUM;
      c.fillText(run.spotBiasText, right, y2);
    }
    const aOut = a * smooth(clamp01((p - 0.84) / 0.08));
    if (aOut > 0) {
      c.globalAlpha = aOut;
      c.strokeStyle = COLORS.outline;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(left, y2 + 44);
      c.lineTo(right, y2 + 44);
      c.stroke();
      c.textAlign = 'left';
      c.font = F_SPOT_ROW;
      c.fillStyle = COLORS.text;
      c.fillText(s.relu, left, y3);
      c.textAlign = 'right';
      c.font = F_SPOT_OUT;
      c.fillStyle = COLORS.accent;
      c.fillText(run.spotOutText, right, y3);
    }
    c.globalAlpha = 1;
  }

  private blit(layer: EdgeLayer, reveal: number, alpha: number): void {
    if (reveal <= 0 || alpha <= 0) return;
    const sw = Math.max(1, Math.round(layer.canvas.width * reveal));
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.drawImage(layer.canvas, 0, 0, sw, layer.canvas.height, layer.x0, BAND.y0, (sw / layer.canvas.width) * layer.w, BAND.y1 - BAND.y0);
    c.globalAlpha = 1;
  }

  /** Glowing dots travelling along the strongest connections. Additive blending is already on. */
  private drawPulses(g: PulseGroup, p: number): void {
    if (p <= 0 || p >= 1) return;
    const c = this.ctx;
    const inv = 1 / g.travel;
    for (let i = 0; i < g.n; i++) {
      const q = (p - g.delay[i]) * inv;
      if (q <= 0 || q >= 1) continue;
      const e = smooth(q);
      const size = 7 + 15 * g.size[i];
      const fade = Math.min(1, q * 8) * Math.min(1, (1 - q) * 6);
      const sprite = g.sign[i] > 0 ? this.spritePos : this.spriteNeg;
      const x = lerp(g.x0[i], g.x1[i], e);
      const y = lerp(g.y0[i], g.y1[i], e);
      c.globalAlpha = (0.35 + 0.65 * g.size[i]) * fade;
      c.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      // A short tail.
      const e2 = smooth(Math.max(0, q - 0.07));
      c.globalAlpha *= 0.45;
      c.drawImage(sprite, lerp(g.x0[i], g.x1[i], e2) - size / 2, lerp(g.y0[i], g.y1[i], e2) - size / 2, size, size);
    }
  }

  /** A hidden layer lighting up: brightness = activation; ReLU-zeroed neurons flash an orange rim. */
  private drawHidden(
    xs: Float32Array | null,
    xConst: number,
    ys: Float32Array,
    r: number,
    n: number,
    bright: Float32Array,
    z: Float32Array,
    p: number,
    special: number,
    specialLit: number,
  ): void {
    if (p <= 0 && specialLit <= 0) return;
    const c = this.ctx;
    for (let j = 0; j < n; j++) {
      let rv = smooth(clamp01((p - 0.5 - 0.12 * JITTER[j + 300]) / 0.3));
      if (j === special && specialLit > rv) rv = specialLit;
      if (rv <= 0) continue;
      const x = xs ? xs[j] : xConst;
      const y = ys[j];
      const level = bright[j] * rv;
      c.fillStyle = ACT[Math.round(level * 255)];
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      if (z[j] <= 0 && rv < 1) {
        c.globalAlpha = Math.sin(Math.PI * rv);
        c.strokeStyle = COLORS.neg;
        c.lineWidth = 2.5;
        c.stroke();
        c.globalAlpha = 1;
      }
    }
    c.globalCompositeOperation = 'lighter';
    for (let j = 0; j < n; j++) {
      let rv = smooth(clamp01((p - 0.5 - 0.12 * JITTER[j + 300]) / 0.3));
      if (j === special && specialLit > rv) rv = specialLit;
      const level = bright[j] * rv;
      if (level < 0.15) continue;
      const size = r * 5;
      c.globalAlpha = 0.45 * level;
      c.drawImage(this.spriteWhite, (xs ? xs[j] : xConst) - size / 2, ys[j] - size / 2, size, size);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  /** Output neurons with score bars (scene 7) that morph into probability bars (scene 8). */
  private drawOutput(run: RunData, pOut: number, pSoft: number): void {
    if (pOut <= 0) return;
    const c = this.ctx;
    const f = run.fwd;
    const morph = smooth(clamp01(pSoft / 0.6));
    const win = smooth(clamp01((pSoft - 0.45) / 0.35));

    if (win > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.75 * win;
      const size = OUT.r * 6;
      c.drawImage(this.spriteAccent, OUT.x - size / 2, outy[run.winner] - size / 2, size, size);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }

    c.textBaseline = 'middle';
    for (let j = 0; j < OUT.n; j++) {
      const rv = smooth(clamp01((pOut - 0.5 - 0.1 * JITTER[j + 500]) / 0.3));
      if (rv <= 0) continue;
      const y = outy[j];
      const level = lerp(run.logitLevel[j], Math.pow(f.probs[j], 0.6), morph) * rv;
      const isWinner = j === run.winner && win > 0;
      c.fillStyle = ACT[Math.round(level * 255)];
      c.beginPath();
      c.arc(OUT.x, y, OUT.r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = isWinner ? COLORS.accent : COLORS.neuron;
      c.lineWidth = isWinner ? 2 + 3 * win : 2;
      c.stroke();
      c.font = F_OUT;
      c.textAlign = 'center';
      c.fillStyle = level > 0.55 ? COLORS.bg : COLORS.text;
      c.fillText(DIGITS[j], OUT.x, y + 1);

      // Bar: score length (relative to this run's lowest and highest score) -> probability.
      const len = lerp(run.logitLevel[j], f.probs[j], morph) * BARS.maxLen * rv;
      c.fillStyle = isWinner ? COLORS.accent : COLORS.neuron;
      c.fillRect(BARS.x, y - BARS.h / 2, Math.max(1.5, len), BARS.h);
      c.font = F_SCORE;
      c.textAlign = 'left';
      const tx = BARS.x + len + 10;
      if (morph < 1) {
        c.globalAlpha = rv * (1 - morph);
        c.fillStyle = COLORS.text;
        c.fillText(run.logitText[j], tx, y + 1);
      }
      if (morph > 0) {
        c.globalAlpha = morph;
        c.fillStyle = isWinner ? COLORS.accent : COLORS.text;
        c.fillText(run.percentText[j], tx, y + 1);
      }
      c.globalAlpha = 1;
    }
  }
}

function tint(img: PixelImage, i: number, sign: number, t: number): void {
  const rgb = sign >= 0 ? POS_RGB : NEG_RGB;
  img.set(i, Math.round(rgb[0] * t), Math.round(rgb[1] * t), Math.round(rgb[2] * t));
}

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
