import { expect, test } from '@playwright/test';

// Spec 16.5 boot.spec.ts: the app opens, the canvas fills the viewport and the
// browser console stays free of errors. The screenshot is written to test-results/.
test('boot: shows the title on a full-screen canvas without console errors', async ({ page }) => {
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

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bastion Heroes' })).toBeVisible({
    timeout: 5000,
  });

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  const viewport = page.viewportSize();
  if (canvasBox === null || viewport === null) {
    throw new Error('Boot failed: the canvas or the viewport has no size');
  }
  expect(Math.round(canvasBox.width)).toBe(viewport.width);
  expect(Math.round(canvasBox.height)).toBe(viewport.height);

  await page.screenshot({ path: 'test-results/screens/boot-844x390.png' });

  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});
