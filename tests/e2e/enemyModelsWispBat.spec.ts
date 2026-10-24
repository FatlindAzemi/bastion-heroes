import { expect, test } from '@playwright/test';

// Issue #71: the Shade Wisp and Bat Swarm models render in the real game. W1-L06 is
// the first level with Shade Wisps (spec 7.2 row 6) and W1-L07 the first with Bat
// Swarms (row 7). At tick 2600 (87 s) wave-2 enemies of both kinds are mid-lane and
// the level is still playing, so the game camera shows the walking/flapping models.

interface EnemyCase {
  readonly id: string;
  readonly url: string;
}

const CASES: readonly EnemyCase[] = [
  { id: 'shade_wisp', url: '/?level=w1-l06&seed=10006&tick=2600&perf=1&autocollect=1' },
  { id: 'bat_swarm', url: '/?level=w1-l07&seed=10007&tick=2600&perf=1&autocollect=1' },
];

for (const enemyCase of CASES) {
  test(`enemy model: W1 renders the ${enemyCase.id} model`, async ({ page }) => {
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

    const modelResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/models/${enemyCase.id}.glb`),
    );
    await page.goto(enemyCase.url);
    await modelResponse;

    await expect(page.locator('#app canvas')).toBeVisible();
    // Let the async model load swap the placeholders and the mixers tick a few frames.
    await page.waitForTimeout(900);

    // The enemy model loaded with its spec 12.5 clip set (walk + eat).
    expect(modelLogs.filter((log) => log.includes(`models: loaded ${enemyCase.id} `))).toHaveLength(
      1,
    );
    expect(
      modelLogs.filter((log) => log.includes(`models: loaded ${enemyCase.id} (2 clips)`)),
    ).toHaveLength(1);

    const overlay = page.locator('#debug-overlay');
    await expect(overlay).toContainText(/draw calls \d+/);
    await expect(overlay).toContainText(/status playing/);
    await expect(overlay).toContainText(/enemies [1-9]\d*/);

    await page.screenshot({
      path: `test-results/screens/m3-enemy-${enemyCase.id}-844x390.png`,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `test-results/screens/m3-enemy-${enemyCase.id}-1280x720.png`,
    });

    expect(consoleErrors, 'browser console errors').toEqual([]);
    expect(pageErrors, 'uncaught page errors').toEqual([]);
  });
}
