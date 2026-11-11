// Browser launching for the booth. Node built-ins only (runs before dependencies exist).
//
//   import { openBrowser, openKiosk } from './kiosk.mjs'
//   node scripts/kiosk.mjs [url]      open an already-running app in kiosk mode
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function detached(cmd, args) {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Open the URL in the default browser. */
export function openBrowser(url) {
  if (process.platform === 'win32') return detached('cmd', ['/c', 'start', '""', url]);
  if (process.platform === 'darwin') return detached('open', [url]);
  return detached('xdg-open', [url]);
}

function onPath(name) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/** Find Chrome, Edge or Chromium. Returns { exe, edge } or null. */
export function findKioskBrowser() {
  const candidates = [];
  if (process.platform === 'win32') {
    const bases = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const base of bases) candidates.push([path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), false]);
    for (const base of bases) candidates.push([path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), true]);
    for (const base of bases) candidates.push([path.join(base, 'Chromium', 'Application', 'chrome.exe'), false]);
  } else if (process.platform === 'darwin') {
    for (const base of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      candidates.push([path.join(base, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'), false]);
      candidates.push([path.join(base, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'), true]);
      candidates.push([path.join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'), false]);
    }
  } else {
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];
    for (const name of names) {
      const file = onPath(name);
      if (file) candidates.push([file, name.startsWith('microsoft-edge')]);
    }
  }
  for (const [exe, edge] of candidates) if (existsSync(exe)) return { exe, edge };
  return null;
}

/** Open the URL full-screen in Chrome/Edge kiosk mode; fall back to the default browser. */
export function openKiosk(url) {
  const found = findKioskBrowser();
  if (!found) {
    console.log('\n  No Chrome, Edge or Chromium found, opening the default browser instead.');
    console.log('  Press F11 (or F inside the app) to go full-screen.\n');
    return openBrowser(url);
  }
  // A dedicated profile directory is required: without it an already-open browser
  // swallows the command and ignores the kiosk flags.
  const args = [
    '--kiosk',
    '--overscroll-history-navigation=0',
    '--disable-pinch',
    '--no-first-run',
    `--user-data-dir=${path.join(root, '.kiosk-profile')}`,
  ];
  if (found.edge) args.push('--edge-kiosk-type=fullscreen');
  args.push(url);
  console.log(`\n  Kiosk mode: ${found.exe}`);
  console.log('  To exit: Alt+F4 (Windows/Linux) or Cmd+Q (macOS).\n');
  return detached(found.exe, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  openKiosk(process.argv[2] ?? 'http://localhost:4173');
}
