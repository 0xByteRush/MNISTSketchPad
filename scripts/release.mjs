// `npm run release`: production build, then copy the single file to release/mnist-booth.html.
// That file is committed and runs by double-click, with no Node and no internet.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
if (res.status !== 0) process.exit(res.status ?? 1);

const from = path.join(root, 'dist', 'index.html');
const to = path.join(root, 'release', 'mnist-booth.html');
mkdirSync(path.dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`\n  release/mnist-booth.html written (${Math.round(statSync(to).size / 1024)} KB). Commit it.\n`);
