#!/usr/bin/env node
// The one command: `npm start`.
// Installs dependencies on first run, builds when sources changed, serves dist/ on port 4173
// (also on the local network), prints the addresses and opens the browser.
// Node built-ins only: this runs before node_modules exists.
//
// Flags: --kiosk (open Chrome/Edge full-screen)  --no-open  --port=4173
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_NODE = [20, 19];
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
  console.error(`\n  This app needs Node.js ${MIN_NODE.join('.')} or newer; you have ${process.versions.node}.`);
  console.error('  Install the current LTS from https://nodejs.org and run "npm start" again.\n');
  process.exit(1);
}

const { openBrowser, openKiosk } = await import('./kiosk.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const kiosk = args.includes('--kiosk');
const noOpen = args.includes('--no-open');
const portArg = args.find((a) => a.startsWith('--port='));
const firstPort = Number(portArg?.split('=')[1] ?? process.env.PORT ?? 4173);

const at = (...parts) => path.join(root, ...parts);
const mtime = (file) => (existsSync(file) ? statSync(file).mtimeMs : 0);

function npm(npmArgs) {
  // npm is a .cmd shim on Windows, which needs a shell.
  const res = spawnSync(`npm ${npmArgs}`, { cwd: root, stdio: 'inherit', shell: true });
  return res.status === 0;
}

function newestMtime(target) {
  if (!existsSync(target)) return 0;
  const st = statSync(target);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const name of readdirSync(target)) newest = Math.max(newest, newestMtime(path.join(target, name)));
  return newest;
}

// 1. Dependencies (internet needed once).
const installedMark = at('node_modules', '.package-lock.json');
let depsOk = existsSync(installedMark) && mtime(installedMark) >= mtime(at('package-lock.json'));
if (!depsOk) {
  console.log('\n  First run: installing dependencies (needs internet once)...\n');
  depsOk = npm(existsSync(at('package-lock.json')) ? 'ci' : 'install');
  if (!depsOk) console.error('\n  Could not install dependencies (no internet?).');
}

// 2. Build when dist/ is missing or older than the sources.
const distIndex = at('dist', 'index.html');
const sourceTime = Math.max(
  ...['src', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json'].map((p) => newestMtime(at(p))),
);
if (depsOk && mtime(distIndex) < sourceTime) {
  console.log('\n  Building the app...\n');
  if (!npm('run build')) console.error('\n  Build failed.');
}

// 3. Decide what to serve. The committed release file is the fallback of last resort.
let serveDir = at('dist');
let indexName = 'index.html';
if (!existsSync(distIndex)) {
  if (existsSync(at('release', 'mnist-booth.html'))) {
    console.log('\n  No fresh build available: serving the committed release/mnist-booth.html instead.');
    serveDir = at('release');
    indexName = 'mnist-booth.html';
  } else {
    console.error('\n  Nothing to serve. Connect to the internet once and run "npm start" again.\n');
    process.exit(1);
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let rel = '/';
  try {
    rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    // malformed URL: serve the index
  }
  let file = path.normalize(path.join(serveDir, rel));
  if (!file.startsWith(serveDir) || !existsSync(file) || statSync(file).isDirectory()) {
    file = path.join(serveDir, indexName);
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

let port = firstPort;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && port < firstPort + 10) {
    console.log(`  Port ${port} is busy, trying ${port + 1}...`);
    port += 1;
    server.listen(port, '0.0.0.0');
  } else {
    console.error(`\n  Could not start the server: ${err.message}\n`);
    process.exit(1);
  }
});
server.on('listening', () => {
  const url = `http://localhost:${port}`;
  console.log('\n  MNIST booth demo is running.\n');
  console.log(`    On this computer:   ${url}`);
  for (const ip of lanAddresses()) console.log(`    On the network:     http://${ip}:${port}   (tablets on the same Wi-Fi)`);
  console.log('\n  Keep this window open. Press Ctrl+C to stop.\n');
  if (noOpen) return;
  if (kiosk) openKiosk(url);
  else openBrowser(url);
});
server.listen(port, '0.0.0.0');
