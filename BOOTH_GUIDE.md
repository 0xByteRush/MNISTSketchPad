# MNIST Booth: Computer Club KFUPM Edition

Everything you need to run the "How does an AI read your handwriting?" booth for Computer Club
KFUPM: what the app is, how to set it up, what changed for the club, the Wacom tablet setup, and
what to do when something goes wrong.

Based on [Ahmedexe/MNISTSketchPad](https://github.com/Ahmedexe/MNISTSketchPad). The original
technical docs are in [README.md](README.md) and the design brief in [AGENTS.md](AGENTS.md).

---

## 1. What it is

A visitor draws a digit (0 to 9) and presses **Read it!**. An 8-second animation shows a small
neural network reading the drawing:

drawing → 28×28 pixels → 784 numbers → hidden layer 1 (64) → hidden layer 2 (32) → 10 scores →
"It's a 7, 94% sure"

- The network is real: 784 → 64 → 32 → 10, trained on MNIST, 97.57% test accuracy.
- Every number on screen comes from the real calculation.
- Nothing is stored or sent anywhere. The app makes zero network requests and works offline.

---

## 2. Quick start

### Option A: one file, no setup

Double-click `release/mnist-booth.html`. It is the whole app in one file and runs in any modern
browser, with no Node.js and no internet.

### Option B: run it with Node.js (recommended for the booth)

1. Install [Node.js](https://nodejs.org) LTS, version 20.19 or newer.
2. Open a terminal in this folder and run:

```bash
npm start
```

The first run installs dependencies (internet needed once), builds the app and opens
<http://localhost:4173>. Later runs start in seconds and work offline. The terminal also prints a
network address (for example `http://192.168.1.20:4173`) that tablets on the same Wi-Fi can open.

### Full-screen kiosk mode (for the booth screen)

```bash
npm run kiosk
```

Opens Chrome or Edge full screen with zoom and swipe gestures disabled.
**Exit:** `Alt+F4`, then `Ctrl+C` in the terminal.

---

## 3. All commands

| Command | What it does |
|---|---|
| `npm start` | Install if needed, build if needed, serve on port 4173, open the browser. |
| `npm start -- --no-open` | Same, without opening a browser. |
| `npm start -- --port=8080` | Use another port. |
| `npm run kiosk` | Start and open Chrome/Edge full screen in kiosk mode. |
| `npm run dev` | Development server with hot reload (for editing). |
| `npm test` | Unit tests (28 tests). |
| `npm run build` | Build one self-contained `dist/index.html`. |
| `npm run release` | Build and copy to `release/mnist-booth.html`. Run after any change. |
| `npm run smoke` | Browser smoke test (once first: `npx playwright install chromium`). |

---

## 4. Running the booth

Visitors only need three things: the pad, **Clear** and **Read it!**. Tapping the screen during
the animation skips to the answer. **Replay** shows the story again.

The booth looks after itself:

- An answer left alone for 30 seconds is cleared.
- After 60 seconds with no input, attract mode starts: the story loops on sample digits under a
  "Draw a digit!" banner. Any touch returns to a clean pad.
- Scribbles always get a best guess. Under 50% confidence the card hedges
  ("my best guess is 4, maybe 9").

### Staff hotkeys

| Key | Action |
|---|---|
| `Space` | Pause / resume |
| `→` | Next scene (in step mode: continue) |
| `R` | Replay |
| `C` | Clear |
| `Enter` | Read it! |
| `F` | Full screen |
| `1` `2` `3` | Speed 0.5× / 1× / 2× |
| `S` | "One neuron up close" scene on/off |
| `D` | Debug overlay: fps, the 28×28 image the model sees, probabilities |
| `A` | Attract mode now |

### URL options

Add these to the address, for example `http://localhost:4173/?speed=1.5&step=1`:

| Option | Default | Meaning |
|---|---|---|
| `speed` | `1` | Animation speed. |
| `spotlight` | `1` | `0` skips the single-neuron scene (about 6 s instead of 8 s). |
| `step` | `0` | `1` pauses after every scene so staff can explain. `→` or a tap continues. |
| `autorun` | `0` | `1` starts the story 1.5 s after the last stroke, no button press. |
| `idle` | `60` | Seconds before attract mode. `0` turns it off. |
| `debug` | `0` | `1` opens the debug overlay. |

### Tips for visitors

Draw big and in the middle of the pad. MNIST is American-style handwriting, so a 7 with a bar,
a 1 with a foot, or an open 4 is more likely to be misread.

---

## 5. Wacom pen tablet

The booth can be used with a Wacom pen tablet so visitors draw with a pen.

**Tested tablet:** Wacom Intuos S (CTL-4100), USB ID `056A:0374`.

### Install the driver (once per computer)

Without the Wacom driver, Windows only sees the tablet as a generic "USB Input Device" and the pen
does not work properly.

1. Download the official driver from Wacom:
   [Wacom Intuos CTL-4100 drivers](https://www.wacom.com/en-us/support/product-support/drivers?sku=CTL4100).
   Version used: **Windows Driver 6.4.15-1** (about 305 MB, Windows 10 and 11).
2. Run `WacomTablet_6.4.15-1.exe`. Click **Yes** on the Windows admin prompt, accept the licence and
   click **Install**.
3. Restart the computer if asked.

### Check that it works

- In Windows, the device list should show **Wacom Tablet** and **HID-compliant pen**, and the
  **Wacom Tablet Service** (`WTabletServicePro`) should be running.
- Open the booth app and draw on the pad with the pen.

If you want to check from PowerShell:

```powershell
Get-Service WTabletServicePro
Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_056A' }
```

### Tablet tips for the booth

- In **Wacom Tablet Properties**, map the tablet to the booth monitor only (Mapping → Screen area)
  so the pen covers the drawing area well.
- If the pen moves the cursor but does not draw, unplug and replug the tablet, or restart the
  Wacom Tablet Service.

---

## 6. Computer Club look

The app was restyled to follow the **Computer Club KFUPM Brand Guidelines v1.0** (October 2026).

| Element | Brand rule | In the app |
|---|---|---|
| Base | Club Black `#0A0B0D` | Page background |
| Accent | Club Blue `#337DFE` (about 10%) | Pad ring, **Read it!**, positive weights, the winning digit, answer card |
| Cards | Surface Dark `#14171D`, Line Dark `#272C36` borders, 16 px corners | Spotlight panel, legend, buttons |
| Body text on dark | Mist `#AEB6C4` | Labels, legend, handle |
| Headlines | Poppins Bold / SemiBold | Title, buttons, neuron digits, answer card |
| Body | Inter | Captions, spotlight text |
| Labels | JetBrains Mono, caps for kickers | Kicker, layer labels, "100% SURE", footer |
| Signature | Thin Club Blue edge bar on the left of dark layouts | Left edge of the screen |
| Headlines | Payoff words in blue | "How does an AI read **your handwriting?**" |
| Logo | Supplied white logo on dark, at least 120 px wide | Top right, above the answer card |
| Footer | `@kfupm_cc · #MaxThroughput` | Under the answer card |
| Buttons | Club Black text on Club Blue | **Read it!** / **Replay** |

**One deliberate exception:** negative weights stay **orange** (`#FF8A3D`). It is a data color,
not decoration: the captions and legend teach "blue pushes up, orange pushes down", and a grey
would be confused with neuron brightness.

The fonts are bundled inside the app (`src/fonts/`, SIL Open Font License), so it still makes no
network requests at the booth.

### Files changed for the club look

| File | Change |
|---|---|
| `src/config.ts` | Brand palette (`COLORS`) and canvas fonts (`FONTS`). |
| `src/style.css` | Full restyle: palette, fonts, edge bar, kicker, logo, handle, flat cards. |
| `src/fonts.css`, `src/fonts/` | Bundled Poppins, Inter and JetBrains Mono (woff2, Latin subset). |
| `src/assets/cc-logo-white.png` | Club logo (white version), resized from the brand kit. |
| `index.html` | Edge bar, kicker, logo and handle elements. |
| `src/strings.ts` | `titleAccent`, `kicker` and `handle` strings. |
| `src/ui/dom.ts` | Renders the blue title accent, kicker and handle. |
| `src/main.ts` | Loads the brand fonts and redraws the canvas once they are ready. |
| `src/viz/stage.ts` | Canvas fonts and colors switched to the brand palette. |
| `release/mnist-booth.html` | Rebuilt single-file version with the new look. |

### Changing the text

All visitor-facing text is in `src/strings.ts` (title, kicker, captions, buttons, handle). Edit
it, then run `npm start` (it rebuilds by itself) or `npm run release` to refresh the single file.

### Before showing it publicly

The club's brand guidelines require supervisor approval for anything published under the club's
name. The poster-only items (DSA logo, "Supported by Student Fund", QR code) are not on the booth
screen; add them if the supervisor asks.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `npm start` says Node is too old | Install the current LTS from nodejs.org. |
| First run fails with a network error | The first run needs internet once. Or use `release/mnist-booth.html`. |
| "Port 4173 is busy" | The app picks the next free port and prints it. An old copy may still be running: close its terminal. |
| Tablet (iPad etc.) can't open the network address | Same Wi-Fi on both devices; allow Node.js through the firewall. Guest Wi-Fi often blocks this: use a hotspot or the release file. |
| Wacom pen does nothing | Install the Wacom driver (section 5), then restart. |
| Digits are misread | Draw big and centered. Press `D` to see what the model sees. |
| Animation stutters | Close other apps and tabs, or add `?spotlight=0`. |
| Page scrolled or zoomed | Use kiosk mode. Press `C` to reset; reloading is always safe. |

---

## 8. Project layout

```
MNISTSketchPad/
├── index.html            page skeleton (1920×1080 board)
├── release/              mnist-booth.html: the whole app in one file
├── scripts/              npm start / kiosk / release helpers (Node built-ins only)
├── src/
│   ├── main.ts           app state machine and frame loop
│   ├── config.ts         timings, brand colors and fonts, URL options
│   ├── strings.ts        every visitor-facing string
│   ├── style.css         Computer Club look
│   ├── fonts.css, fonts/ bundled brand fonts
│   ├── assets/           club logo
│   ├── model/            weights and the forward pass (no ML library)
│   ├── preprocess/       strokes → 28×28 image, the way MNIST was made
│   ├── pad/              drawing pad
│   ├── viz/              the animated story on one canvas
│   └── ui/               DOM text, buttons, debug overlay
├── tests/                unit tests and browser smoke test
└── training/             optional: retrain the model in Python
```

---

## 9. Credits

- Original app: [Ahmedexe/MNISTSketchPad](https://github.com/Ahmedexe/MNISTSketchPad).
- Trained on the [MNIST database](http://yann.lecun.com/exdb/mnist/) by Yann LeCun, Corinna Cortes
  and Christopher J.C. Burges.
- Fonts: Poppins, Inter and JetBrains Mono, SIL Open Font License.
- Computer Club KFUPM brand: Media & Marketing team, Brand Guidelines v1.0.

@kfupm_cc · #MaxThroughput
