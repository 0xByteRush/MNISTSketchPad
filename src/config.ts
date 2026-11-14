// Defaults for timings, colors and budgets. Booth-tunable values can be overridden by URL
// parameters, e.g. ?speed=1.5&spotlight=0&step=1&autorun=1&idle=60&debug=1&lang=en

// Computer Club KFUPM brand palette (Brand Kit v1.0). Orange is kept as the one data color for
// negative weights: the captions and legend teach "blue pushes up, orange pushes down".
export const COLORS = {
  pos: '#337DFE', // positive weight: Club Blue
  neg: '#FF8A3D', // negative weight (data color, not a brand color)
  accent: '#337DFE', // winner: Club Blue
  bg: '#0A0B0D', // Club Black
  panel: '#14171D', // Surface Dark
  outline: '#272C36', // Line Dark
  text: '#FFFFFF',
  dim: '#AEB6C4', // Mist
  neuron: '#475063', // Slate: idle neuron rims, losing score bars
} as const;

export const POS_RGB = [51, 125, 254] as const;
export const NEG_RGB = [255, 138, 61] as const;

/** Canvas fonts. main.ts waits for these to load before the first draw. */
export const FONTS = {
  head: '"Poppins", system-ui, "Segoe UI", Arial, sans-serif',
  body: '"Inter", system-ui, "Segoe UI", Arial, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Consolas, monospace',
} as const;

export type SceneId = 'pixelate' | 'flatten' | 'spotlight' | 'hidden1' | 'hidden2' | 'output' | 'softmax' | 'hold';

/** Scene lengths in seconds at 1x speed. 'hold' has no length. */
export const SCENE_SECONDS: Record<Exclude<SceneId, 'hold'>, number> = {
  pixelate: 0.7,
  flatten: 1.3,
  spotlight: 2.0,
  hidden1: 1.2,
  hidden2: 0.9,
  output: 0.9,
  softmax: 1.0,
};

export const BUDGET = {
  inputEdges: 1500, // strongest input -> hidden 1 connections drawn
  inputPulses: 400,
  spotlightPulses: 160,
  hidden1Pulses: 250,
  outputPulses: 160,
  backdropEdges: 3000, // faint "everything connects" lines, pre-rendered once
} as const;

export const PREPROCESS = {
  /** Stroke width at 28x28 scale. Tune between 2 and 3.5 with the debug overlay (key D). */
  strokeWidth: 2.6,
  supersample: 4,
  box: 20,
} as const;

export const BOOTH = {
  answerIdleSeconds: 30, // answer on screen and nobody touching -> clear
  attractHoldSeconds: 3.5, // how long attract mode rests on each answer
  autorunDelaySeconds: 1.5,
  hedgeBelow: 0.5, // top probability under this -> the card hedges
  maxDpr: 2,
  minFps: 45, // below this the canvas drops to devicePixelRatio 1
} as const;

export interface Config {
  speed: number;
  spotlight: boolean;
  step: boolean;
  autorun: boolean;
  /** Seconds without input before attract mode. 0 disables it. */
  idle: number;
  debug: boolean;
  lang: string;
}

export const DEFAULTS: Config = {
  speed: 1,
  spotlight: true,
  step: false,
  autorun: false,
  idle: 60,
  debug: false,
  lang: 'en',
};

function flag(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

function num(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function loadConfig(search: string): Config {
  const q = new URLSearchParams(search);
  return {
    speed: num(q.get('speed'), DEFAULTS.speed, 0.1, 8),
    spotlight: flag(q.get('spotlight'), DEFAULTS.spotlight),
    step: flag(q.get('step'), DEFAULTS.step),
    autorun: flag(q.get('autorun'), DEFAULTS.autorun),
    idle: num(q.get('idle'), DEFAULTS.idle, 0, 86400),
    debug: flag(q.get('debug'), DEFAULTS.debug),
    lang: q.get('lang') ?? DEFAULTS.lang,
  };
}
