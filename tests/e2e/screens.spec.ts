import { expect, test, type Page } from '@playwright/test';

import { createRichSave, seedSave } from './saveSeed';

// Issue #113 / spec 16.5 screens.spec.ts: visit every screen of the portrait shell and
// write one deterministic screenshot per screen into test-results/screens/. The images
// are the visual evidence of the UI work; the assertions before each screenshot prove
// that the screen really is on display (no screenshot of a blank page).

/** Prefix of the portrait screen captures at the 390x844 phone viewport. */
const SCREENSHOT_DIR = 'test-results/screens';

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

/** Writes the portrait screenshot of the current screen. */
async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/portrait-${name}-390x844.png`,
    animations: 'disabled',
    scale: 'css',
  });
}

/** Writes the phone and tablet evidence of the current screen. */
async function screenshotBoth(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/portrait-${name}-390x844.png`,
    animations: 'disabled',
    scale: 'css',
  });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/portrait-${name}-834x1194.png`,
    animations: 'disabled',
    scale: 'css',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
}

test('screens: title, level select, scouting and loadout at 390x844', async ({ page }) => {
  const errors = trackErrors(page);
  await seedSave(page, createRichSave());
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'title');

  await page.getByTestId('title-play').click();
  await expect(page.getByTestId('level-select-screen')).toBeVisible();
  await expect(page.locator('[data-testid="level-card"]')).toHaveCount(10);
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'level-select');

  await page.locator('[data-testid="level-card"][data-level-id="w1_l05"]').click();
  await expect(page.getByTestId('scout-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shield Wall' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'scouting');

  await page.getByTestId('scout-continue').click();
  await expect(page.getByTestId('loadout-screen')).toBeVisible();
  await page.getByTestId('loadout-recommended').click();
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'loadout');

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('screens: level HUD and pause overlay at 390x844', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?level=w1_l05&seed=10005&tick=900');
  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hud-card')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'level-hud');

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'pause');

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('screens: victory result overlay at 390x844', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?result=won&stars=3&level=w1_l01&rewards=1&next=1&chests=2');
  const overlay = page.getByTestId('result-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute('aria-label', 'Victory!');
  await expect(page.getByTestId('result-rewards').locator('.result-reward')).toHaveCount(4);
  await expect(page.getByTestId('result-next')).toBeEnabled();
  await expect(page.getByTestId('result-chests')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'result');

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('screens: Collection, Chests, Settings and Quests at phone and tablet', async ({ page }) => {
  const errors = trackErrors(page);
  await seedSave(page, createRichSave());

  await page.goto('/?screen=collection');
  await expect(page.getByTestId('collection-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('collection-entry')).toHaveCount(8);
  await screenshotBoth(page, 'collection');
  await page.getByTestId('collection-entry').first().click();
  await expect(page.getByTestId('collection-detail')).toBeVisible();
  await screenshotBoth(page, 'collection-detail');

  await page.goto('/?screen=chests');
  await expect(page.getByTestId('chests-screen')).toBeVisible({ timeout: 15_000 });
  await screenshotBoth(page, 'chests');
  await page.getByTestId('chest-info-magic').click();
  await expect(page.getByTestId('chest-odds')).toBeVisible();
  await screenshotBoth(page, 'chest-odds');
  await page.getByTestId('chest-odds-close').click();
  await page.getByTestId('chest-open-wooden').click();
  await expect(page.getByTestId('chest-collect')).toBeVisible({ timeout: 10_000 });
  await screenshotBoth(page, 'chest-opening');
  await page.getByTestId('chest-collect').click();

  await page.goto('/?screen=settings');
  await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 15_000 });
  await screenshotBoth(page, 'settings');

  await page.goto('/?screen=quests');
  await expect(page.getByTestId('quests-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('quest-card')).toHaveCount(3);
  await screenshotBoth(page, 'quests');

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});
