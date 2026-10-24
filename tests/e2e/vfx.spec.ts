import { expect, test, type Page } from '@playwright/test';

// Issue #75 (spec 9.7): the VFX set and the juice feedback render in the real game.
// The debug-only `?debugvfx=<id>` helper (like `?debuganim=` of #74) loops one VFX so
// a still can capture it deterministically; the real-hit test uses actual defenders.

/** Reads draw calls and triangles from the `?perf=1` overlay and checks the 11.7 budget. */
async function readStats(page: Page): Promise<{ drawCalls: number; triangles: number }> {
  const text = (await page.locator('#debug-overlay').textContent()) ?? '';
  const drawCalls = Number(/draw calls (\d+)/.exec(text)?.[1] ?? Number.NaN);
  const triangles = Number(/triangles ([\d,]+)/.exec(text)?.[1]?.replaceAll(',', '') ?? Number.NaN);
  expect(drawCalls, 'draw calls (spec 11.7: below 150)').toBeLessThan(150);
  expect(triangles, 'triangles (spec 11.7: below 300,000)').toBeLessThan(300_000);
  return { drawCalls, triangles };
}

/** Tracks console and page errors for one test. */
function trackErrors(page: Page): { console: string[]; page: string[] } {
  const errors = { console: [] as string[], page: [] as string[] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.console.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.page.push(error.message);
  });
  return errors;
}

test('vfx: a real fight shows damage numbers and health bars over the enemies', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // W1-L01 at tick 1200 has 325 Essence; the Frost Witch is placed forward at column 5
  // so she engages the incoming Gloomling within a second of live play.
  await page.goto(
    '/?level=w1-l01&seed=10001&tick=1200&perf=1&autocollect=1&cards=frost_witch&place=frost_witch:2,5',
  );
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.locator('#debug-overlay')).toContainText(/status playing/, { timeout: 15_000 });
  // Let the placed defender activate, attack and take the enemy down to a damaged state.
  await expect
    .poll(
      async () =>
        Number(
          /tick (\d+)/.exec((await page.locator('#debug-overlay').textContent()) ?? '')?.[1] ?? 0,
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(1320);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screens/m3-vfx-hits-844x390.png' });
  await readStats(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m3-vfx-hits-1280x720.png' });
  expect(errors.console, 'browser console errors').toEqual([]);
  expect(errors.page, 'uncaught page errors').toEqual([]);
});

/** The deterministic debug VFX stills: combo popup, damage numbers, shake and confetti. */
const DEBUG_CASES: readonly { readonly name: string; readonly vfx: string }[] = [
  { name: 'combo', vfx: 'combo_steam' },
  { name: 'damage', vfx: 'hit_pierce' },
  { name: 'shake', vfx: 'shake' },
  { name: 'confetti', vfx: 'win_confetti' },
];

for (const debugCase of DEBUG_CASES) {
  test(`vfx: the ${debugCase.name} effect renders and stays inside the 11.7 budget`, async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(`/?level=w1-l01&seed=10001&tick=900&perf=1&debugvfx=${debugCase.vfx}`);
    await expect(page.locator('#app canvas')).toBeVisible();
    await expect(page.locator('#debug-overlay')).toContainText(/status playing/, {
      timeout: 15_000,
    });
    // The debug helper loops the effect every 0.5 s; wait for at least one full burst.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/screens/m3-vfx-${debugCase.name}-844x390.png` });
    const stats = await readStats(page);
    expect(stats.drawCalls).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/screens/m3-vfx-${debugCase.name}-1280x720.png` });
    expect(errors.console, 'browser console errors').toEqual([]);
    expect(errors.page, 'uncaught page errors').toEqual([]);
  });
}
