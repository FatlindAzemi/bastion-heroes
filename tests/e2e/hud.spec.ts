import { expect, test } from '@playwright/test';

// Spec 9.8 final HUD (issue #76): the complete in-level HUD, bundled fonts, SVG icons,
// card visuals, level progress and wave banner, plus the Scouting/Loadout card styling
// and the title screen at 844x390 and 1280x720. Every test also asserts that the
// browser console and page stay error-free.

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

/** Checks that the three bundled font faces are loaded and usable. */
async function expectBundledFonts(page: import('@playwright/test').Page): Promise<void> {
  const fonts = await page.evaluate(async () => {
    const faces = ['16px "Lilita One"', '700 16px Nunito', '800 16px Nunito'];
    await Promise.all(faces.map((face) => document.fonts.load(face)));
    await document.fonts.ready;
    return {
      lilita: document.fonts.check('16px "Lilita One"'),
      nunitoBold: document.fonts.check('700 16px Nunito'),
      nunitoExtraBold: document.fonts.check('800 16px Nunito'),
    };
  });
  expect(fonts).toEqual({ lilita: true, nunitoBold: true, nunitoExtraBold: true });
}

/** Checks that every rendered M3 card portrait image actually loaded (issue #66). */
async function expectPortraitsLoaded(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.locator('.card-portrait__image').evaluateAll((images) => {
          return (
            images.length > 0 &&
            images.every((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)
          );
        }),
      { timeout: 5000 },
    )
    .toBe(true);
}

/** Checks that every rendered SVG icon actually loaded (no broken/placeholder images). */
async function expectIconsLoaded(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.locator('.ui-icon').evaluateAll((images) => {
          return (
            images.length > 0 &&
            images.every((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)
          );
        }),
      { timeout: 5000 },
    )
    .toBe(true);
}

test('final HUD: renders every 9.8 element with bundled fonts and SVG icons at 844x390', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/?level=w1-l05&seed=10005&tick=900');

  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.hud-card')).toHaveCount(6);
  await expect(page.locator('.hud-card__cost')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Shovel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speed 1 times' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Level progress' })).toBeVisible();
  await expectBundledFonts(page);
  await expectIconsLoaded(page);
  await expectPortraitsLoaded(page);
  await page.screenshot({ path: 'test-results/screens/m3-hud-w1-l05-844x390.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('final HUD: slides the BIG wave banner in and flags the BIG and FINAL waves', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // Test-only: pin the fast-forwarded frame so the HUD cannot advance past the BIG wave
  // start (tick 2851) while the page is loading; the banner and progress assertions then
  // describe tick 2770 exactly, like the spec 13.7 screenshot runs.
  await page.addInitScript(() => {
    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    let frames = 0;
    window.requestAnimationFrame = (callback) => {
      frames += 1;
      if (frames <= 2) {
        return originalRequestAnimationFrame(callback);
      }
      return window.setTimeout(() => callback(performance.now()), 5000);
    };
  });
  // W1-L05 shows its BIG wave banner at tick 2761, so 2770 is the first rendered frame
  // with the banner on screen (spec 3.10, spec 13.7 tick fast-forward).
  await page.goto('/?level=w1-l05&seed=10005&tick=2770');

  await expect(page.locator('.hud-banner')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.hud-banner')).toContainText('A huge wave is coming!');
  await expect(page.locator('.hud-progress__mark--big')).toHaveCount(1);
  await expect(page.locator('.hud-progress__mark--final')).toHaveCount(1);
  // At tick 2770 the BIG wave banner is a 3 s warning and wave 3 has not started yet,
  // so the bar still shows the two completed waves (2 / 6 = 33 %).
  await expect(page.getByRole('progressbar', { name: 'Level progress' })).toHaveAttribute(
    'aria-valuenow',
    '33',
  );
  await page.screenshot({ path: 'test-results/screens/m3-hud-banner-844x390.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('final HUD: shows cooldown overlays on the cards that are still recharging', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // At tick 100 the starts-not-ready cards (Iron Granny, Frost Witch, Pyro Fox) are on cooldown.
  await page.goto('/?level=w1-l05&seed=10005&tick=100');

  await expect(page.locator('.hud-card')).toHaveCount(6);
  await expect(page.locator('.hud-card__cooldown')).toHaveCount(3);
  await expect(page.locator('.hud-card__cooldown-label').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/m3-hud-cooldown-844x390.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('final HUD: Scouting/Loadout cards use the shared portrait and rarity styling', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?level=w1-l05&scout=1');
  await expect(page.getByTestId('scout-screen')).toBeVisible({ timeout: 5000 });
  await expectBundledFonts(page);

  await page.getByTestId('scout-continue').click();
  await page.getByTestId('loadout-recommended').click();
  await expect(page.getByTestId('collection-card')).toHaveCount(8);
  await expect(page.locator('[data-testid="loadout-slot"][data-filled="true"]')).toHaveCount(6);
  await expect(page.locator('.defender-card .card-portrait')).toHaveCount(8);
  await expect(page.locator('.loadout-slot .card-portrait')).toHaveCount(6);
  await expectIconsLoaded(page);
  await expectPortraitsLoaded(page);
  await page.screenshot({ path: 'test-results/screens/m3-hud-loadout-1280x720.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});

test('final HUD: title screen renders the game title in the bundled Lilita One at 1280x720', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bastion Heroes' })).toBeVisible({
    timeout: 5000,
  });
  await expectBundledFonts(page);
  await page.screenshot({ path: 'test-results/screens/m3-hud-title-1280x720.png' });

  expect(errors.consoleErrors, 'browser console errors').toEqual([]);
  expect(errors.pageErrors, 'uncaught page errors').toEqual([]);
});
