import { defineConfig } from 'vitest/config';

// Vite and Vitest configuration. Dev server on port 5173, preview on 4173 (spec 10.3 and 16.5).
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
  test: {
    // Unit tests only. tests/e2e/ belongs to Playwright (spec 16.1 and 16.5).
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
