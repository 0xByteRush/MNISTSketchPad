// The story's scene state machine. It only tracks time; the renderer draws any frame as a pure
// function of (scene, progress), so skip, replay, step and Clear can interrupt at any frame.

import { SCENE_SECONDS, type SceneId } from '../config';

const FULL: SceneId[] = ['pixelate', 'flatten', 'spotlight', 'hidden1', 'hidden2', 'output', 'softmax', 'hold'];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class Timeline {
  scenes: SceneId[] = [];
  /** Index into scenes, or -1 when no story is running. */
  index = -1;
  /** Seconds spent in the current scene, in 1x units. */
  t = 0;
  speed = 1;
  paused = false;
  stepMode = false;
  /** Step mode: the current scene has finished and waits for next(). */
  waiting = false;
  /** Real seconds spent on the final answer. */
  holdSeconds = 0;

  start(spotlight: boolean, stepMode: boolean): void {
    this.scenes = spotlight ? FULL : FULL.filter((s) => s !== 'spotlight');
    this.index = 0;
    this.t = 0;
    this.stepMode = stepMode;
    this.waiting = false;
    this.paused = false;
    this.holdSeconds = 0;
  }

  reset(): void {
    this.index = -1;
    this.t = 0;
    this.waiting = false;
    this.paused = false;
    this.holdSeconds = 0;
  }

  get active(): boolean {
    return this.index >= 0;
  }

  get scene(): SceneId | null {
    return this.index >= 0 ? this.scenes[this.index] : null;
  }

  get atHold(): boolean {
    return this.scene === 'hold';
  }

  private duration(): number {
    const s = this.scene;
    return s === null || s === 'hold' ? Infinity : SCENE_SECONDS[s];
  }

  /** Advance by real seconds. */
  update(dt: number): void {
    if (!this.active || this.paused) return;
    if (this.atHold) {
      this.holdSeconds += dt;
      return;
    }
    if (this.waiting) return;
    this.t += dt * this.speed;
    while (!this.atHold && this.t >= this.duration()) {
      if (this.stepMode) {
        this.t = this.duration();
        this.waiting = true;
        return;
      }
      this.t -= this.duration();
      this.index++;
    }
    if (this.atHold) this.t = 0;
  }

  /** Jump to the start of the next scene (also continues from a step-mode wait). */
  next(): void {
    if (!this.active || this.atHold) return;
    this.index++;
    this.t = 0;
    this.waiting = false;
  }

  /** Jump straight to the answer. */
  skip(): void {
    if (!this.active) return;
    this.index = this.scenes.length - 1;
    this.t = 0;
    this.waiting = false;
    this.paused = false;
  }

  /** Progress of a scene: 0 before it (or if it is not part of this run), 0..1 during, 1 after. */
  p(scene: SceneId): number {
    if (this.index < 0) return 0;
    const i = this.scenes.indexOf(scene);
    if (i < 0 || i > this.index) return 0;
    if (i < this.index || scene === 'hold') return 1;
    return clamp01(this.t / SCENE_SECONDS[scene as Exclude<SceneId, 'hold'>]);
  }

  is(scene: SceneId): boolean {
    return this.scene === scene;
  }
}
