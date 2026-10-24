import { expect, test } from '@playwright/test';

// Issue #66: the style pilot models render in the real game. The debug URL extension
// (?cards= + ?place=) overrides the tutorial loadout and places the Glowshroom Monk and
// Sparkbolt Gremlin at tick 0, so a deep tick shows all three pilot models at once
// (the first Gloomling wave spawns at tick 600, spec 7.2 row 1).

const PILOT_URL =
  '/?level=w1-l01&seed=10001&tick=900&perf=1' +
  '&cards=glowshroom_monk,sparkbolt_gremlin&autocollect=1' +
  '&place=glowshroom_monk:2,1;sparkbolt_gremlin:2,4';

const MODEL_IDS = ['glowshroom_monk', 'sparkbolt_gremlin', 'gloomling'];

test('style pilot: W1-L01 renders the monk, gremlin and gloomling models', async ({ page }) => {
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
  await page.goto(PILOT_URL);
  await Promise.all(modelResponses);

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  // The debug loadout shows exactly the two placed cards.
  await expect(page.locator('.hud-card')).toHaveCount(2);
  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible({ timeout: 5000 });

  // Let the async model load swap the placeholders and the mixers tick a few frames.
  // Poll every committed model id (#95 hardening) because the loader logs the three
  // pilots plus the two M2 enemy models; the decode can finish after the responses.
  for (const [id, clips] of [
    ['glowshroom_monk', 3],
    ['sparkbolt_gremlin', 3],
    ['gloomling', 2],
    ['pothead', 2],
    ['shieldbearer', 2],
  ] as const) {
    await expect
      .poll(
        () =>
          modelLogs.filter((log) => log.includes(`models: loaded ${id} (${clips} clips)`)).length,
        { timeout: 15_000 },
      )
      .toBe(1);
  }
  // All three models loaded with their spec 12.5 clip sets (identity, attack/eat, etc.).
  // The loader loads every committed model; #70 added the two M2 enemies, so the
  // style-pilot level now logs the three pilot models plus the two enemy models.
  const clipCounts = new Map<string, number>();
  for (const log of modelLogs) {
    const match = /models: loaded (\S+) \((\d+) clips\)/.exec(log);
    if (match !== null) {
      clipCounts.set(match[1] ?? '', Number(match[2]));
    }
  }
  expect(clipCounts.get('glowshroom_monk')).toBe(3);
  expect(clipCounts.get('sparkbolt_gremlin')).toBe(3);
  expect(clipCounts.get('gloomling')).toBe(2);
  expect(clipCounts.get('pothead')).toBe(2);
  expect(clipCounts.get('shieldbearer')).toBe(2);

  const overlay = page.locator('#debug-overlay');
  await expect(overlay).toContainText(/draw calls \d+/);
  await expect(overlay).toContainText(/enemies [1-9]\d*/);
  await expect(overlay).toContainText(/defenders 2/);
  const stats = (await overlay.textContent()) ?? '';
  console.log(`STYLE_PILOT_STATS ${stats.replace(/\s+/g, ' ').trim()}`);

  await page.screenshot({ path: 'test-results/screens/m3-style-pilot-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screens/m3-style-pilot-1280x720.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});

// The Gloomling close-up: no shooter in the loadout, so by tick 3000 (100 s) the first
// Gloomling is close to the Monk and large enough to review its shape and glowing eyes.
const GLOOMLING_URL =
  '/?level=w1-l01&seed=10001&tick=3000&perf=1' +
  '&cards=glowshroom_monk&place=glowshroom_monk:2,1&autocollect=1';

test('style pilot: the Gloomling walks up to the Monk in W1-L01', async ({ page }) => {
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

  const modelResponses = MODEL_IDS.map((id) =>
    page.waitForResponse((response) => response.url().endsWith(`/models/${id}.glb`)),
  );
  await page.goto(GLOOMLING_URL);
  await Promise.all(modelResponses);
  await expect(page.locator('#app canvas')).toBeVisible();
  await page.waitForTimeout(900);

  const overlay = page.locator('#debug-overlay');
  await expect(overlay).toContainText(/enemies [1-9]\d*/);
  await page.screenshot({ path: 'test-results/screens/m3-style-pilot-gloomling-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screens/m3-style-pilot-gloomling-1280x720.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});
