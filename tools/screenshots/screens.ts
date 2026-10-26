import type { Page } from '@playwright/test';

import type { SaveData } from '../../src/meta/save';
import { createMagicChestSave, createNewSave, createRichSave } from './saves';

/**
 * The named screens captured for the portrait relaunch PR evidence (issues #113/#114).
 * Every entry knows how to open its screen from the preview server and which element
 * proves that the screen is ready, so the captures are reproducible from one command.
 */
export interface ScreenDefinition {
  /** File-name token: `m3b-<name>-<width>x<height>.png`. */
  readonly name: string;
  /** URL path (with query string) relative to the preview server. */
  readonly path: string;
  /** Seeds `localStorage.bh_save` before the app boots (M4 save-driven screens). */
  readonly seed?: SaveData;
  /**
   * Freeze the render loop after `prepare` and the settle delay. The `?tick=` debug URLs
   * fast-forward the sim before the first frame (spec 13.7) and the assets load
   * asynchronously; freezing after the settle delay keeps the loaded scene on screen
   * while the screenshot is written, so two runs produce the same image.
   */
  readonly freezeFrame?: boolean;
  /**
   * How long to let the screen settle after `prepare` resolves. DOM screens need a moment
   * for fonts, portrait images and CSS transitions; frozen level frames need almost none.
   */
  readonly settleMs?: number;
  /**
   * Screenshot immediately after `prepare` resolves, before the asset wait and the frame
   * freeze. Needed only for short-lived HUD effects (the 1 s "FINAL WAVE" banner), where
   * the extra settle time would miss the effect.
   */
  readonly instant?: boolean;
  /** Keep CSS animations running (default false freezes them at their end state). */
  readonly allowAnimations?: boolean;
  /**
   * For instant screens: wait until this element is fully inside the viewport, then pause
   * all CSS animations so the still shows it at rest (the sliding wave banner).
   */
  readonly centerSelector?: string;
  /** Drives the UI into the state that should be captured and waits until it is ready. */
  prepare(page: Page): Promise<void>;
}

/**
 * Screen hooks used by the capture list. The rebuilt UI keeps the existing Playwright
 * hooks (spec 16.5, task description) and adds the shell hooks; keep the fallbacks until
 * the Lead confirms the final data-testid names.
 */
export const HOOKS = {
  titleScreen: '[data-testid="title-screen"]',
  playButton: '[data-testid="title-play"]',
  levelSelect: '[data-testid="level-select-screen"]',
  levelCard: '[data-testid="level-card"]',
  scoutScreen: '[data-testid="scout-screen"]',
  scoutContinue: '[data-testid="scout-continue"]',
  loadoutScreen: '[data-testid="loadout-screen"]',
  loadoutRecommended: '[data-testid="loadout-recommended"]',
  filledSlot: '[data-testid="loadout-slot"][data-filled="true"]',
  hudCard: '.hud-card',
  banner: '.hud-banner',
  essence: '[aria-label^="Essence"]',
  pauseButton: '[aria-label="Pause"]',
  pausedOverlay: '[data-testid="pause-overlay"]',
  resultOverlay: '[data-testid="result-overlay"]',
  collectionScreen: '[data-testid="collection-screen"]',
  collectionEntry: '[data-testid="collection-entry"]',
  collectionDetail: '[data-testid="collection-detail"]',
  chestsScreen: '[data-testid="chests-screen"]',
  chestOdds: '[data-testid="chest-odds"]',
  chestCollect: '[data-testid="chest-collect"]',
  settingsScreen: '[data-testid="settings-screen"]',
  questsScreen: '[data-testid="quests-screen"]',
  hudTip: '[data-testid="hud-tip"]',
} as const;

/** The in-level screenshot URLs of the spec 13.7 / issue #66 debug contracts. */
export const LEVEL_URLS = {
  /** W1-L05 at tick 900 (30 s), the standard spec 13.7 HUD screenshot frame. */
  w1l05: '/?level=w1_l05&seed=10005&tick=900',
  /**
   * W1-L10's FINAL wave battle through the `?finalwave=1` debug preview: the level's last
   * wave only (flag `final`), 3000 starting Essence and the six loadout defenders
   * pre-placed before the fast-forward, so the screenshot shows a real defended battle
   * instead of the un-defended level's early defeat (issue #113).
   */
  w1l10FinalWave:
    '/?level=w1_l10&seed=10010&finalwave=1&tick=1500' +
    '&cards=pyro_fox,frost_witch,rune_archer,iron_granny,glowshroom_monk,snowpup_yeti',
  /** Deterministic Victory result overlay (debug-only URL contract of the Lead). */
  resultWon: '/?result=won&stars=3&level=w1_l01',
  /** Victory result with the M4 reward rows, Next Level and Open Chests actions. */
  resultRewards: '/?result=won&stars=3&level=w1_l01&rewards=1&next=1&chests=3',
} as const;

/** Captures the title screen, the default screen with no debug URL (issue #113). */
const title: ScreenDefinition = {
  name: 'title',
  path: '/',
  seed: createRichSave(),
  settleMs: 600,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.titleScreen).waitFor();
  },
};

/** Captures the World 1 level select after tapping PLAY (issue #113). */
const levelSelect: ScreenDefinition = {
  name: 'level-select',
  path: '/',
  seed: createRichSave(),
  settleMs: 400,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.playButton).click();
    await page.locator(HOOKS.levelSelect).waitFor();
  },
};

/** Captures the Scouting screen of W1-L05, the first flow step before the loadout. */
const scouting: ScreenDefinition = {
  name: 'scouting',
  path: '/?level=w1-l05&scout=1',
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.scoutScreen).waitFor();
  },
};

/** Captures the Loadout screen of W1-L05 with the recommended six cards selected. */
const loadout: ScreenDefinition = {
  name: 'loadout',
  path: '/?level=w1-l05&scout=1',
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.scoutScreen).waitFor();
    await page.locator(HOOKS.scoutContinue).click();
    await page.locator(HOOKS.loadoutScreen).waitFor();
    await page.locator(HOOKS.loadoutRecommended).click();
    await page.locator(HOOKS.filledSlot).nth(5).waitFor();
  },
};

/** Captures the in-level HUD of W1-L05 at the spec 13.7 screenshot tick. */
const hudW1L05: ScreenDefinition = {
  name: 'hud-w1-l05',
  path: LEVEL_URLS.w1l05,
  freezeFrame: true,
  // The GLB/sprite assets load after the first HUD frame; wait for the populated scene.
  settleMs: 1800,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.essence).waitFor();
    await page.locator(HOOKS.hudCard).first().waitFor();
  },
};

/** Captures the in-level HUD of W1-L10 during its FINAL wave. */
const hudW1L10FinalWave: ScreenDefinition = {
  name: 'hud-w1-l10-finalwave',
  path: LEVEL_URLS.w1l10FinalWave,
  freezeFrame: true,
  settleMs: 1800,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.essence).waitFor();
    await page.locator(HOOKS.hudCard).first().waitFor();
  },
};

/** Captures the pause overlay over a paused level (resume/restart/quit menu). */
const pause: ScreenDefinition = {
  name: 'pause',
  path: LEVEL_URLS.w1l05,
  freezeFrame: true,
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.essence).waitFor();
    await page.locator(HOOKS.hudCard).first().waitFor();
    // Let the scene assets finish loading so the dimmed backdrop is populated.
    await page.waitForTimeout(1500);
    await page.locator(HOOKS.pauseButton).click();
    await page.locator(HOOKS.pausedOverlay).waitFor();
  },
};

/**
 * Captures the victory result overlay through the deterministic `?result=won` debug URL
 * that `src/main.ts` mounts on top of a fixed level frame (issue #113).
 */
const resultVictory: ScreenDefinition = {
  name: 'result-victory',
  path: LEVEL_URLS.resultWon,
  settleMs: 400,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.resultOverlay).waitFor();
  },
};

/** Captures the Collection grid with the progressed six-card roster. */
const collection: ScreenDefinition = {
  name: 'collection',
  path: '/?screen=collection',
  seed: createRichSave(),
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.collectionScreen).waitFor();
    await page.locator(HOOKS.collectionEntry).first().waitFor();
  },
};

/** Captures the card detail sheet (stats, ★3 bonus and upgrade state). */
const collectionDetail: ScreenDefinition = {
  name: 'collection-detail',
  path: '/?screen=collection',
  seed: createRichSave(),
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.collectionScreen).waitFor();
    await page.locator(HOOKS.collectionEntry).first().click();
    await page.locator(HOOKS.collectionDetail).waitFor();
  },
};

/** Captures the chest inventory, pity meter and gem-purchase rows. */
const chests: ScreenDefinition = {
  name: 'chests',
  path: '/?screen=chests',
  seed: createRichSave(),
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.chestsScreen).waitFor();
  },
};

/** Captures the required drop-odds dialog of the Magic Chest. */
const chestOdds: ScreenDefinition = {
  name: 'chest-odds',
  path: '/?screen=chests',
  seed: createRichSave(),
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.chestsScreen).waitFor();
    await page.locator('[data-testid="chest-info-magic"]').click();
    await page.locator(HOOKS.chestOdds).waitFor();
  },
};

/** Captures the fully revealed chest-opening overlay with its card flips. */
const chestOpening: ScreenDefinition = {
  name: 'chest-opening',
  path: '/?screen=chests',
  seed: createMagicChestSave(),
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.chestsScreen).waitFor();
    await page.locator('[data-testid="chest-open-magic"]').click();
    await page.locator(HOOKS.chestCollect).waitFor();
  },
};

/** Captures the settings sliders, toggles, progress and reset affordance. */
const settings: ScreenDefinition = {
  name: 'settings',
  path: '/?screen=settings',
  seed: createRichSave(),
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.settingsScreen).waitFor();
  },
};

/** Captures the daily quests with one completed and one partial quest. */
const quests: ScreenDefinition = {
  name: 'quests',
  path: '/?screen=quests',
  seed: createRichSave(),
  settleMs: 300,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.questsScreen).waitFor();
    await page.locator('[data-testid="quest-card"]').first().waitFor();
  },
};

/** Captures the M4 victory result: reward rows, Next Level and Open Chests. */
const resultRewards: ScreenDefinition = {
  name: 'result-rewards',
  path: LEVEL_URLS.resultRewards,
  settleMs: 400,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.resultOverlay).waitFor();
    await page.locator('[data-testid="result-rewards"]').waitFor();
  },
};

/** Captures the first-time tutorial tip in the real shell flow of W1-L01. */
const hudTip: ScreenDefinition = {
  name: 'hud-tip',
  path: '/',
  seed: createNewSave(),
  freezeFrame: true,
  settleMs: 800,
  async prepare(page: Page): Promise<void> {
    await page.locator(HOOKS.titleScreen).waitFor();
    await page.locator(HOOKS.playButton).click();
    await page.locator('[data-testid="level-card"][data-level-id="w1_l01"]').click();
    await page.locator(HOOKS.scoutContinue).click();
    await page.locator('[data-testid="loadout-fight"]').click();
    await page.locator(HOOKS.hudTip).waitFor();
  },
};

/** The full capture list, in the order of the playable shell (title first). */
export const SCREENS: readonly ScreenDefinition[] = [
  title,
  levelSelect,
  scouting,
  loadout,
  hudW1L05,
  hudW1L10FinalWave,
  hudTip,
  pause,
  resultVictory,
  resultRewards,
  collection,
  collectionDetail,
  chests,
  chestOdds,
  chestOpening,
  settings,
  quests,
];
