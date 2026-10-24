import { expect, test } from '@playwright/test';

// Spec 13.7 debug URL: boots a level at the requested tick with the HUD, without
// console errors. Playwright serves the production build through `vite preview`.
test('debug URL: boots W1-L01 at tick 900 with the HUD', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/?level=w1-l01&seed=10001&tick=900');

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  // The HUD reads the real sim: starting Essence of W1-L01 and the fixed Sparkbolt Gremlin card.
  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Sparkbolt Gremlin, 150 Essence' })).toBeVisible();

  await page.screenshot({ path: 'test-results/screens/debug-url-w1-l01-844x390.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});

test('debug overlay: shows sim tick, status, stars and entity counts for a level run', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  // Test-only: the first two animation frames run immediately (the boot frame shows
  // tick 900), then the frame loop is slowed down so the requested tick stays visible
  // while the screenshot is taken. The overlay itself is unchanged.
  await page.addInitScript(() => {
    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    let frames = 0;
    window.requestAnimationFrame = (callback) => {
      frames += 1;
      if (frames <= 2) {
        return originalRequestAnimationFrame(callback);
      }
      return window.setTimeout(() => callback(performance.now()), 5000);
    };
  });

  await page.goto('/?level=w1-l01&seed=10001&tick=900&perf=1', { waitUntil: 'commit' });
  await page.waitForTimeout(600);

  // Spec 11.7 / 16.6: ?perf=1 opens the overlay, which now shows the read-only sim state.
  const overlay = page.locator('#debug-overlay');
  await expect(overlay).toBeVisible();
  // The fixed 30 Hz loop can advance a few ticks before the test-only rAF throttle
  // kicks in on a loaded CI runner, so assert the requested boot tick within a
  // documented window instead of the exact string (the overlay itself is unchanged).
  // The environment GLB load (issue #73) can delay the first overlay update on a loaded
  // runner, so poll until the tick line exists instead of failing on an empty first read.
  await expect
    .poll(
      async () => {
        const text = (await overlay.textContent()) ?? '';
        const match = text.match(/tick (\d+)/);
        return match === null ? 0 : Number(match[1]);
      },
      { timeout: 8000 },
    )
    .toBeGreaterThanOrEqual(900);
  const overlayText = (await overlay.textContent()) ?? '';
  const tickMatch = overlayText.match(/tick (\d+)/);
  expect(tickMatch === null ? null : Number(tickMatch[1])).toBeLessThan(960);
  await expect(overlay).toContainText('status playing');
  await expect(overlay).toContainText(/stars [0-3]/);
  await expect(overlay).toContainText(/enemies \d+ \| defenders \d+ \| orbs \d+/);

  await page.screenshot({ path: 'test-results/screens/debug-overlay-w1-l01-844x390.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});

test('debug overlay: the title screen shows renderer stats only', async ({ page }) => {
  await page.goto('/?perf=1');

  const overlay = page.locator('#debug-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(/draw calls \d+/);
  await expect(overlay).toContainText(/triangles [\d,]+/);
  await expect(overlay).not.toContainText('tick ');
});

test('debug URL: unknown level ids show a readable error instead of crashing', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/?level=w1-l99');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('unknown level "w1-l99"');
  await expect(alert).toContainText('w1_l01');
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});
