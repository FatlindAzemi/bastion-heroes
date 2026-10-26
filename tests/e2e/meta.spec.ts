import { expect, test, type Page } from '@playwright/test';

import type { SaveData } from '../../src/meta/save';
import { createNewSave, createRichSave, seedSave, seedSaveOnce } from './saveSeed';

// Issue #113 / M4: every meta screen reachable from the title and level select is
// functional against the real save, and the result overlay follows the M4 actions.

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

/** Reads the persisted save of the page. */
async function readSave(page: Page): Promise<SaveData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('bh_save') ?? '{}') as SaveData);
}

test('meta: the title quick buttons open and close Collection, Chests, Quests and Settings', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await seedSave(page, createRichSave());
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('title-progress')).toContainText('4 / 10 levels cleared');
  await expect(page.getByTestId('title-progress')).toContainText('9 / 30 stars');

  await page.getByTestId('title-collection').click();
  await expect(page.getByTestId('collection-screen')).toBeVisible();
  await expect(page.getByTestId('collection-entry')).toHaveCount(8);
  await page.getByTestId('collection-back').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  await page.getByTestId('title-chests').click();
  await expect(page.getByTestId('chests-screen')).toBeVisible();
  await expect(page.getByTestId('chest-row-wooden')).toHaveAttribute('data-count', '3');
  await page.getByTestId('chests-back').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  await page.getByTestId('title-quests').click();
  await expect(page.getByTestId('quests-screen')).toBeVisible();
  await expect(page.getByTestId('quest-card')).toHaveCount(3);
  await expect(page.getByTestId('quest-card').first()).toHaveAttribute('data-done', 'true');
  await page.getByTestId('quests-back').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  await page.getByTestId('title-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await expect(page.getByTestId('setting-language')).toHaveText('English');
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('meta: Collection sorts owned cards first and upgrades a card into the save', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await seedSave(page, createRichSave());
  await page.goto('/?screen=collection');

  await expect(page.getByTestId('collection-screen')).toBeVisible({ timeout: 15_000 });
  const entries = page.getByTestId('collection-entry');
  await expect(entries).toHaveCount(8);
  await expect(entries.first()).toHaveAttribute('data-defender-id', 'pyro_fox');
  await expect(entries.first()).toHaveAttribute('data-owned', 'true');
  await expect(entries.last()).toHaveAttribute('data-defender-id', 'snowpup_yeti');
  await expect(entries.last()).toHaveAttribute('data-owned', 'false');

  await entries.first().click();
  const detail = page.getByTestId('collection-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute('aria-label', 'Pyro Fox details');
  await expect(page.getByTestId('collection-upgrade')).toBeEnabled();
  await page.getByTestId('collection-upgrade').click();
  await expect(page.getByTestId('collection-message')).toContainText('Upgraded to level 4');
  await expect(detail).toContainText('Lv 4');

  const saved = await readSave(page);
  expect(saved.cards.pyro_fox).toEqual({ level: 4, shards: 0 });
  expect(saved.gold).toBe(1_230);

  await page.getByTestId('collection-close').click();
  await expect(detail).not.toBeVisible();
  await entries.last().click();
  await expect(detail).toHaveAttribute('aria-label', 'Snowpup Yeti details');
  await expect(detail).toContainText('Locked');
  await expect(page.getByTestId('collection-upgrade')).toHaveCount(0);

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('meta: Chests shows the odds, buys a gem chest and opens it with Collect', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await seedSave(page, createRichSave());
  await page.goto('/?screen=chests');

  await expect(page.getByTestId('chests-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chest-pity')).toHaveText('Pity 12/40');
  await expect(page.getByTestId('chests-gems')).toContainText('860');

  await page.getByTestId('chest-info-magic').click();
  const odds = page.getByTestId('chest-odds');
  await expect(odds).toBeVisible();
  await expect(odds).toHaveAttribute('aria-label', 'Magic Chest odds');
  await expect(odds.locator('.chest-odds__row')).toHaveCount(5);
  await expect(odds).toContainText('Legendary');
  await page.getByTestId('chest-odds-close').click();
  await expect(odds).not.toBeVisible();

  await page.getByTestId('chest-buy-magic').click();
  await expect(page.getByTestId('chest-row-magic')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('chests-gems')).toContainText('360');
  await expect(page.getByTestId('chests-message')).toContainText('Chest added');

  await page.getByTestId('chest-open-magic').click();
  const overlay = page.getByTestId('chest-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('aria-label', 'Opening Magic Chest');
  await expect(page.getByTestId('chest-stack')).toHaveCount(4);
  await expect(page.getByTestId('chest-collect')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('chest-collect').click();
  await expect(overlay).not.toBeVisible();
  await expect(page.getByTestId('chest-row-magic')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('chests-gold')).toContainText('2.4K');

  const saved = await readSave(page);
  expect(saved.chests.magic).toBe(0);
  expect(saved.gold).toBe(2_380);
  expect(saved.gems).toBe(360);

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('meta: Settings persists toggles and volume and resets to a new-player save', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await seedSave(page, createRichSave());
  await page.goto('/?screen=settings');

  await expect(page.getByTestId('settings-screen')).toBeVisible({ timeout: 15_000 });
  const autoCollect = page.getByTestId('setting-autocollect');
  await expect(autoCollect).toHaveAttribute('aria-checked', 'false');
  await autoCollect.click();
  await expect(autoCollect).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('setting-music').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '25';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => (await readSave(page)).settings.music).toBe(0.25);
  expect((await readSave(page)).settings.autoCollect).toBe(true);

  await page.getByTestId('setting-reset').click();
  const confirm = page.getByTestId('settings-confirm');
  await expect(confirm).toBeVisible();
  await page.getByTestId('setting-reset-cancel').click();
  await expect(confirm).not.toBeVisible();

  await page.getByTestId('setting-reset').click();
  await page.getByTestId('setting-reset-confirm').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-progress')).toContainText('0 / 10 levels cleared');

  const saved = await readSave(page);
  expect(saved.gold).toBe(0);
  expect(saved.gems).toBe(0);
  expect(saved.levels).toEqual({});
  expect(Object.keys(saved.cards).sort()).toEqual(
    ['frost_witch', 'pyro_fox', 'sparkbolt_gremlin'].sort(),
  );

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('meta: the result rewards offer the next level and the chest screen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?result=won&stars=3&level=w1_l01&rewards=1&next=1&chests=2');
  const overlay = page.getByTestId('result-overlay');
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  const rewards = page.getByTestId('result-rewards');
  await expect(rewards.locator('.result-reward')).toHaveCount(4);
  await expect(rewards).toContainText('Level gold');
  await expect(rewards).toContainText('+60');
  await expect(rewards).toContainText('Star bonus');
  await expect(rewards).toContainText('New card');
  await expect(rewards).toContainText('Glowshroom Monk');
  await expect(page.getByTestId('result-next-label')).toHaveText('Next: Village Path');
  await expect(page.getByTestId('result-next')).toBeEnabled();
  await expect(page.getByTestId('result-chests')).toContainText('Open Chests (2)');

  await page.getByTestId('result-next').click();
  await expect(page.getByTestId('scout-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Village Path' })).toBeVisible();

  await page.goto('/?result=won&stars=3&level=w1_l01&rewards=1&next=1&chests=2');
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await page.getByTestId('result-chests').click();
  await expect(page.getByTestId('chests-screen')).toBeVisible({ timeout: 15_000 });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('meta: the first tutorial tip appears once and is remembered in the save', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await seedSave(page, createNewSave());
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('title-play').click();
  await page.locator('[data-testid="level-card"][data-level-id="w1_l01"]').click();
  await page.getByTestId('scout-continue').click();
  await page.getByTestId('loadout-fight').click();

  const tip = page.getByTestId('hud-tip');
  await expect(tip).toBeVisible({ timeout: 20_000 });
  await expect(tip).toHaveAttribute('data-tip-id', 'tip_w1_l01');
  await expect(tip).toContainText('Tap a card');
  const saved = await readSave(page);
  expect(saved.tutorial.seenHints).toContain('tip_w1_l01');

  await page.getByTestId('hud-tip-dismiss').click();
  await expect(tip).not.toBeVisible();

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('meta: a changed loadout is saved per level and restored after reload', async ({ page }) => {
  const errors = trackErrors(page);
  await seedSaveOnce(page, createRichSave());
  await page.goto('/?screen=levels');
  await expect(page.getByTestId('level-select-screen')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="level-card"][data-level-id="w1_l05"]').click();
  await page.getByTestId('scout-continue').click();
  await expect(page.getByTestId('loadout-screen')).toBeVisible();
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(6);

  await page.getByRole('button', { name: 'Remove Sparkbolt Gremlin' }).click();
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(5);
  await expect(page.getByTestId('loadout-fight')).toBeDisabled();
  const saved = await readSave(page);
  expect(saved.loadouts.w1_l05).toEqual([
    'pyro_fox',
    'frost_witch',
    'glowshroom_monk',
    'iron_granny',
    'boomcap_brewer',
  ]);

  await page.reload();
  await expect(page.getByTestId('level-select-screen')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="level-card"][data-level-id="w1_l05"]').click();
  await page.getByTestId('scout-continue').click();
  await expect(page.getByTestId('loadout-screen')).toBeVisible();
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(5);
  await expect(page.getByTestId('loadout-fight')).toBeDisabled();

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});
