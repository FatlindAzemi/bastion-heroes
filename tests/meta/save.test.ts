import { beforeEach, describe, expect, it } from 'vitest';

import {
  SAVE_KEY,
  createDefaultSave,
  loadSave,
  migrateSave,
  persistSave,
  resetSave,
  setLevelLoadout,
  updateSettings,
} from '../../src/meta/save';
import { resetStorageForTests, setStorageAdapterForTests } from '../../src/platform/storage';

/** In-memory adapter exposing its keys, so tests never touch a real browser storage. */
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      data.set(key, value);
    },
    removeItem: (key: string): void => {
      data.delete(key);
    },
    keys: (): string[] => [...data.keys()],
  };
}

describe('save data', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    resetStorageForTests();
    storage = fakeStorage();
    setStorageAdapterForTests(storage);
  });

  it('creates a new-player save with three starters, one welcome chest and three daily quests', () => {
    const save = createDefaultSave('2026-10-26');
    expect(save.version).toBe(1);
    expect(Object.keys(save.cards).sort()).toEqual(
      ['frost_witch', 'pyro_fox', 'sparkbolt_gremlin'].sort(),
    );
    expect(save.cards.sparkbolt_gremlin).toEqual({ level: 1, shards: 0 });
    expect(save.chests.wooden).toBe(1);
    expect(save.dailyQuests.date).toBe('2026-10-26');
    expect(save.dailyQuests.quests).toHaveLength(3);
    expect(save.settings).toEqual({
      music: 0.6,
      sfx: 0.8,
      autoCollect: false,
      haptics: true,
      language: 'en',
    });
  });

  it('writes and reads the same save under bh_save', () => {
    const save = createDefaultSave('2026-10-26');
    persistSave(save);
    expect(storage.getItem(SAVE_KEY)).toContain('"version":1');
    expect(loadSave('2026-10-26')).toEqual(save);
  });

  it('backs up corrupt JSON and starts a fresh save', () => {
    storage.setItem(SAVE_KEY, '{not json');
    const save = loadSave('2026-10-26');
    expect(save.levels).toEqual({});
    expect(storage.keys().some((key) => key.startsWith('bh_save_broken_'))).toBe(true);
    expect(storage.getItem(SAVE_KEY)).not.toBe('{not json');
  });

  it('migrates a version 0 save and keeps its wallet', () => {
    const migrated = migrateSave(
      { version: 0, gold: 250, gems: 12, cards: { sparkbolt_gremlin: { level: 3, shards: 4 } } },
      '2026-10-26',
    );
    expect(migrated.gold).toBe(250);
    expect(migrated.gems).toBe(12);
    expect(migrated.cards.sparkbolt_gremlin).toEqual({ level: 3, shards: 4 });
    expect(migrated.version).toBe(1);
  });

  it('parses a hand-written version 1 save', () => {
    const save = createDefaultSave('2026-10-26');
    expect(migrateSave(JSON.parse(JSON.stringify(save)), '2026-10-26')).toEqual(save);
  });

  it('rejects an unsupported future version', () => {
    expect(() => migrateSave({ version: 99 }, '2026-10-26')).toThrow(/Unsupported save version/);
  });

  it('stores loadouts and settings without mutating the source save', () => {
    const save = createDefaultSave('2026-10-26');
    const withLoadout = setLevelLoadout(save, 'w1_l05', ['pyro_fox', 'frost_witch']);
    const withSettings = updateSettings(withLoadout, { music: 0.2, autoCollect: true });
    expect(save.loadouts).toEqual({});
    expect(withLoadout.loadouts.w1_l05).toEqual(['pyro_fox', 'frost_witch']);
    expect(withSettings.settings.music).toBe(0.2);
    expect(withSettings.settings.autoCollect).toBe(true);
    expect(withSettings.loadouts.w1_l05).toEqual(['pyro_fox', 'frost_witch']);
  });

  it('resets the save and persists the new player state', () => {
    const start = createDefaultSave('2026-10-26');
    start.gold = 500;
    persistSave(start);
    const fresh = resetSave('2026-10-26');
    expect(fresh.gold).toBe(0);
    expect(loadSave('2026-10-26').gold).toBe(0);
  });
});
