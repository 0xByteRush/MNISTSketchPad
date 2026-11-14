// The DOM overlay: title, buttons, caption, legend, answer card, attract call to action,
// staff badge and toast. All text comes from strings.ts.

import { BOOTH } from '../config';
import { fill, type Strings } from '../strings';

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element ${selector}`);
  return node;
}

export class Ui {
  readonly app = el<HTMLDivElement>('#app');
  readonly stageCanvas = el<HTMLCanvasElement>('#stage');
  readonly padWrap = el<HTMLDivElement>('#pad-wrap');
  readonly padCanvas = el<HTMLCanvasElement>('#pad');
  readonly btnClear = el<HTMLButtonElement>('#btn-clear');
  readonly btnRead = el<HTMLButtonElement>('#btn-read');
  readonly btnReplay = el<HTMLButtonElement>('#btn-replay');
  readonly btnFullscreen = el<HTMLButtonElement>('#btn-fullscreen');
  private readonly buttons = el<HTMLDivElement>('#buttons');
  private readonly caption = el<HTMLParagraphElement>('#caption');
  private readonly card = el<HTMLDivElement>('#card');
  private readonly cardLabel = el<HTMLDivElement>('#card .card-label');
  private readonly cardDigit = el<HTMLDivElement>('#card .card-digit');
  private readonly cardChance = el<HTMLDivElement>('#card .card-chance');
  private readonly cta = el<HTMLDivElement>('#cta');
  private readonly badge = el<HTMLDivElement>('#badge');
  private readonly toast = el<HTMLDivElement>('#toast');

  private captionText = '';
  private cardShown = false;
  private badgeText = '';
  private padOpacity = -1;
  private toastTimer = 0;

  constructor(private readonly s: Strings) {
    document.documentElement.lang = document.documentElement.lang || 'en';
    this.app.dir = s.dir;
    document.title = s.title;
    const title = el('#title');
    const accent = s.titleAccent && s.title.endsWith(s.titleAccent) ? s.titleAccent : '';
    title.textContent = s.title.slice(0, s.title.length - accent.length);
    if (accent) {
      const span = document.createElement('span');
      span.className = 'accent';
      span.textContent = accent;
      title.append(span);
    }
    el('#kicker').textContent = s.kicker;
    el('#club-handle').replaceChildren(
      ...s.handle.map((line) => {
        const div = document.createElement('div');
        div.textContent = line;
        return div;
      }),
    );
    el('#pad-hint').textContent = s.padHint;
    this.btnClear.textContent = s.clear;
    this.btnRead.textContent = s.read;
    this.btnReplay.textContent = s.replay;
    this.btnFullscreen.setAttribute('aria-label', s.fullscreen);
    this.btnFullscreen.title = s.fullscreen;
    el('.legend-pos').textContent = s.legend.positive;
    el('.legend-neg').textContent = s.legend.negative;
    el('.legend-strength').textContent = s.legend.strength;
    el('#cta .cta-main').textContent = s.attract.cta;
    el('#cta .cta-sub').textContent = s.attract.sub;
  }

  setCaption(text: string): void {
    if (text === this.captionText) return;
    this.captionText = text;
    this.caption.textContent = text;
  }

  /** Fill the answer card for a run. A top probability under 50% makes it hedge. */
  setAnswer(probs: Float32Array, winner: number, second: number): void {
    const percent = Math.round(probs[winner] * 100);
    const unsure = probs[winner] < BOOTH.hedgeBelow;
    this.card.classList.toggle('unsure', unsure);
    this.cardDigit.textContent = String(winner);
    if (unsure) {
      this.cardLabel.textContent = fill(this.s.card.unsure, {
        digit: winner,
        percent,
        second,
        secondPercent: Math.round(probs[second] * 100),
      });
      this.cardChance.textContent = '';
    } else {
      this.cardLabel.textContent = this.s.card.sure;
      this.cardChance.textContent = fill(this.s.card.chance, { percent });
    }
  }

  showCard(show: boolean): void {
    if (show === this.cardShown) return;
    this.cardShown = show;
    this.card.classList.toggle('show', show);
  }

  /** Pad visibility: 1 while drawing, fading to 0 as the drawing turns into pixels. */
  setPadOpacity(opacity: number): void {
    const q = Math.round(opacity * 20) / 20;
    if (q === this.padOpacity) return;
    this.padOpacity = q;
    this.padWrap.style.opacity = String(q);
    this.padWrap.style.visibility = q === 0 ? 'hidden' : 'visible';
  }

  setPadActive(active: boolean): void {
    this.padWrap.classList.toggle('off', !active);
  }

  setInked(inked: boolean): void {
    this.padWrap.classList.toggle('inked', inked);
    this.btnRead.disabled = !inked;
  }

  /** 'draw': Clear + Read it!; 'story': Clear + Replay; 'attract': call to action only. */
  setControls(mode: 'draw' | 'story' | 'attract'): void {
    this.buttons.hidden = mode === 'attract';
    this.cta.hidden = mode !== 'attract';
    this.btnRead.hidden = mode !== 'draw';
    this.btnReplay.hidden = mode !== 'story';
  }

  setBadge(text: string): void {
    if (text === this.badgeText) return;
    this.badgeText = text;
    this.badge.textContent = text;
    this.badge.hidden = text === '';
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 1400);
  }
}
