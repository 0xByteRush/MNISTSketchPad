// Drawing pad: Pointer Events (mouse, touch, pen) with pointer capture, one pointer at a time.
// Strokes are recorded as point lists in pad coordinates; the model input is re-rendered from
// those points (preprocess/strokes.ts), never read back from this canvas. The ink drawn here
// is for display only.

import type { Stroke } from '../preprocess/strokes';

export interface PadEvents {
  onStrokeStart(): void;
  onStrokeEnd(): void;
  /** Ink appeared or was cleared. */
  onChange(): void;
}

const BRUSH = 0.07; // brush width as a fraction of the pad width
const MIN_STEP = 1.5; // ignore moves shorter than this (pad units)

export class Pad {
  readonly strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private pointerId = -1;
  private enabled = true;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** Side length in pad units (design pixels). */
    readonly size: number,
    private readonly events: PadEvents,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('lostpointercapture', this.onUp);
  }

  get hasInk(): boolean {
    return this.strokes.length > 0;
  }

  get drawing(): boolean {
    return this.current !== null;
  }

  /** Set the backing-store resolution: device pixels per pad unit. */
  setResolution(k: number): void {
    const px = Math.max(1, Math.round(this.size * k));
    this.canvas.width = px;
    this.canvas.height = px;
    this.scale = px / this.size;
    this.redraw();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.endStroke();
  }

  clear(): void {
    this.endStroke();
    const had = this.strokes.length > 0;
    this.strokes.length = 0;
    this.redraw();
    if (had) this.events.onChange();
  }

  private style(): void {
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = this.size * BRUSH;
    c.strokeStyle = '#fff';
    c.fillStyle = '#fff';
  }

  private redraw(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.style();
    for (const s of this.strokes) {
      const n = s.length / 2;
      if (n === 1) {
        this.dot(s[0], s[1]);
        continue;
      }
      // Smooth ink: quadratic curves through the midpoints between samples.
      c.beginPath();
      c.moveTo(s[0], s[1]);
      for (let i = 1; i < n - 1; i++) {
        c.quadraticCurveTo(s[i * 2], s[i * 2 + 1], (s[i * 2] + s[i * 2 + 2]) / 2, (s[i * 2 + 1] + s[i * 2 + 3]) / 2);
      }
      c.lineTo(s[n * 2 - 2], s[n * 2 - 1]);
      c.stroke();
    }
  }

  private dot(x: number, y: number): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, (this.size * BRUSH) / 2, 0, Math.PI * 2);
    c.fill();
  }

  /** Draw only the newest piece of the current stroke. */
  private extend(s: Stroke): void {
    const c = this.ctx;
    const n = s.length / 2;
    if (n === 1) {
      this.dot(s[0], s[1]);
      return;
    }
    const x1 = s[n * 2 - 4];
    const y1 = s[n * 2 - 3];
    const mx = (x1 + s[n * 2 - 2]) / 2;
    const my = (y1 + s[n * 2 - 1]) / 2;
    c.beginPath();
    if (n === 2) {
      c.moveTo(x1, y1);
      c.lineTo(mx, my);
    } else {
      c.moveTo((s[n * 2 - 6] + x1) / 2, (s[n * 2 - 5] + y1) / 2);
      c.quadraticCurveTo(x1, y1, mx, my);
    }
    c.stroke();
  }

  private addPoint(clientX: number, clientY: number): void {
    const s = this.current;
    if (!s) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((clientX - rect.left) / rect.width) * this.size;
    const y = ((clientY - rect.top) / rect.height) * this.size;
    const n = s.length;
    if (n >= 2 && Math.hypot(x - s[n - 2], y - s[n - 1]) < MIN_STEP) return;
    s.push(x, y);
    this.extend(s);
  }

  private endStroke(): void {
    const s = this.current;
    if (!s) return;
    this.current = null;
    const id = this.pointerId;
    this.pointerId = -1;
    try {
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    } catch {
      // the pointer is already gone
    }
    const n = s.length / 2;
    if (n >= 2) {
      // Finish the curve from the last midpoint to the last point.
      const c = this.ctx;
      c.beginPath();
      c.moveTo((s[n * 2 - 4] + s[n * 2 - 2]) / 2, (s[n * 2 - 3] + s[n * 2 - 1]) / 2);
      c.lineTo(s[n * 2 - 2], s[n * 2 - 1]);
      c.stroke();
    }
    this.events.onStrokeEnd();
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    // One pointer at a time: extra fingers are ignored.
    if (!this.enabled || this.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events have no capturable pointer
    }
    this.current = [];
    const first = this.strokes.length === 0;
    this.strokes.push(this.current);
    this.style();
    this.events.onStrokeStart();
    this.addPoint(e.clientX, e.clientY);
    if (first) this.events.onChange();
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.current || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const batch = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (batch.length > 0) for (const ev of batch) this.addPoint(ev.clientX, ev.clientY);
    else this.addPoint(e.clientX, e.clientY);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.endStroke();
  };
}
