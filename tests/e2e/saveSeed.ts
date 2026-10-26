import type { Page } from '@playwright/test';

import type { SaveData } from '../../src/meta/save';

/**
 * Seeds `localStorage.bh_save` before the app boots. Playwright's init script runs
 * on every navigation of the page, so each reload starts from the same fixture.
 */
export async function seedSave(page: Page, save: SaveData): Promise<void> {
  await page.addInitScript((data) => {
    localStorage.setItem('bh_save', JSON.stringify(data));
  }, save);
}

/**
 * Seeds the save only when the browser has none yet. Use this when the test reloads
 * the page to prove a persisted transaction survives the boot.
 */
export async function seedSaveOnce(page: Page, save: SaveData): Promise<void> {
  await page.addInitScript((data) => {
    if (localStorage.getItem('bh_save') === null) {
      localStorage.setItem('bh_save', JSON.stringify(data));
    }
  }, save);
}

export { createMagicChestSave, createNewSave, createRichSave } from '../../tools/screenshots/saves';
