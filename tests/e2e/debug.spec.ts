import { expect, test } from '@playwright/test';

// Spec 13.7 debug URL: boots a level at the requested tick with the HUD, without
// console errors. Playwright serves the production build through `vite preview`.
test('debug URL: boots W1-L01 at tick 900 with the HUD', async ({ page }) => {
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

  await page.goto('/?level=w1-l01&seed=10001&tick=900');

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  // The HUD reads the real sim: starting Essence of W1-L01 and the fixed Sparkbolt Gremlin card.
  await expect(page.getByRole('status', { name: /Essence/ })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Sparkbolt Gremlin, 100 Essence' })).toBeVisible();

  await page.screenshot({ path: 'test-results/screens/debug-url-w1-l01-844x390.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});

test('debug URL: unknown level ids show a readable error instead of crashing', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/?level=w1-l99');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('unknown level "w1-l99"');
  await expect(alert).toContainText('w1_l01');
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});
