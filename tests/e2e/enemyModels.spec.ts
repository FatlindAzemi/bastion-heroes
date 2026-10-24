import { expect, test } from '@playwright/test';

// Issue #70: the Pot-Head Gloomling and Shieldbearer models render in the real game.
// W1-L05 is the first level with both enemies (spec 7.2 row 5): at tick 3000 (100 s)
// the Shieldbearer of wave 2 and the Pot-Head of wave 3 are mid-lane and the level is
// still playing, so the game camera shows both models walking towards the base.

const ENEMY_MODEL_URL = '/?level=w1-l05&seed=10005&tick=3000&perf=1&autocollect=1';

const MODEL_IDS = ['pothead', 'shieldbearer'];

test('enemy models: W1-L05 renders the Pot-Head Gloomling and Shieldbearer', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const modelLogs: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
    if (message.type() === 'log' && message.text().startsWith('models: loaded')) {
      modelLogs.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const modelResponses = MODEL_IDS.map((id) =>
    page.waitForResponse((response) => response.url().endsWith(`/models/${id}.glb`)),
  );
  await page.goto(ENEMY_MODEL_URL);
  await Promise.all(modelResponses);

  await expect(page.locator('#app canvas')).toBeVisible();
  // Let the async model load swap the placeholders and the mixers tick a few frames.
  await page.waitForTimeout(900);

  // Both enemies loaded with their spec 12.5 clip set (walk + eat). The async GLB
  // decode/swap can finish after the HTTP response, so poll instead of asserting immediately.
  for (const id of MODEL_IDS) {
    await expect
      .poll(
        () => modelLogs.filter((log) => log.includes(`models: loaded ${id} (2 clips)`)).length,
        { timeout: 15_000 },
      )
      .toBe(1);
  }

  const overlay = page.locator('#debug-overlay');
  await expect(overlay).toContainText(/draw calls \d+/);
  await expect(overlay).toContainText(/status playing/);
  await expect(overlay).toContainText(/enemies [1-9]\d*/);

  await page.screenshot({ path: 'test-results/screens/m3-enemy-models-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screens/m3-enemy-models-1280x720.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});
