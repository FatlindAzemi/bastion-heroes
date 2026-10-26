/**
 * Save fixtures for the e2e suite and the portrait screenshot tooling (M4).
 * They describe a progressed player who cleared W1-L01 to W1-L04, owns the six
 * campaign cards, has chests/gems to spend and one completed daily quest.
 */
import { questById } from '../../src/data/economy';
import { todayKey } from '../../src/meta/date';
import { createDefaultSave, type SaveData } from '../../src/meta/save';

/** The six cards a player owns after clearing W1-L01 to W1-L04. */
export const PROGRESSED_CARDS = [
  'sparkbolt_gremlin',
  'pyro_fox',
  'frost_witch',
  'glowshroom_monk',
  'iron_granny',
  'boomcap_brewer',
] as const;

/** The saved W1-L05 loadout of the fixture, in slot order. */
export const PROGRESSED_LOADOUT: readonly string[] = [...PROGRESSED_CARDS];

/** A new-player save for the current local day. */
export function createNewSave(date: string = todayKey()): SaveData {
  return createDefaultSave(date);
}

/**
 * A progressed save: W1-L01 to W1-L04 cleared, six cards at mixed levels, all
 * tutorial tips seen, chests, 1380 gold, 860 gems and one completed daily quest.
 */
export function createRichSave(date: string = todayKey()): SaveData {
  const save = createDefaultSave(date);
  save.gold = 1_380;
  save.gems = 860;
  save.levels = {
    w1_l01: { stars: 3 },
    w1_l02: { stars: 3 },
    w1_l03: { stars: 2 },
    w1_l04: { stars: 1 },
  };
  save.cards = {
    sparkbolt_gremlin: { level: 4, shards: 6 },
    pyro_fox: { level: 3, shards: 2 },
    frost_witch: { level: 2, shards: 5 },
    glowshroom_monk: { level: 2, shards: 1 },
    iron_granny: { level: 1, shards: 0 },
    boomcap_brewer: { level: 1, shards: 0 },
  };
  save.chests = { wooden: 3, silver: 2, gold: 1, magic: 0, legendary: 0 };
  save.pity = { sinceLegendary: 12 };
  save.dailyQuests.quests = save.dailyQuests.quests.map((progress, index) => {
    const target = questById[progress.id]?.target ?? 1;
    if (index === 0) {
      return { ...progress, progress: target, done: true };
    }
    if (index === 1) {
      return { ...progress, progress: target > 1 ? Math.floor(target / 2) : 0, done: false };
    }
    return progress;
  });
  save.tutorial = { seenHints: ['tip_w1_l01', 'tip_w1_l02', 'tip_w1_l03', 'tip_w1_l04'] };
  save.stats = { levelsWon: 4, enemiesDefeated: 218, combos: 12 };
  save.loadouts = { w1_l05: [...PROGRESSED_LOADOUT] };
  return save;
}

/** The rich save plus one Magic Chest, used by the chest-opening capture. */
export function createMagicChestSave(date: string = todayKey()): SaveData {
  const save = createRichSave(date);
  save.chests.magic = 1;
  return save;
}
