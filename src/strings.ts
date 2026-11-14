// Every visitor-facing string. To add a language, copy the `en` object, translate it and add it
// to STRINGS under its code; then open the app with ?lang=<code>. Set dir: 'rtl' for
// right-to-left languages. {placeholders} are filled in by the app.

export interface Strings {
  dir: 'ltr' | 'rtl';
  title: string;
  /** The end of `title` shown in Club Blue (the brand's "payoff words"). Empty for none. */
  titleAccent: string;
  /** Small label above the title. */
  kicker: string;
  /** Club handle and hashtag under the logo, one entry per line. */
  handle: string[];
  clear: string;
  read: string;
  replay: string;
  fullscreen: string;
  padHint: string;
  captions: {
    draw: string;
    pixelate: string;
    flatten: string;
    spotlight: string;
    hidden1: string;
    hidden2: string;
    output: string;
    softmax: string;
    softmaxUnsure: string;
    hold: string;
  };
  layers: { input: string; hidden1: string; hidden2: string; output: string; result: string };
  legend: { positive: string; negative: string; strength: string };
  spot: { title: string; digit: string; weights: string; product: string; sum: string; bias: string; relu: string };
  card: { sure: string; chance: string; unsure: string };
  attract: { cta: string; sub: string };
  staff: {
    paused: string;
    speed: string;
    spotlightOn: string;
    spotlightOff: string;
    step: string;
    debugGuess: string;
    debugSamples: string;
  };
}

const en: Strings = {
  dir: 'ltr',
  title: 'How does an AI read your handwriting?',
  titleAccent: 'your handwriting?',
  kicker: 'Computer Club KFUPM · Live AI demo',
  handle: ['@kfupm_cc', '#MaxThroughput'],
  clear: 'Clear',
  read: 'Read it!',
  replay: 'Replay',
  fullscreen: 'Full screen',
  padHint: 'Draw here',
  captions: {
    draw: 'Draw a digit from 0 to 9, nice and big.',
    pixelate: 'To a computer, your drawing is 28 × 28 = 784 squares of brightness.',
    flatten: 'The grid is unrolled, row by row, into one list of 784 numbers.',
    spotlight:
      'Each neuron multiplies every pixel by a weight and adds it all up. Blue weights push it up, orange weights push it down.',
    hidden1: 'All 64 neurons do this at the same time. Brighter means more active.',
    hidden2: 'The next layer combines those signals.',
    output: 'Each output neuron adds up the evidence for one digit.',
    softmax: "Softmax turns the scores into chances that add up to 100%. I think it's a {digit}!",
    softmaxUnsure: "Softmax turns the scores into chances that add up to 100%. Hmm, I'm not so sure about this one…",
    hold: 'I learned this from 60,000 handwritten examples. Try another digit!',
  },
  layers: {
    input: '784 inputs',
    hidden1: 'hidden 1 (64)',
    hidden2: 'hidden 2 (32)',
    output: 'output (10)',
    result: 'result',
  },
  legend: {
    positive: 'blue weight: pushes up',
    negative: 'orange weight: pushes down',
    strength: 'thicker = stronger',
  },
  spot: {
    title: 'One neuron, up close',
    digit: 'your digit',
    weights: 'its weights',
    product: 'digit × weights',
    sum: 'Add up all 784 products',
    bias: 'Add the bias',
    relu: 'Output (negative becomes 0)',
  },
  card: {
    sure: "It's a",
    chance: '{percent}% sure',
    unsure: 'Hmm… my best guess is {digit} ({percent}%), maybe {second} ({secondPercent}%).',
  },
  attract: {
    cta: 'Draw a digit!',
    sub: 'Touch the screen to start',
  },
  staff: {
    paused: 'Paused',
    speed: 'Speed {speed}×',
    spotlightOn: 'Spotlight scene on',
    spotlightOff: 'Spotlight scene off',
    step: 'Step mode: press → or tap to continue',
    debugGuess: 'live guess',
    debugSamples: 'MNIST examples of this digit',
  },
};

export const STRINGS: Record<string, Strings> = { en };

export function getStrings(lang: string): Strings {
  return STRINGS[lang] ?? STRINGS[lang.split('-')[0]] ?? en;
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}
