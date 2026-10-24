import { expect, test } from '@playwright/test';

// Issue #67: the Boomcap Brewer and Snowpup Yeti models render in the real game.
// W1-L01 at tick 1200 has collected five sky drops (150 + 5 * 35 = 325 Essence), so the
// debug URL can place both defenders (150 + 175) at tick 0 and show them in the lane.

const DEFENDER_URL =
  '/?level=w1-l01&seed=10001&tick=1200&perf=1' +
  '&cards=boomcap_brewer,snowpup_yeti' +
  '&place=boomcap_brewer:2,1;snowpup_yeti:2,4' +
  '&autocollect=1';

const MODEL_IDS = [
  'glowshroom_monk',
  'sparkbolt_gremlin',
  'gloomling',
  'boomcap_brewer',
  'snowpup_yeti',
];

test('defender models: Boomcap Brewer and Snowpup Yeti render in W1-L01', async ({ page }) => {
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

  // Both new models loaded with their spec 12.5 clip set (idle + attack + victory).
  const clipCounts = new Map<string, number>();
  for (const log of modelLogs) {
    const match = /models: loaded (\S+) \((\d+) clips\)/.exec(log);
    if (match !== null) {
      clipCounts.set(match[1] ?? '', Number(match[2]));
    }
  }
  expect(clipCounts.get('boomcap_brewer')).toBe(3);
  expect(clipCounts.get('snowpup_yeti')).toBe(3);

  const overlay = page.locator('#debug-overlay');
  await expect(overlay).toContainText(/defenders 2/);
  await expect(overlay).toContainText(/enemies [1-9]\d*/);
  const stats = (await overlay.textContent()) ?? '';
  console.log(`DEFENDER_MODELS_STATS ${stats.replace(/\s+/g, ' ').trim()}`);

  await page.screenshot({ path: 'test-results/screens/m3-defenders-boomcap-snowpup-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screens/m3-defenders-boomcap-snowpup-1280x720.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});
