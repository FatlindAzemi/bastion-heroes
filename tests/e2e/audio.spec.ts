import { expect, test } from '@playwright/test';

// Issue #77 (spec 9.9, 6.3): the audio wrapper must not violate the browser autoplay
// policy. Nothing may play before a user gesture; the first tap unlocks the context,
// starts the level music and the SFX of that tap, and the console stays clean.
test('audio: the first tap unlocks music without autoplay errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const autoplayWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
    if (/autoplay|not allowed to start|AudioContext was not allowed/i.test(message.text())) {
      autoplayWarnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto('/?level=w1-l01&seed=10001&tick=900&perf=1');
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.locator('.hud-card').first()).toBeVisible({ timeout: 5000 });

  // First user gesture: the level music request starts and decodes without errors.
  const musicLoaded = page.waitForResponse(
    (response) => /\/audio\/music\/world1_calm\.(m4a|ogg)$/.test(response.url()) && response.ok(),
    { timeout: 8000 },
  );
  await page.locator('.hud__tap-layer').click({ position: { x: 420, y: 260 } });
  await musicLoaded;
  await page.waitForTimeout(600);

  expect(autoplayWarnings, 'autoplay warnings').toEqual([]);
  expect(consoleErrors, 'browser console errors').toEqual([]);
});

test('audio: selecting a card plays its SFX after the gesture', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto('/?level=w1-l01&seed=10001&tick=900&perf=1');
  await expect(page.locator('.hud-card').first()).toBeVisible({ timeout: 5000 });

  // Selecting the first card requests and plays its card_select SFX (spec 9.9).
  const sfxLoaded = page.waitForResponse(
    (response) => /\/audio\/sfx\/card_select\.m4a$/.test(response.url()) && response.ok(),
    { timeout: 8000 },
  );
  await page.locator('.hud-card').first().click();
  await sfxLoaded;
  await page.waitForTimeout(400);

  expect(consoleErrors, 'browser console errors').toEqual([]);
});
