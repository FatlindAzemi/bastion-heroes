import { expect, test } from '@playwright/test';

// Spec 16.5 + 3.12: the additive `?level=<id>&scout=1` entry (issue #49) opens the
// Scouting -> Loadout flow, the Recommended button fills 6 slots and "Fight!" starts
// the real level with those cards in the HUD. The spec 13.7 direct-start URL is
// covered by debug.spec.ts and stays unchanged.

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

test('scout flow: Scouting -> Loadout -> Recommended -> Fight starts W1-L05 with 6 cards', async ({
  page,
}) => {
  const errors = trackErrors(page);

  await page.goto('/?level=w1-l05&scout=1');

  // Scout screen: level name, world/level label, terrain/lane facts and 6.2 tips.
  await expect(page.getByTestId('scout-screen')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: 'Shield Wall' })).toBeVisible();
  await expect(page.getByText('World 1 - Level 5')).toBeVisible();
  await expect(page.getByTestId('scout-screen')).toContainText('All 5 lanes open');
  await expect(page.getByTestId('scout-screen')).toContainText('Gloomling');
  await expect(page.getByTestId('scout-screen')).toContainText('Shieldbearer');
  await expect(page.getByTestId('scout-screen')).toContainText('Front shots bounce off the shield');
  await expect(page.getByTestId('scout-screen')).toContainText('Pot-Head Gloomling');

  await page.screenshot({ path: 'test-results/screens/scouting-w1-l05-844x390.png' });
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.screenshot({ path: 'test-results/screens/scouting-w1-l05-1194x834.png' });

  // Continue -> Loadout with the level's 6 empty slots.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('loadout-screen')).toBeVisible();
  await expect(page.getByTestId('loadout-slot')).toHaveCount(6);
  await expect(page.getByTestId('loadout-fight')).toBeDisabled();

  // Recommended fills exactly 6 unique cards (spec 3.12 rule 3).
  await page.getByRole('button', { name: 'Recommended' }).click();
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(6);
  await expect(page.getByTestId('loadout-fight')).toBeEnabled();
  await page.screenshot({ path: 'test-results/screens/loadout-w1-l05-1194x834.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: 'test-results/screens/loadout-w1-l05-844x390.png' });

  // Fight! starts the level through the same run path as the direct debug URL.
  await page.getByRole('button', { name: 'Fight!' }).click();
  await expect(page.locator('.hud-card')).toHaveCount(6);
  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Snowpup Yeti, 175 Essence' })).toBeVisible();

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('scout flow: tutorial levels keep their fixed loadout and hide Recommended', async ({
  page,
}) => {
  const errors = trackErrors(page);

  await page.goto('/?level=w1-l01&scout=1');

  await expect(page.getByRole('heading', { name: 'First Light' })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByTestId('fixed-loadout-note')).toBeVisible();
  await expect(page.getByTestId('fixed-loadout-note')).toContainText('fixed');
  await expect(page.getByTestId('collection-card').first()).toBeDisabled();
  await expect(page.getByTestId('loadout-slot')).toHaveCount(1);
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Recommended' })).toHaveCount(0);
  await expect(page.getByTestId('loadout-fight')).toBeEnabled();

  // Scouting <-> Loadout keeps the fixed loadout when going back and forward.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('scout-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Fight!' }).click();
  await expect(page.locator('.hud-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Sparkbolt Gremlin, 100 Essence' })).toBeVisible();

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});
