# MNIST Booth Demo: brief for the coding agent

This file is the context for building the project. Read all of it before writing code. It's a greenfield project: nothing exists yet except this file. The decisions below are deliberate. If you change one, update this file in the same commit and say why.

## 1. What we're building

A web app for an exhibition booth. A visitor draws a digit (0–9) with a finger, pen or mouse, and a short animation shows how a small neural network turns that drawing into an answer:

**drawing → 28×28 pixels → a vector of 784 numbers → hidden layer 1 → hidden layer 2 → 10 scores → softmax → "It's a 7 (94%)"**

The model is real, so any drawing gets a genuine prediction. The animation is the main event. The app must set up with one command on any machine, run offline, and respond instantly.

## 2. Priorities

Use these, in order, to settle trade-offs:

1. **Booth-proof.** One command to set up, no network at runtime, touch-friendly, never stalls or needs a reload during a full day.
2. **The animated story.** Clear, smooth (60 fps), short (about 8 s), with the sign and size of weights obvious at a glance.
3. **Believable predictions** for normally written digits. Good preprocessing matters more than a bigger model.
4. **Faithful links and timing are secondary.** Which connections are drawn, and when pulses fire, may be approximated (§7.2). Any number shown as a value must still be real.
5. **Simplicity.** Few dependencies, plain code someone else can maintain.

## 3. The visitor story

| # | Scene | On screen | Time (1×) | Caption (default, in `strings.ts`) |
|---|---|---|---|---|
| 1 | Draw | A clearly marked, glowing pad with a faint guide square. White ink on black, like MNIST. | visitor | Draw a digit from 0 to 9, nice and big. |
| 2 | Pixelate | The drawing snaps into the actual model input: a 28×28 grid of gray squares. | 0.7 s | To a computer, your drawing is 28 × 28 = 784 squares of brightness. |
| 3 | Flatten | Rows peel off top to bottom and stack into one tall strip of 784 cells. A counter runs 0 → 784. | 1.3 s | The grid is unrolled, row by row, into one list of 784 numbers. |
| 4 | Spotlight: one neuron | All 784 lines converge on one hidden neuron, colored by weight. A panel shows your digit × the neuron's weight image = contribution map → sum + bias → ReLU, with the real numbers counting up. | 2.0 s | Each neuron multiplies every pixel by a weight and adds it all up. Blue weights push it up, orange weights push it down. |
| 5 | Hidden layer 1 | Pulses sweep from the strip into all 64 neurons. Each lights up by its activation; neurons zeroed by ReLU stay dark. | 1.2 s | All 64 neurons do this at the same time. Brighter means more active. |
| 6 | Hidden layer 2 | The same, 64 → 32. | 0.9 s | The next layer combines those signals. |
| 7 | Output scores | Pulses into the 10 output neurons; each shows its score (logit). | 0.9 s | Each output neuron adds up the evidence for one digit. |
| 8 | Softmax and answer | Scores morph into probability bars, the winner glows, a big answer card appears. | 1.0 s | Softmax turns the scores into chances that add up to 100%. I think it's a {digit}! |
| 9 | Hold | The answer stays, with Replay and Clear. | until tap or idle | I learned this from 60,000 handwritten examples. Try another digit! |

- The prediction is computed the moment the visitor presses **Read it!** (well under 5 ms). The animation only presents it.
- Total is about 8 s at 1×, about 6 s with the spotlight turned off. Tapping the stage during scenes 2–8 skips to the answer (in step mode, a tap advances one scene).
- Any scribble (a letter, a heart, a dot) still gets a best guess; never refuse. If the top probability is below 50%, the card hedges: "Hmm… my best guess is 4 (41%), maybe 9 (33%)."

## 4. Screen layout

Landscape 16:9 first (a 1920×1080 booth display). It must also work at 1280×720 and on a laptop with a mouse. Layers flow left to right.

```
+--------------------------------------------------------------------------------------+
| How does an AI read your handwriting?                                  [fullscreen]  |
|                                                                                      |
| +------------------------+    #       o                     0 o ==                   |
| |                        |    #       o           o         1 o =         +--------+ |
| |      DRAWING PAD       |    #       o           o         2 o           |        | |
| |   -> 28x28 pixels      |    #       o           o         3 o           |   7    | |
| |   -> spotlight panel   |    #       :           :           :           |  94%   | |
| |                        |    #       o           o         7 o ========  |        | |
| |                        |    #       o           o         8 o =         +--------+ |
| +------------------------+    #       o                     9 o                      |
|  [ Clear ]  [ Read it! ]     784   hidden 1    hidden 2     output          result   |
|                                      (64)        (32)        (10)                    |
| Caption for the current scene ...                     legend: blue +w / orange -w    |
+--------------------------------------------------------------------------------------+
```

- The pad area is reused: drawing (scene 1) → 28×28 grid (scene 2) → spotlight panel (scene 4).
- Captions sit in a bar along the bottom. The weight-color legend is always visible.
- Readable from 2 m away: captions ≥ 28 px and the answer digit ≥ 160 px at 1080p.
- Dark theme; glowing pulses read best on dark. A portrait/tablet layout is nice-to-have.
- The 784-cell strip is about 1 px per cell at 1080p. That's fine: it reads like a barcode, and the lit cells are what matter.

## 5. Model

### 5.1 Decision

Train our own tiny fully connected network (MLP) once and commit its weights to the repo (about 200 KB). Don't use a CNN, and don't fetch a model at runtime.

Why: ready-made MNIST models are mostly CNNs, whose internals don't match the "every pixel connects to every neuron" story, and they bring their own preprocessing conventions. A dense network's real weights can be drawn directly. Booth Wi-Fi can't be trusted.

Fallback, only if you can't train in your environment: fetch an existing pretrained fully connected MNIST model, convert it to the format in §5.3, and record its source, license and preprocessing in the file's metadata.

### 5.2 Architecture and training

- **784 → 64 (ReLU) → 32 (ReLU) → 10 (softmax).** Hidden layers stay ≤ 64 so every neuron can be drawn. If accuracy falls short, fix preprocessing and augmentation before making the network wider.
- **Input contract:** 28×28, row-major, values in [0, 1], ink = 1, background = 0. No mean/std normalization, so the pixel brightness a visitor sees is exactly the input.
- **`training/train.py`** (Python 3 + PyTorch CPU; dev-only, never needed to run the app):
  - torchvision MNIST (auto-download into `training/data/`, git-ignored), fixed seed, Adam, batch 128, about 15 epochs.
  - Augmentation for hand-drawn input: small random rotation (±12°), scale (0.85–1.15), shift (±2 px), shear, and stroke-thickness jitter (random dilation/erosion via 3×3 max-pool / min-pool on the batch).
  - Light weight decay (around 1e-4) so first-layer weight images are smooth enough to read in the spotlight.
  - Prints test accuracy. Target ≥ 97% on the MNIST test set.
  - Writes `src/model/mnist-mlp.json` (§5.3), `src/model/samples.json` (3 test digits per class, with labels) and `tests/fixtures/parity.json` (200 test digits as uint8, their labels, and PyTorch's output probabilities).
- CPU-only install line for `training/README.md`: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`

### 5.3 Weights file contract: `src/model/mnist-mlp.json`

```json
{
  "format": "mnist-mlp/v1",
  "input": { "shape": [28, 28], "range": [0, 1], "ink": "high" },
  "layers": [
    { "name": "hidden1", "units": 64, "activation": "relu",    "W": "<base64>", "b": "<base64>" },
    { "name": "hidden2", "units": 32, "activation": "relu",    "W": "<base64>", "b": "<base64>" },
    { "name": "output",  "units": 10, "activation": "softmax", "W": "<base64>", "b": "<base64>" }
  ],
  "metrics": { "test_accuracy": 0.975 },
  "source": "training/train.py",
  "created": "YYYY-MM-DD"
}
```

- `W` and `b` are little-endian float32, base64-encoded.
- `W` has shape `[units, inputs]`, row-major (PyTorch `nn.Linear` layout). Row *j* holds neuron *j*'s incoming weights, so row *j* of `hidden1` reshaped to 28×28 is that neuron's weight image.
- The app imports this JSON, so the weights are bundled. No fetch.

### 5.4 Forward pass in the browser

Plain TypeScript, no ML library: three matrix-vector products on `Float32Array`s (about 52,000 multiply-adds, well under 1 ms). Return everything the animation needs: `x` (784), `z1`/`a1` (64), `z2`/`a2` (32), `logits` (10), `probs` (10), `prediction`. Use softmax with max-subtraction.

## 6. Preprocessing: drawing → 28×28

This step makes or breaks recognition. MNIST digits were scaled to fit a 20×20 box (keeping aspect ratio), anti-aliased, then placed in a 28×28 image with their center of mass at the center. Reproduce that:

1. Record strokes as lists of points in pad coordinates. Don't read pixels back from the pad canvas.
2. Take the bounding box of all points. Scale uniformly by `(20 − strokeWidth) / longerSide` so the stroked digit spans 20 px, and center it.
3. Rasterize the strokes at a fixed width (about 2.5 px at 28×28 scale; tune between 2 and 3.5) with round caps and joins, supersampled at least 4× and box-filtered down to 28×28 for MNIST-like gray edges. Because the width is applied after scaling, a tiny or a huge drawing gets the stroke thickness the model was trained on.
4. Compute the center of mass and shift so it lands on (14, 14), by re-rasterizing with the offset (no clipping).
5. Clamp to [0, 1] and return a `Float32Array(784)`.

Write this in pure TypeScript (a segment-distance "capsule" rasterizer; no canvas, no DOM) so it's identical in every browser and unit-testable in Node. Edge cases: empty pad (Read it! stays disabled), a single tap (a dot), a perfectly straight line (zero-width box; don't divide by zero).

Also implement `fromRaster(image)`: crop to the bounding box, area-resample to fit 20×20, center by mass. Tests use it (§12).

The debug overlay (key D) shows the processed 28×28 next to MNIST samples of the predicted class. Use it to tune the stroke width.

## 7. Visualization rules

### 7.1 Visual encoding

Use it the same way everywhere: lines, heatmaps, the spotlight panel, the legend.

| Meaning | Encoding |
|---|---|
| Positive weight (a bright input pushes the neuron up) | blue `#3DA5FF` |
| Negative weight (a bright input pushes the neuron down) | orange `#FF8A3D` |
| Weight size | line width and opacity ∝ \|w\| |
| Signal on a connection, \|w × activation\| | pulse size and brightness |
| Pixel and neuron activation | brightness, normalized per layer per run, with a mild gamma so middle values show |
| Neuron switched off by ReLU (negative sum) | brief orange rim, then dark |
| Winning output | accent glow and the answer card |

Blue/orange is color-blind-safe. Also show "+" and "−" in the legend so color isn't the only cue.

### 7.2 Real vs approximated

- **Real** (from the forward pass): input pixels, every activation, the spotlight neuron's 784 weights, products, sum, bias and ReLU output, logits, probabilities, prediction.
- **Approximated** (allowed): which connections are drawn, pulse timing and stagger, small jitter, the faint "everything connects" backdrop, brightness normalization.
- Never show an invented number as if it were a value.

### 7.3 Choosing which connections to draw

Computed once per run, when the prediction is made:

- **Input → hidden 1** (50,176 connections): rank by |w × x| over inked pixels only. Draw the top ~1,500 and run pulses on the top ~400. Behind them, a faint backdrop of a few thousand random connections, pre-rendered once, shows that everything is connected. In the spotlight scene, draw all 784 lines into the spotlight neuron.
- **Hidden 1 → hidden 2** (2,048): draw all, faintly, with opacity ∝ |w × a|; pulses on the top ~250.
- **Hidden 2 → output** (320): draw all; emphasize the ones into the winning digit.
- The spotlight neuron is the most active neuron in hidden layer 1.

### 7.4 Rendering and performance

- Canvas 2D: one canvas for the pad, one for the stage, and a DOM overlay for text and buttons. Scale by `devicePixelRatio`, capped at 2 (drop to 1 automatically if fps falls below 45).
- Pre-render static parts (node outlines, the backdrop) to an offscreen canvas; draw only moving parts each frame.
- Batch lines into a few paths by color × opacity bucket (for example 2 × 8): one `stroke()` per bucket, never one per line.
- Additive blending (`globalCompositeOperation = 'lighter'`) for pulses and glow.
- No allocations in the frame loop (reuse typed arrays), so there are no GC hitches over a long day.
- Budget: at most ~4,000 lines and ~800 pulses on screen at once; 60 fps at 1920×1080 on an integrated GPU.
- A small timeline / scene state machine with easing drives the animation. Every scene can be aborted at any frame (Clear, skip). Pause when the tab is hidden.

## 8. Interaction and booth behavior

- **Input:** Pointer Events for mouse, touch and pen, with pointer capture. Track one pointer and ignore extra fingers. `touch-action: none` on the pad. Block page scroll, pinch and double-tap zoom, long-press menus, text selection, pull-to-refresh and swipe-back (`overscroll-behavior: none`).
- **Ink:** smooth strokes (quadratic curves through midpoints), brush width about 7% of the pad width. This is display only; the model input uses the fixed-width re-render from §6.
- **Buttons** (at least 64 px tall): Clear, Read it! (disabled until there is ink), Replay (after a run).
- **Skip:** tap the stage during the animation to jump to the answer.
- **Idle:** 30 s on an answer → clear. 60 s with no input → attract mode: the story loops on the bundled sample digits under a big "Draw a digit!" call to action. Any touch exits instantly to a clean pad.
- **Staff hotkeys:** Space pause/resume · → next scene · R replay · C clear · F fullscreen · 1/2/3 speed 0.5×/1×/2× · S toggle the spotlight scene · D debug overlay (fps, processed 28×28, probabilities) · A attract mode now.
- **Config:** defaults in `src/config.ts`, overridable by URL parameters so a kiosk can be tuned without code changes, e.g. `?speed=1.5&spotlight=0&step=1&autorun=1&idle=60&debug=1&lang=en`.
  - `step=1` pauses after each scene so staff can explain; → continues.
  - `autorun=1` starts the story 1.5 s after the last stroke. Off by default, because digits like 4 and 7 are often drawn with a pause between strokes.
- **Text:** every visitor-facing string lives in `src/strings.ts` (one object per language), so adding a language, including a right-to-left one, needs no code changes.
- **Privacy:** drawings are never stored or sent anywhere. No analytics.

## 9. One-command setup and offline running

On a new device: copy or clone the folder, install Node.js (current LTS) once, then run

```
npm start
```

| Command | What it does |
|---|---|
| `npm start` | The one command. First run installs dependencies (`npm ci`, internet needed once), builds, serves the app at http://localhost:4173 (also reachable from the local network), prints the LAN address and opens the browser. Later runs work offline and start in seconds. |
| `npm run kiosk` | Same, then opens Chrome or Edge in full-screen kiosk mode. |
| `npm run dev` | Dev server with hot reload. |
| `npm test` | Unit tests. |
| `npm run build` | Production build: one self-contained `dist/index.html`. |
| `npm run release` | Build, then copy to `release/mnist-booth.html` (committed). |
| `python training/train.py` | Optional: retrain and regenerate weights, samples and fixtures. |

Requirements:

- Works on Windows, macOS and Linux. No bash-only syntax in `package.json`; put logic in small `scripts/*.mjs` files. `scripts/start.mjs` uses only Node built-ins, since it runs before dependencies exist. It checks the Node version first and prints a friendly message if it's too old. Commit `package-lock.json`.
- Zero network requests at runtime: no CDNs, no web fonts (system font stack), weights bundled.
- The build inlines everything into one HTML file (`vite-plugin-singlefile`). `release/mnist-booth.html` therefore runs by double-clicking, with no Node and no internet: the fallback for any machine. Rebuild it with `npm run release` before each event.
- Kiosk launch uses the Chromium flags `--kiosk --overscroll-history-navigation=0 --disable-pinch --no-first-run` plus a dedicated `--user-data-dir` (without it, an already-open browser ignores the flags). Edge also takes `--edge-kiosk-type=fullscreen`. Find the browser on each OS; if none is found, open the default browser and print how to go full-screen.
- Tablets: open the printed LAN address on a tablet on the same network, or host the static build. On iPad, add it to the Home Screen and use Guided Access.
- `README.md` for booth staff: setup, kiosk mode and how to exit it, hotkeys, troubleshooting, retraining, and credit for the MNIST dataset.

## 10. Stack and layout

- Vite + TypeScript (strict). No UI framework, no ML runtime in the browser, no animation library unless it clearly pays for itself.
- Vitest for unit tests; Playwright for one smoke test (nice-to-have).
- Python 3 + PyTorch (CPU) for training only.

```
mnist-booth/
├── AGENTS.md            this brief
├── README.md            booth staff guide
├── package.json         start / kiosk / dev / test / build / release
├── index.html
├── vite.config.ts       single-file build
├── scripts/             start.mjs, kiosk.mjs (cross-platform, Node built-ins)
├── src/
│   ├── main.ts          bootstrap and app state machine
│   ├── config.ts        timings, colors, budgets, URL-parameter overrides
│   ├── strings.ts       all visitor-facing text
│   ├── pad/             pointer input, stroke capture and display
│   ├── preprocess/      strokes or raster → 28×28 (pure TS)
│   ├── model/           mnist-mlp.json, samples.json, mlp.ts (forward pass)
│   ├── viz/             stage, layout, edge selection, timeline, scenes/
│   └── ui/              buttons, captions, answer card, legend, debug overlay
├── tests/               *.test.ts, fixtures/parity.json
├── training/            train.py, requirements.txt, README.md (data/ is git-ignored)
└── release/             mnist-booth.html (committed, double-clickable)
```

## 11. Build order

1. Scaffold, and get `npm start` serving a page with a working pad.
2. Train; export weights, samples and fixtures; commit them.
3. Forward pass and parity test.
4. Preprocessing, its tests, and the debug overlay with a live prediction. **Draw all ten digits by hand, with mouse and touch, before building any animation.**
5. A static network render showing real activations for the current drawing.
6. Scenes 2–8 and the timeline: skip, replay, speed, step mode.
7. Booth polish: attract mode, idle reset, kiosk script, hotkeys, captions, legend, performance pass.
8. Smoke test, README, release file.

## 12. Tests and definition of done

Automated (`npm test`):

- Forward pass matches `parity.json` within 1e-4 per probability. This catches transposed or misordered weights.
- Softmax sums to 1; layer sizes are 784/64/32/10.
- Preprocessing: output in [0, 1]; center of mass within 0.5 px of (14, 14); the stroked digit spans about 20 px; the same strokes drawn small, large or off-center give near-identical 28×28 images.
- Synthetic strokes through the real model: an oval → 0, a vertical line → 1, a 7-shaped polyline → 7. If these fail, fix preprocessing before touching the model.
- Round trip: the 200 fixture digits, upscaled at random sizes and positions into a 400×400 raster and run through `fromRaster` and the model, score ≥ 95%.
- Smoke test (nice-to-have): draw a stroke, press Read it!, the answer card appears, no console errors, no external requests.

Done when:

- [ ] `npm start` on a clean machine opens the working app, and a second run works with networking off.
- [ ] `release/mnist-booth.html` works by double-click with networking off.
- [ ] Mouse, touch and pen all draw; the page never scrolls or zooms.
- [ ] The animation starts under 100 ms after Read it!; the story takes about 8 s at 1×; skip, replay, speed and step mode work.
- [ ] At least 50 fps in the busiest scene at 1920×1080 on the booth laptop (debug overlay).
- [ ] Weight sign and size are obvious, the legend is visible, colors are consistent everywhere.
- [ ] MNIST test accuracy ≥ 97%, and staff drawing 0–9 get at least 9 of 10 right first time.
- [ ] Mashing Clear, Read it! and skip mid-animation never breaks anything; resizing the window re-lays out cleanly.
- [ ] A 30-minute attract-mode soak shows no heap growth and no fps decay.
- [ ] README covers setup, kiosk, hotkeys, troubleshooting and retraining.

## 13. Pitfalls

- Inverted colors. MNIST is white ink on black; ink = 1.
- Mean/std normalization in training but not in the app (or the reverse). The contract is plain [0, 1].
- Transposed weights. `W` is `[out, in]`.
- Shrinking the pad with `drawImage`: browsers smooth differently. Use the §6 pipeline.
- Feeding raw pad pixels: brush width relative to digit size then varies wildly and accuracy collapses.
- Stroking 50,000 lines per frame, or calling `stroke()` once per line.
- Allocating per frame, or leaking animation loops and listeners between runs.
- An animation that blocks Clear.
- Anything that needs the internet after setup.

## 14. Out of scope and nice-to-have

- **Out of scope:** backend, accounts, saving drawings, analytics, sound, training in the browser, CNN visualization.
- **Nice-to-have:** portrait/tablet layout; a second language; a hidden staff menu (long-press the title) for touch-only kiosks; an attract mode that "draws" recorded strokes; a magnifier over the 784-strip during the flatten; a service worker for hosted/tablet use.

## 15. Working rules for the agent

- After each milestone: `npm test` and `npm run build` pass, you've run the story once in a browser, and the console is clean.
- Don't add runtime dependencies beyond §10 without noting why in the README.
- Commit the model JSON, samples, fixtures, `package-lock.json` and the release file. Never commit `node_modules/`, `dist/`, `training/data/` or virtual environments.
- Where this brief is silent, choose what best serves §2 and note the decision in the README.
