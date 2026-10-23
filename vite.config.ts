import { defineConfig } from 'vite';

// Vite configuration (spec 10.3: the dev server serves the game on port 5173).
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
});
