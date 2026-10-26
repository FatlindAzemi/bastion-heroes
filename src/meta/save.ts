/**
 * Save data of spec 8.7 and 11.9: one JSON object under `bh_save`, parsed with
 * Zod, migrated by version and backed up when it is corrupt. All reads and
 * writes go through `src/platform/storage.ts`; the module itself is pure apart
 * from `loadSave` / `persistSave`.
 */
import { z } from 'zod';

import { economy } from '../data/economy';
import { readStorage, writeStorage } from '../platform/storage';
import { DailyQuestsSchema, createDailyQuests } from './quests';
import { todayKey } from './date';

/** Storage key of the live save (spec 11.9). */
export const SAVE_KEY = 'bh_save';

/** Prefix of the backup copy kept when parsing fails (spec 11.9). */
export const BROKEN_SAVE_PREFIX = 'bh_save_broken_';

/** Current save format version. */
export const SAVE_VERSION = 1;

/** One owned card and its upgrade progress (spec 8.3, 8.7). */
export const CardSaveSchema = z.object({
  level: z.number().int().min(1).max(10),
  shards: z.number().int().nonnegative(),
});

/** The recorded star rating of a level (spec 3.11, 8.7). */
export const LevelSaveSchema = z.object({
  stars: z.number().int().min(0).max(3),
});

/** Player settings (spec 8.7, 9.8, M4 item 4.8). */
export const SettingsSchema = z.object({
  music: z.number().min(0).max(1),
  sfx: z.number().min(0).max(1),
  autoCollect: z.boolean(),
  haptics: z.boolean(),
  language: z.string(),
});

/** One-time onboarding hints the player already dismissed. */
export const TutorialSchema = z.object({
  seenHints: z.array(z.string()),
});

/** Lifetime counters used by the collection/title summaries. */
export const StatsSchema = z.object({
  levelsWon: z.number().int().nonnegative(),
  enemiesDefeated: z.number().int().nonnegative(),
  combos: z.number().int().nonnegative(),
});

/** The complete save of spec 8.7 plus the M4 chest inventory and tutorial block. */
export const SaveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  gold: z.number().int().nonnegative(),
  gems: z.number().int().nonnegative(),
  cards: z.record(z.string(), CardSaveSchema),
  levels: z.record(z.string(), LevelSaveSchema),
  loadouts: z.record(z.string(), z.array(z.string())),
  chests: z.record(z.string(), z.number().int().nonnegative()),
  pity: z.object({ sinceLegendary: z.number().int().nonnegative() }),
  dailyQuests: DailyQuestsSchema,
  settings: SettingsSchema,
  tutorial: TutorialSchema,
  stats: StatsSchema,
});

/** Parsed save data. */
export type SaveData = z.infer<typeof SaveDataSchema>;

/** One owned card entry of the save. */
export type CardSave = z.infer<typeof CardSaveSchema>;

/** Player settings. */
export type Settings = z.infer<typeof SettingsSchema>;

/** Creates the new-player save: three starter cards, one welcome chest, defaults. */
export function createDefaultSave(date: string = todayKey()): SaveData {
  const cards: Record<string, CardSave> = {};
  for (const defenderId of economy.startingCards) {
    cards[defenderId] = { level: 1, shards: 0 };
  }
  const chests: Record<string, number> = {};
  for (const [chestId, count] of Object.entries(economy.startingChests)) {
    chests[chestId] = count;
  }
  return {
    version: SAVE_VERSION,
    gold: 0,
    gems: 0,
    cards,
    levels: {},
    loadouts: {},
    chests,
    pity: { sinceLegendary: 0 },
    dailyQuests: createDailyQuests(date),
    settings: { music: 0.6, sfx: 0.8, autoCollect: false, haptics: true, language: 'en' },
    tutorial: { seenHints: [] },
    stats: { levelsWon: 0, enemiesDefeated: 0, combos: 0 },
  };
}

/** Deep copy through the schema, so callers can mutate their own next save. */
export function cloneSave(save: SaveData): SaveData {
  return SaveDataSchema.parse(JSON.parse(JSON.stringify(save)));
}

/**
 * Migrates a version-0 or missing-version object to the current save. Version 0
 * never shipped, but a hand-written early save may contain gold/gems/cards.
 */
function migrateVersionZero(raw: unknown, date: string): SaveData {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : Object.create(null);
  const fresh = createDefaultSave(date);
  const gold = typeof source.gold === 'number' ? Math.max(0, Math.floor(source.gold)) : fresh.gold;
  const gems = typeof source.gems === 'number' ? Math.max(0, Math.floor(source.gems)) : fresh.gems;
  const cards =
    typeof source.cards === 'object' && source.cards !== null ? source.cards : fresh.cards;
  return SaveDataSchema.parse({ ...fresh, gold, gems, cards });
}

/** Runs the version migrations in order and parses the result (spec 11.9). */
export function migrateSave(raw: unknown, date: string = todayKey()): SaveData {
  const version =
    typeof raw === 'object' && raw !== null && 'version' in raw
      ? (raw as { version: unknown }).version
      : 0;
  if (version === 0) {
    return migrateVersionZero(raw, date);
  }
  if (version === SAVE_VERSION) {
    return SaveDataSchema.parse(raw);
  }
  throw new Error(`Unsupported save version ${String(version)}`);
}

/** Keeps the unreadable JSON under a timestamped key before starting fresh. */
function backupBrokenSave(raw: string): void {
  writeStorage(`${BROKEN_SAVE_PREFIX}${Date.now()}`, raw);
}

/** Loads the save, migrating it; corruption starts a fresh save after a backup. */
export function loadSave(date: string = todayKey()): SaveData {
  const raw = readStorage(SAVE_KEY);
  if (raw === null) {
    const fresh = createDefaultSave(date);
    persistSave(fresh);
    return fresh;
  }
  try {
    return migrateSave(JSON.parse(raw), date);
  } catch (error) {
    console.warn('Bastion Heroes: save data was unreadable, starting fresh.', error);
    backupBrokenSave(raw);
    const fresh = createDefaultSave(date);
    persistSave(fresh);
    return fresh;
  }
}

/** Writes the save under the spec 11.9 key. */
export function persistSave(save: SaveData): void {
  writeStorage(SAVE_KEY, JSON.stringify(save));
}

/** Deletes the save and returns a new-player save. */
export function resetSave(date: string = todayKey()): SaveData {
  const fresh = createDefaultSave(date);
  persistSave(fresh);
  return fresh;
}

/** Number of owned cards. */
export function ownedCardCount(save: SaveData): number {
  return Object.keys(save.cards).length;
}

/** True when the player owns a card at level >= 1. */
export function ownsCard(save: SaveData, defenderId: string): boolean {
  return save.cards[defenderId] !== undefined;
}

/** The saved loadout ids of a level, or an empty list. */
export function levelLoadout(save: SaveData, levelId: string): readonly string[] {
  return save.loadouts[levelId] ?? [];
}

/** Stores the chosen loadout ids of a level (spec 3.12 rule 4). */
export function setLevelLoadout(
  save: SaveData,
  levelId: string,
  defenderIds: readonly string[],
): SaveData {
  const next = cloneSave(save);
  next.loadouts[levelId] = [...defenderIds];
  return next;
}

/** Marks one onboarding hint as dismissed. */
export function markTutorialSeen(save: SaveData, hintId: string): SaveData {
  if (save.tutorial.seenHints.includes(hintId)) {
    return save;
  }
  const next = cloneSave(save);
  next.tutorial.seenHints.push(hintId);
  return next;
}

/** Applies a partial settings patch. */
export function updateSettings(save: SaveData, patch: Partial<Settings>): SaveData {
  const next = cloneSave(save);
  next.settings = { ...next.settings, ...patch };
  return next;
}

/** Adds chests to the inventory (spec 8.4). */
export function addChest(save: SaveData, chestId: string, count = 1): SaveData {
  const next = cloneSave(save);
  next.chests[chestId] = (next.chests[chestId] ?? 0) + count;
  return next;
}

/** Total number of unopened chests. */
export function chestCount(save: SaveData): number {
  return Object.values(save.chests).reduce((sum, count) => sum + count, 0);
}
