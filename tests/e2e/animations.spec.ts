import { expect, test } from '@playwright/test';

// Issue #74: the spec 9.6 procedural animations (spawn drop/squash, merge jump/spin,
// death shrink/spin + poofs) and the event-driven Blender clip playback. The
// `?debuganim=<kind>:<progress>` helper holds one code animation at a fixed moment so
// the Playwright stills are deterministic; `?cards=&place=&autocollect=1` come from
// issue #66. Every test also checks the 11.7 draw budgets and zero console errors.

/** Screen point of tile lane 0, column 0 at 844x390 (projected 9.1 camera, no sky drop tile). */
const MERGE_TILE = { x: 277, y: 160 };

/** Records browser console errors and uncaught page errors for the final assertions. */
function trackErrors(page: import('@playwright/test').Page): {
  consoleErrors: string[];
  pageErrors: string[];
} {
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
  return { consoleErrors, pageErrors };
}

/** Reads the debug overlay and asserts the spec 11.7 draw-call and triangle budgets. */
async function expectDrawBudget(page: import('@playwright/test').Page): Promise<void> {
  const text = (await page.locator('#debug-overlay').textContent()) ?? '';
  const drawCalls = Number(/draw calls (\d+)/.exec(text)?.[1] ?? Number.NaN);
  const triangles = Number(
    /(?:triangles) ([\d,]+)/.exec(text)?.[1]?.replace(/,/g, '') ?? Number.NaN,
  );
  expect(Number.isFinite(drawCalls), `overlay text: ${text}`).toBe(true);
  expect(Number.isFinite(triangles), `overlay text: ${text}`).toBe(true);
  expect(drawCalls, 'draw calls (spec 11.7: below 150)').toBeLessThan(150);
  expect(triangles, 'triangles (spec 11.7: below 300,000)').toBeLessThan(300_000);
}

/** Waits until the debug overlay reports that no defenders are left. */
async function waitForDefendersGone(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#debug-overlay').waitFor({ timeout: 10_000 });
  await page.waitForFunction(
    () => /defenders 0/.test(document.querySelector('#debug-overlay')?.textContent ?? ''),
    { timeout: 30_000 },
  );
}

// The in-game merge/death tests drive a real WebGL scene and wait for star pips and
// clip playback; under CI load they can exceed Playwright's default 30 s timeout.
test.setTimeout(90_000);

test('procedural animations: spawn drop is visible at 844x390 and 1280x720', async ({ page }) => {
  const errors = trackErrors(page);
  const url =
    '/?level=w1-l05&seed=10005&tick=900&perf=1' +
    '&cards=glowshroom_monk,sparkbolt_gremlin&autocollect=1' +
    '&place=glowshroom_monk:2,1;sparkbolt_gremlin:2,5' +
    '&debuganim=spawn:0.3';
  await page.goto(url);
  await expect(page.locator('.hud-card')).toHaveCount(2, { timeout: 10_000 });
  await page.waitForTimeout(900);
  await expectDrawBudget(page);
  await page.screenshot({ path: 'test-results/screens/m3-anim-spawn-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m3-anim-spawn-1280x720.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('procedural animations: a real merge jumps, spins and shows ★2 pips', async ({ page }) => {
  const errors = trackErrors(page);
  // At tick 1800 a shooter has enough auto-collected Essence for two placements; its
  // 7.5 s cooldown passes at 2x speed while the merge debug hold freezes the animation.
  await page.goto(
    '/?level=w1-l05&seed=10005&tick=1800&cards=sparkbolt_gremlin&autocollect=1' +
      '&debuganim=merge:0.5&perf=1',
  );
  await expect(page.locator('.hud-card')).toHaveCount(1, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Speed 1 times' }).click();
  await page.getByRole('button', { name: 'Sparkbolt Gremlin, 150 Essence' }).click();
  await page.mouse.click(MERGE_TILE.x, MERGE_TILE.y);
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: 'Sparkbolt Gremlin, 150 Essence' }).click();
  await page.mouse.click(MERGE_TILE.x, MERGE_TILE.y);
  // The second placement merges the same defender and raises the card to the ★2 pips.
  await expect(page.locator('.hud-card__star')).toHaveCount(2);
  await expectDrawBudget(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m3-anim-merge-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screens/m3-anim-merge-1280x720.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('procedural animations: an eaten defender shrinks and spins before removal', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // At tick 1296 a Gloomling is at x~7.05 in lane 2; the Monk placed on tile 2,6 blocks it
  // and is eaten after ~3 s. The debug hold freezes the 0.4 s death animation.
  await page.goto(
    '/?level=w1-l05&seed=10005&tick=1296&perf=1' +
      '&cards=glowshroom_monk&autocollect=1' +
      '&place=glowshroom_monk:2,6&debuganim=death:0.35',
  );
  await waitForDefendersGone(page);
  await page.waitForTimeout(2500);
  await expectDrawBudget(page);
  await page.screenshot({ path: 'test-results/screens/m3-anim-death-844x390.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m3-anim-death-1280x720.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});
