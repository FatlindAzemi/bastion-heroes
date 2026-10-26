import { defineConfig, devices } from '@playwright/test';

// Playwright configuration (issue #113, spec 16.5): Chromium at the portrait phone
// viewport 390x844 with mobile emulation, tested against the production build served by
// `vite preview`. The portrait relaunch replaces the old 844x390 phone-landscape viewport.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Headless Chromium renders the bloom/tilt-shift scene on the software rasterizer;
  // four parallel WebGL pages starve each other (measured fps 1, then timing flakes in
  // the animation/audio tests). Two workers keep the suite stable on an 8-core machine.
  workers: 2,
  // The relaunch renders a WebGL scene with bloom/tilt-shift post-processing on the
  // software renderer of headless Chromium. A level boot takes several seconds and the
  // heaviest flows (three level boots in one pause test) run well past Playwright's 30 s
  // default, so the whole suite gets the generous timeout the heavy animation tests
  // already used individually (commit #111). Assertions still fail on real regressions.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Building the level scene loads GLBs and compiles the post-processing shaders on
    // the software renderer; give the first navigation enough room on a loaded CI box.
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Build first so the test runs against what the app really ships (spec 16.5).
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
