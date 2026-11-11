import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained dist/index.html: scripts, styles and the model weights are all inlined,
// so the built file runs from file:// with no server and no network.
export default defineConfig({
  plugins: [viteSingleFile()],
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
