# MNIST Booth Demo

**How does an AI read your handwriting?** A visitor draws a digit, presses **Read it!**, and an
8-second animation shows a small neural network turning the drawing into an answer:

drawing → 28×28 pixels → 784 numbers → hidden layer 1 → hidden layer 2 → 10 scores → "It's a 7 (94%)"

The network is real (trained on MNIST, weights bundled), so every drawing gets a genuine
prediction. Nothing is stored or sent anywhere, and the app needs no internet once set up.

## Setup (once per machine)

1. Install [Node.js](https://nodejs.org) (current LTS, version 20.19 or newer).
2. Copy or clone this folder.
3. In the folder, run:

```
npm start
```

The first run installs dependencies (internet needed this one time), builds the app, serves it
at <http://localhost:4173> and opens the browser. Later runs start in seconds and work offline.
The terminal also prints a network address (for example `http://192.168.1.20:4173`) that
tablets on the same Wi-Fi can open.

**No Node, no internet, no time?** Double-click `release/mnist-booth.html`. It is the whole app
in one file.

| Command | What it does |
|---|---|
| `npm start` | Install if needed, build if needed, serve on port 4173, open the browser. |
| `npm run kiosk` | Same, but opens Chrome or Edge full-screen in kiosk mode. |
| `npm run dev` | Development server with hot reload. |
| `npm test` | Unit tests. |
| `npm run build` | Production build: one self-contained `dist/index.html`. |
| `npm run release` | Build and copy to `release/mnist-booth.html`. Run before each event and commit the file. |
| `npm run smoke` | Browser smoke test (once: `npx playwright install chromium`). |
| `python training/train.py` | Optional: retrain the model. See [training/README.md](training/README.md). |

`npm start` also accepts `-- --no-open` (don't open a browser) and `-- --port=8080`.

## Kiosk mode

`npm run kiosk` starts the server and opens Chrome, Edge or Chromium full-screen with
pinch-zoom and swipe-navigation disabled. It uses its own browser profile (`.kiosk-profile/`),
so it works even when a browser is already open.

- **Exit:** `Alt+F4` on Windows and Linux, `Cmd+Q` on macOS. Then press `Ctrl+C` in the terminal.
- If no Chrome, Edge or Chromium is found, the default browser opens instead: press `F` or `F11`
  for full screen.
- If the server is already running, `node scripts/kiosk.mjs http://localhost:4173` opens just the
  kiosk window.
- **iPad / tablets:** open the network address printed by `npm start`. On iPad, use Share → Add
  to Home Screen, then lock the app with Guided Access (Settings → Accessibility).

## Running the booth

Visitors need three things: the pad, **Clear** and **Read it!**. Tapping the stage during the
animation skips to the answer. After an answer, **Replay** shows the story again.

The booth looks after itself:

- An answer left alone for 30 seconds is cleared.
- After 60 seconds without input the app enters attract mode: the story loops on sample digits
  under a "Draw a digit!" banner. Any touch returns to a clean pad.
- Scribbles always get a best guess. Under 50% confidence the card hedges ("my best guess is 4,
  maybe 9").

### Staff hotkeys

| Key | Action |
|---|---|
| `Space` | Pause / resume the animation |
| `→` | Next scene (in step mode: continue) |
| `R` | Replay |
| `C` | Clear |
| `Enter` | Read it! |
| `F` | Full screen |
| `1` `2` `3` | Speed 0.5× / 1× / 2× |
| `S` | Turn the "one neuron up close" scene on or off (from the next run) |
| `D` | Debug overlay: fps, the 28×28 image the model sees, probabilities |
| `A` | Attract mode now |

### URL parameters

Tune a kiosk without touching code, for example
`http://localhost:4173/?speed=1.5&spotlight=0&step=1`:

| Parameter | Default | Meaning |
|---|---|---|
| `speed` | `1` | Animation speed multiplier. |
| `spotlight` | `1` | `0` skips the single-neuron scene (story is about 6 s instead of 8 s). |
| `step` | `0` | `1` pauses after every scene so staff can explain; `→` or a tap continues. |
| `autorun` | `0` | `1` starts the story 1.5 s after the last stroke, with no button press. |
| `idle` | `60` | Seconds without input before attract mode. `0` turns attract mode off. |
| `debug` | `0` | `1` starts with the debug overlay open. |
| `lang` | `en` | Language code from `src/strings.ts`. |

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm start` says Node is too old | Install the current LTS from nodejs.org. |
| First run fails with a network error | The first run needs internet to install dependencies. Or use `release/mnist-booth.html`. |
| "Port 4173 is busy" | The app picks the next free port and prints it. An old copy may still be running: close its terminal. |
| Tablet can't open the network address | Both devices must be on the same network; allow Node.js through the firewall when asked. Guest Wi-Fi often blocks device-to-device traffic: use a hotspot or the release file. |
| Digits are misread | Draw big, in the middle of the pad. Press `D` to see what the model sees; it should look like the MNIST examples next to it. Open 4s, 7s with a bar and 1s with a foot are the usual suspects: MNIST is American-style handwriting. |
| Animation stutters | Close other apps and browser tabs. The app drops to a lower pixel density by itself when it measures under 45 fps. `?spotlight=0` also lightens the load. |
| Page scrolled, zoomed or got stuck | Use kiosk mode, which disables browser gestures. Press `C` to reset; reloading the page is always safe. |
| Text changes or a new language | Edit `src/strings.ts`, then `npm start` (it rebuilds by itself). |

## Retraining

Not needed for the booth. To retrain (about a minute on a laptop), see
[training/README.md](training/README.md), then run `npm test` and `npm run release` and commit
the regenerated files.

Current model: 784 → 64 → 32 → 10 fully connected, 97.57% MNIST test accuracy.

## How it is put together

`AGENTS.md` is the design brief. In short:

- `src/preprocess/` turns the recorded strokes into a 28×28 image the way MNIST was made
  (scaled to a 20×20 box, centered by mass, fixed stroke width). This matters more for accuracy
  than the model does.
- `src/model/` holds the weights and a plain-TypeScript forward pass (no ML library).
- `src/viz/` draws the story on one canvas; `src/pad/` is the drawing pad; `src/ui/` is the text
  and buttons; `src/strings.ts` holds every visitor-facing string.
- Every number on screen (pixels, activations, the spotlight neuron's sum, scores, percentages)
  comes from the real forward pass. Which connection lines are drawn and when the pulses fly is
  simplified so it stays readable.

### Decisions where the brief was silent

- **Fixed 1920×1080 design board.** The whole layout is authored in 1920×1080 "design pixels"
  and scaled uniformly to the window (letterboxed on other aspect ratios, including portrait).
  One layout to maintain, identical proportions on every screen.
- **Connection lines are pre-rendered once per run** into small off-screen canvases and blitted
  each frame, instead of stroking thousands of lines per frame. Only pulses, neurons and text
  are drawn live.
- **Hidden layer 1 is two staggered columns** so 64 neurons fit at a readable size.
- **Output digit labels sit inside the output neurons**, keeping the left side free for incoming
  lines and the right side for the bars.
- **Score bars** in scene 7 run from this run's lowest score to its highest (scores can be
  negative); the number next to each bar is the real score. In scene 8 the bars become
  probabilities, where bar length is the probability itself.
- **The 0 → 784 counter** replaces the "784 inputs" label under the strip during the flatten.
- **A tap or tiny squiggle** (under 3% of the pad) is kept as a dot rather than magnified.
- **Thinning augmentation** in training blends the 3×3 min-pool half and half with the original:
  a full erosion erases thin MNIST strokes.
- **`Enter`** also triggers Read it! (handy with a keyboard on the booth table).
- **Dev dependencies only:** Vite, TypeScript, Vitest, vite-plugin-singlefile and Playwright (for
  the optional smoke test). The app itself has no runtime dependencies.

## Credits

Trained on the [MNIST database of handwritten digits](http://yann.lecun.com/exdb/mnist/) by
Yann LeCun, Corinna Cortes and Christopher J.C. Burges (60,000 training and 10,000 test images).
