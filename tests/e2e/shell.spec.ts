import { expect, test, type Page } from '@playwright/test';

// Issue #113: the portrait playable shell. These tests walk the real player flow
// title -> level select -> Scouting -> Loadout -> Fight -> in-level HUD, the pause
// overlay (Resume/Restart/Quit), the deterministic Victory/Defeat result overlay
// (`?result=won|lost`, debug-only URL contract) and the desktop phone frame. Every
// test also checks that the portrait layout has no horizontal overflow and that the
// browser console stays clean.

/** Records browser console errors and uncaught page errors for the final assertions. */
function trackErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
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

/** Asserts that the page does not scroll horizontally at the current viewport. */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    sizes.scrollWidth,
    `horizontal overflow: scrollWidth ${sizes.scrollWidth} > clientWidth ${sizes.clientWidth}`,
  ).toBeLessThanOrEqual(sizes.clientWidth);
}

/** Waits for the in-level HUD: Essence counter, the loadout cards and the shovel. */
async function expectHudVisible(page: Page, expectedCards: number): Promise<void> {
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hud-card')).toHaveCount(expectedCards);
  await expect(page.getByRole('button', { name: 'Shovel' })).toBeVisible();
}

/**
 * Walks the shell from the title screen to the in-level HUD of W1-L01 and returns
 * after "Fight!" started the level. The level select is scoped to the first card so
 * the test does not depend on the visual order or pixel positions of the grid.
 */
async function fightLevelOneFromTitle(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('title-play').click();

  await expect(page.getByTestId('level-select-screen')).toBeVisible();
  await expect(page.locator('[data-testid="level-card"]')).toHaveCount(10);
  await page.locator('[data-testid="level-card"][data-level-id="w1_l01"]').click();

  await expect(page.getByTestId('scout-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First Light' })).toBeVisible();
  await page.getByTestId('scout-continue').click();

  await expect(page.getByTestId('loadout-screen')).toBeVisible();
  // W1-L01 is the tutorial: it has a fixed one-card loadout and hides Recommended.
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(1);
  await expect(page.getByTestId('loadout-fight')).toBeEnabled();
  await page.getByTestId('loadout-fight').click();

  // W1-L01 is the fixed tutorial loadout, so the HUD shows exactly one card.
  await expectHudVisible(page, 1);
}

test('shell: title -> play -> level select -> level 1 -> scouting -> loadout -> fight -> HUD', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: /Bastion Heroes/ })).toBeVisible();
  await expect(page.getByTestId('title-play')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('title-play').click();
  await expect(page.getByTestId('level-select-screen')).toBeVisible();
  await expect(page.locator('[data-testid="level-card"]')).toHaveCount(10);
  await expect(page.locator('[data-testid="level-card"][data-level-id="w1_l01"]')).toHaveAttribute(
    'aria-label',
    'Level 1, First Light, no stars',
  );
  // The campaign path is strict: the first level is playable, the next is locked.
  const firstLevel = page.locator('[data-testid="level-card"][data-level-id="w1_l01"]');
  const secondLevel = page.locator('[data-testid="level-card"][data-level-id="w1_l02"]');
  await expect(firstLevel).toBeEnabled();
  await expect(secondLevel).toBeDisabled();
  await expect(secondLevel).toHaveAttribute('aria-label', 'Level 2, Village Path, locked');
  await expect(secondLevel).toHaveAttribute('data-locked', 'true');
  await expectNoHorizontalOverflow(page);

  // The level select's daily-quest shortcut reaches the quests and returns.
  await page.getByTestId('level-quests').click();
  await expect(page.getByTestId('quests-screen')).toBeVisible();
  await expect(page.getByTestId('quest-card')).toHaveCount(3);
  await page.getByTestId('quests-back').click();
  await expect(page.getByTestId('level-select-screen')).toBeVisible();

  await page.locator('[data-testid="level-card"][data-level-id="w1_l01"]').click();
  await expect(page.getByTestId('scout-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First Light' })).toBeVisible();
  await expect(page.getByTestId('scout-continue')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('scout-continue').click();
  await expect(page.getByTestId('loadout-screen')).toBeVisible();
  // W1-L01 is the tutorial: it has exactly one fixed loadout slot and hides Recommended.
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(1);
  await expect(page.getByTestId('loadout-recommended')).toHaveCount(0);
  await expect(page.getByTestId('loadout-fight')).toBeEnabled();
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('loadout-fight').click();
  await expectHudVisible(page, 1);
  await expectNoHorizontalOverflow(page);

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('shell: the pause overlay resumes, restarts and quits the level', async ({ page }) => {
  const errors = trackErrors(page);
  await fightLevelOneFromTitle(page);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await expect(page.getByTestId('pause-restart')).toBeVisible();
  await expect(page.getByTestId('pause-quit')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Resume closes the overlay and keeps the level running.
  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause-overlay')).not.toBeVisible();
  await expectHudVisible(page, 1);

  // Restart starts the same level again with a fresh HUD.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByTestId('pause-restart').click();
  await expect(page.getByTestId('pause-overlay')).not.toBeVisible();
  await expectHudVisible(page, 1);

  // Quit returns to the level select of the shell.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByTestId('pause-quit').click();
  await expect(page.getByTestId('level-select-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="level-card"]')).toHaveCount(10);
  await expectNoHorizontalOverflow(page);

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('shell: the deterministic Victory result overlay shows 3 stars and Retry/Levels', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/?result=won&stars=3&level=w1_l01');

  const overlay = page.getByTestId('result-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute('role', 'dialog');
  await expect(overlay).toHaveAttribute('aria-label', 'Victory!');
  await expect(overlay.locator('h1')).toHaveText('Victory!');
  await expect(overlay.getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
  await expect(page.getByTestId('result-retry')).toBeEnabled();
  await expect(page.getByTestId('result-levels')).toBeEnabled();
  await expectNoHorizontalOverflow(page);

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('shell: the deterministic Defeat result overlay shows 0 stars', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?result=lost&level=w1_l01');

  const overlay = page.getByTestId('result-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute('aria-label', 'Defeat');
  await expect(overlay.locator('h1')).toHaveText('Defeat');
  await expect(overlay.getByRole('img', { name: '0 of 3 stars' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('shell: a 1280x900 desktop shows the game in a centred 9:19.5 portrait phone frame', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 10_000 });

  const appBox = await page.locator('#app').boundingBox();
  const viewport = page.viewportSize();
  if (appBox === null || viewport === null) {
    throw new Error('The phone frame or the viewport has no size');
  }
  const frameRatio = appBox.width / appBox.height;
  expect(frameRatio, 'phone frame aspect ratio 9:19.5').toBeCloseTo(9 / 19.5, 2);
  expect(appBox.width, 'frame is narrower than the desktop viewport').toBeLessThan(
    viewport.width / 2,
  );
  const centerOffset = Math.abs(appBox.x + appBox.width / 2 - viewport.width / 2);
  expect(centerOffset, 'frame is horizontally centred').toBeLessThanOrEqual(2);
  const centeredOffset = Math.abs(appBox.y + appBox.height / 2 - viewport.height / 2);
  expect(centeredOffset, 'frame is vertically centred').toBeLessThanOrEqual(2);
  // The WebGL canvas fills the frame instead of the desktop viewport.
  const canvasBox = await page.locator('#app canvas').boundingBox();
  if (canvasBox === null) {
    throw new Error('The phone frame canvas has no size');
  }
  expect(Math.round(canvasBox.width)).toBe(Math.round(appBox.width));
  expect(Math.round(canvasBox.height)).toBe(Math.round(appBox.height));
  await expectNoHorizontalOverflow(page);

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});
