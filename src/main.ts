// Bootstrap and the app state machine: draw -> story (scenes 2-9) -> draw, plus attract mode.

import './style.css';
import { BOOTH, loadConfig, type SceneId } from './config';
import { MLP, createForward, type ModelFile } from './model/mlp';
import modelJson from './model/mnist-mlp.json';
import { SAMPLES } from './model/samples';
import { Pad } from './pad/pad';
import { strokesToInput } from './preprocess/strokes';
import { fill, getStrings } from './strings';
import { DebugOverlay } from './ui/debug';
import { Ui } from './ui/dom';
import { installGuards } from './ui/guards';
import { DESIGN_H, DESIGN_W, PAD } from './viz/layout';
import { RunData } from './viz/run';
import { Stage } from './viz/stage';
import { Timeline } from './viz/timeline';

type Mode = 'draw' | 'story' | 'attract';

const config = loadConfig(location.search);
const strings = getStrings(config.lang);
const model = new MLP(modelJson as ModelFile);
const ui = new Ui(strings);
const stage = new Stage(ui.stageCanvas, strings);
const tl = new Timeline();
const run = new RunData();
const debug = new DebugOverlay(document.querySelector<HTMLElement>('#debug')!, strings);
const debugForward = createForward();
const input = new Float32Array(784);

let mode: Mode = 'draw';
let lastInput = performance.now();
let autorunAt = 0;
let attractIndex = Math.floor(Math.random() * SAMPLES.length);
let dprCap: number = BOOTH.maxDpr;
let dpr = 1;

const pad = new Pad(ui.padCanvas, PAD.size, {
  onStrokeStart() {
    autorunAt = 0;
    lastInput = performance.now();
  },
  onStrokeEnd() {
    lastInput = performance.now();
    if (config.autorun) autorunAt = lastInput + BOOTH.autorunDelaySeconds * 1000;
    if (debug.visible) refreshDebugInput();
  },
  onChange() {
    ui.setInked(pad.hasInk);
  },
});

// ---- state transitions -------------------------------------------------------------------

function begin(pixels: ArrayLike<number>, next: Mode): void {
  run.compute(model, pixels);
  stage.prepareRun(run);
  ui.setAnswer(run.fwd.probs, run.winner, run.second);
  mode = next;
  autorunAt = 0;
  pad.setEnabled(false);
  ui.setPadActive(false);
  ui.setControls(next === 'attract' ? 'attract' : 'story');
  tl.speed = config.speed;
  tl.start(config.spotlight, config.step && next !== 'attract');
  if (debug.visible) debug.setInput(run.fwd.x, run.fwd.probs, run.winner);
}

/** Read it!: the prediction is computed right here; the animation only presents it. */
function readIt(): void {
  if (mode !== 'draw') return;
  // Anything smaller than 3% of the pad is a tap: keep it a dot rather than blowing it up.
  const pixels = strokesToInput(pad.strokes, { minExtent: PAD.size * 0.03 }, input);
  if (!pixels) return;
  begin(pixels, 'story');
}

function replay(): void {
  if (mode !== 'story' || !run.valid) return;
  tl.speed = config.speed;
  tl.start(config.spotlight, config.step);
}

function clear(): void {
  mode = 'draw';
  autorunAt = 0;
  tl.reset();
  run.valid = false;
  pad.clear();
  pad.setEnabled(true);
  ui.setPadActive(true);
  ui.setInked(false);
  ui.setControls('draw');
  if (debug.visible) refreshDebugInput();
}

function startAttract(): void {
  if (SAMPLES.length === 0) return;
  pad.clear();
  // Step through the samples with a stride coprime to their count, so digits vary.
  attractIndex = (attractIndex + 7) % SAMPLES.length;
  begin(SAMPLES[attractIndex].pixels, 'attract');
}

function refreshDebugInput(): void {
  const pixels = mode === 'draw' ? strokesToInput(pad.strokes, { minExtent: PAD.size * 0.03 }) : run.fwd.x;
  if (!pixels) {
    debug.setInput(null, null, -1);
    return;
  }
  const f = mode === 'draw' ? model.forward(pixels, debugForward) : run.fwd;
  debug.setInput(pixels, f.probs, f.prediction);
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

function setSpeed(speed: number): void {
  config.speed = speed;
  tl.speed = speed;
  ui.showToast(fill(strings.staff.speed, { speed }));
}

// ---- input ---------------------------------------------------------------------------------

ui.btnClear.addEventListener('click', clear);
ui.btnRead.addEventListener('click', readIt);
ui.btnReplay.addEventListener('click', replay);
ui.btnFullscreen.addEventListener('click', toggleFullscreen);

window.addEventListener(
  'pointerdown',
  (e) => {
    lastInput = performance.now();
    if (mode === 'attract') {
      // Any touch leaves attract mode for a clean pad.
      clear();
      e.preventDefault();
      return;
    }
    const onControl = e.target instanceof Element && e.target.closest('button') !== null;
    if (mode === 'story' && !tl.atHold && !onControl) {
      // Tap the stage: skip to the answer (step mode: advance one scene).
      if (tl.stepMode) tl.next();
      else tl.skip();
    }
  },
  { capture: true },
);

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  lastInput = performance.now();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  switch (key) {
    case ' ':
      if (mode !== 'draw' && !tl.atHold) tl.paused = !tl.paused;
      break;
    case 'ArrowRight':
      if (mode !== 'draw') tl.next();
      break;
    case 'r':
      replay();
      break;
    case 'c':
      clear();
      break;
    case 'f':
      toggleFullscreen();
      break;
    case '1':
      setSpeed(0.5);
      break;
    case '2':
      setSpeed(1);
      break;
    case '3':
      setSpeed(2);
      break;
    case 's':
      config.spotlight = !config.spotlight;
      ui.showToast(config.spotlight ? strings.staff.spotlightOn : strings.staff.spotlightOff);
      break;
    case 'd':
      debug.setVisible(!debug.visible);
      if (debug.visible) refreshDebugInput();
      break;
    case 'a':
      startAttract();
      break;
    case 'Enter':
      readIt();
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ---- layout --------------------------------------------------------------------------------

function fit(): void {
  const u = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
  const ox = (window.innerWidth - DESIGN_W * u) / 2;
  const oy = (window.innerHeight - DESIGN_H * u) / 2;
  ui.app.style.transform = `translate(${ox}px, ${oy}px) scale(${u})`;
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  stage.resize(u * dpr);
  pad.setResolution(u * dpr);
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', fit);

// ---- frame loop ----------------------------------------------------------------------------

let raf = 0;
let last = 0;
let fps = 60;
let slowFrames = 0;
let statsAt = 0;
let captionMode: Mode | null = null;
let captionScene: SceneId | null = null;

function captionFor(): string {
  const c = strings.captions;
  const scene = tl.scene;
  if (mode === 'draw' || scene === null) return c.draw;
  if (scene === 'softmax') {
    return run.fwd.probs[run.winner] < BOOTH.hedgeBelow ? c.softmaxUnsure : fill(c.softmax, { digit: run.winner });
  }
  return c[scene];
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.08;

  tl.update(dt);

  // Booth behavior.
  if (mode === 'draw') {
    if (autorunAt && now >= autorunAt && !pad.drawing) readIt();
    else if (config.idle > 0 && !pad.drawing && now - lastInput > config.idle * 1000) startAttract();
  } else if (mode === 'story') {
    const idleMs = BOOTH.answerIdleSeconds * 1000;
    if (tl.atHold && tl.holdSeconds * 1000 > idleMs && now - lastInput > idleMs) clear();
  } else if (tl.atHold && tl.holdSeconds > BOOTH.attractHoldSeconds) {
    startAttract();
  }

  // Automatic quality drop: if the story cannot hold the frame rate at high pixel density,
  // fall back to devicePixelRatio 1 for the rest of the session.
  if (dprCap > 1 && dpr > 1 && mode !== 'draw' && !tl.atHold && !tl.paused && !tl.waiting) {
    slowFrames = dt > 1 / BOOTH.minFps ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 40) {
      dprCap = 1;
      slowFrames = 0;
      fit();
    }
  }

  // DOM overlay, touched only when something changes.
  if (mode !== captionMode || tl.scene !== captionScene) {
    captionMode = mode;
    captionScene = tl.scene;
    ui.setCaption(captionFor());
  }
  ui.showCard(mode !== 'draw' && (tl.atHold || tl.p('softmax') > 0.55));
  ui.setPadOpacity(mode === 'draw' ? 1 : 1 - Math.min(1, tl.p('pixelate') * 1.6));
  ui.setBadge(mode === 'draw' ? '' : tl.paused ? strings.staff.paused : tl.waiting ? strings.staff.step : '');
  if (debug.visible && now - statsAt > 500) {
    statsAt = now;
    debug.setStats(fps, dpr, mode, tl.scene ?? '');
  }

  stage.draw(mode === 'draw' ? null : run, tl);
}

function startLoop(): void {
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

// Pause when the tab is hidden; resume without a time jump.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(raf);
  else {
    lastInput = performance.now();
    startLoop();
  }
});

installGuards();
debug.setVisible(config.debug);
ui.setControls('draw');
ui.setInked(false);
fit();
startLoop();
