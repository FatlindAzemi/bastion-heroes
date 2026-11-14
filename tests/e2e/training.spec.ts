import { expect, test, type Locator, type Page } from '@playwright/test';

// Issue #130 (spec 18.9, 18.10, 20.6): a Training match is playable from Home to Result at
// 390 x 844 against every bot level. Each run plays a raider and a defender through the
// real HUD (tap the card, tap the board), surrenders through the match menu, checks the
// result screen and returns Home. The `normal` run writes the PR screenshots.

const SCREENSHOT_DIR = 'docs/screenshots';
/** Spec 9.8: minimum touch target. */
const MIN_TOUCH_PX = 48;
/** A tap in lane 2 on the opponent's half: any lane works for a raider (spec 18.5). */
const RAIDER_TAP = { x: 195, y: 400 };
/** Lane 2, column 1: one of the player's own columns in the south view (spec 18.1). */
const DEFENDER_TAP = { x: 195, y: 510 };

/** Asserts the element is at least 48 x 48 CSS pixels (spec 9.8). */
async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
}

/** Writes one PR screenshot at the phone viewport. */
async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/d1-training-${name}-390x844.jpg`,
    quality: 82,
    scale: 'css',
  });
}

/** The player's Essence as the HUD shows it. */
async function essenceOf(page: Page): Promise<number> {
  return Number(await page.getByTestId('duel-essence').getAttribute('data-essence'));
}

/** The cheapest hand card of a kind and its cost, read from the card labels. */
async function cheapestCard(page: Page, kind: 'defender' | 'raider') {
  const cards = page.locator(`[data-testid="duel-card"][data-kind="${kind}"]`);
  let best: { cardId: string; cost: number } | null = null;
  for (const card of await cards.all()) {
    const label = (await card.getAttribute('aria-label')) ?? '';
    const cost = Number(/(\d+) Essence/.exec(label)?.[1] ?? '99');
    const cardId = (await card.getAttribute('data-card-id')) ?? '';
    if (best === null || cost < best.cost) {
      best = { cardId, cost };
    }
  }
  return best;
}

/** Holds the cheapest card of a kind, taps the board and waits until the card left the hand. */
async function playCard(page: Page, kind: 'defender' | 'raider', screenshotName?: string) {
  const card = await cheapestCard(page, kind);
  expect(card).not.toBeNull();
  const { cardId, cost } = card ?? { cardId: '', cost: 0 };
  await expect.poll(() => essenceOf(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(cost);
  const button = page.locator(`[data-testid="duel-card"][data-card-id="${cardId}"]`);
  await expectTouchTarget(button);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  if (screenshotName !== undefined) {
    await page.waitForTimeout(400);
    await capture(page, screenshotName);
  }
  const tap = kind === 'raider' ? RAIDER_TAP : DEFENDER_TAP;
  await page.mouse.click(tap.x, tap.y);
  await expect(button).toHaveCount(0, { timeout: 15_000 });
}

/** Home -> Training sheet -> bot level -> the Duel HUD after the countdown. */
async function startTraining(page: Page, level: string, screenshots: boolean): Promise<void> {
  await page.goto('/');
  const entry = page.getByTestId('title-training');
  await expect(entry).toBeVisible();
  await expectTouchTarget(entry);
  if (screenshots) {
    await page.waitForTimeout(1500);
    await capture(page, 'home');
  }
  await entry.click();
  const levelButton = page.getByTestId(`training-${level}`);
  await expectTouchTarget(levelButton);
  await levelButton.click();
  await expect(page.getByTestId('duel-card')).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByTestId('duel-opponent')).toContainText('AI');
  await expect(page.getByTestId('duel-countdown')).toHaveCount(0, { timeout: 60_000 });
}

/** Match menu -> confirm -> result screen (Defeat by surrender) -> Home. */
async function surrenderAndGoHome(page: Page, screenshots: boolean): Promise<void> {
  const menu = page.getByTestId('duel-menu');
  await expectTouchTarget(menu);
  await menu.click();
  await page.getByTestId('duel-surrender-confirm').click();
  const result = page.getByTestId('duel-result');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute('data-outcome', 'lost');
  await expect(result).toContainText('You surrendered.');
  await expect(page.getByTestId('duel-result-note')).toContainText('no trophies');
  await expectTouchTarget(page.getByTestId('duel-play-again'));
  await expectTouchTarget(page.getByTestId('duel-home'));
  if (screenshots) {
    await page.waitForTimeout(800);
    await capture(page, 'result');
  }
  await page.getByTestId('duel-home').click();
  await expect(page.getByTestId('title-training')).toBeVisible();
}

for (const level of ['easy', 'normal', 'hard'] as const) {
  test(`training: Home to Result against the ${level} bot at 390x844`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const screenshots = level === 'normal';
    await startTraining(page, level, screenshots);
    for (const card of await page.getByTestId('duel-card').all()) {
      await expectTouchTarget(card);
    }
    await playCard(page, 'raider');
    await playCard(page, 'defender', screenshots ? 'hud-held-card' : undefined);
    await surrenderAndGoHome(page, screenshots);
    expect(pageErrors).toEqual([]);
  });
}
