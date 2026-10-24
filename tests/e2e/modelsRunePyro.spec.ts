import { expect, test } from '@playwright/test';

// Issue #68: the Rune Archer and Pyro Fox models render in the real game. W1-L01 at
// tick 1200 has collected five sky drops (150 + 5 * 35 = 325 Essence), enough for the
// Rune Archer (150) and the Pyro Fox (175); the debug URL places both on lane 2.

const DEFENDER_URL =
  '/?level=w1-l01&seed=10001&tick=1200&perf=1' +
  '&cards=rune_archer,pyro_fox' +
  '&place=rune_archer:2,1;pyro_fox:2,4' +
  '&autocollect=1';

const MODEL_IDS = ['rune_archer', 'pyro_fox'];

test('defender models: Rune Archer and Pyro Fox render in W1-L01', async ({ page }) => {
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
  await page.goto(DEFENDER_URL);
  await Promise.all(modelResponses);

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.hud-card')).toHaveCount(2);
  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(900);

  // The async GLB decode/swap can finish after the HTTP response, so poll per model id.
  for (const id of MODEL_IDS) {
    await expect
      .poll(
        () => modelLogs.filter((log) => log.includes(`models: loaded ${id} (3 clips)`)).length,
        { timeout: 15_000 },
      )
      .toBe(1);
  }

  const overlay = page.locator('#debug-overlay');
  await expect(overlay).toContainText(/defenders 2/);
  await expect(overlay).toContainText(/enemies [1-9]\d*/);
  const stats = (await overlay.textContent()) ?? '';
  console.log(`RUNE_PYRO_STATS ${stats.replace(/\s+/g, ' ').trim()}`);

  await page.screenshot({ path: 'test-results/screens/m3-defenders-rune-pyro-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screens/m3-defenders-rune-pyro-1280x720.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});
