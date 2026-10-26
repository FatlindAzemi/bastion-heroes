import { describe, expect, it } from 'vitest';

import { levelById } from '../../src/data';
import { createDailyQuests } from '../../src/meta/quests';
import { applyLevelResult } from '../../src/meta/rewards';
import { createDefaultSave } from '../../src/meta/save';
import type { QuestRunSummary } from '../../src/meta/quests';

const DATE = '2026-10-26';

/** A won run with no quest progress side effects. */
function wonRun(overrides: Partial<QuestRunSummary> = {}): QuestRunSummary {
  return {
    won: true,
    stars: 3,
    enemiesDefeated: 10,
    combosTriggered: 0,
    mergesTo3: 0,
    trapUsed: false,
    onlyCommonCards: false,
    ...overrides,
  };
}

/** L1 definition with its real rewards. */
const levelOne = levelById.w1_l01!;

describe('level rewards', () => {
  it('pays the first-clear gold, unlock, stars and 50 star gems', () => {
    const save = createDefaultSave(DATE);
    // Neutral quests that this single run cannot complete, so the wallet stays exact.
    save.dailyQuests = {
      date: DATE,
      quests: [
        { id: 'win_three', progress: 0, done: false },
        { id: 'merge_star3', progress: 0, done: false },
        { id: 'common_only_win', progress: 0, done: false },
      ],
      allDoneRewarded: false,
    };
    const result = applyLevelResult(save, levelOne, 'won', 3, wonRun(), DATE);
    expect(result.rewards.gold).toBe(60);
    expect(result.rewards.gems).toBe(50);
    expect(result.rewards.unlockedDefenderId).toBe('glowshroom_monk');
    expect(result.save.cards.glowshroom_monk).toEqual({ level: 1, shards: 0 });
    expect(result.save.levels.w1_l01).toEqual({ stars: 3 });
    expect(result.save.gold).toBe(60);
    expect(result.save.gems).toBe(50);
  });

  it('pays half gold on a replay and only the missing star bonus', () => {
    const start = createDefaultSave(DATE);
    start.levels.w1_l01 = { stars: 2 };
    start.cards.glowshroom_monk = { level: 1, shards: 0 };
    const result = applyLevelResult(start, levelOne, 'won', 3, wonRun(), DATE);
    expect(result.rewards.gold).toBe(30);
    expect(result.rewards.gems).toBe(25);
    expect(result.rewards.unlockedDefenderId).toBeNull();
    expect(result.save.levels.w1_l01).toEqual({ stars: 3 });
  });

  it('keeps the best stars when a replay is worse', () => {
    const start = createDefaultSave(DATE);
    start.levels.w1_l01 = { stars: 3 };
    const result = applyLevelResult(start, levelOne, 'won', 1, wonRun({ stars: 1 }), DATE);
    expect(result.save.levels.w1_l01).toEqual({ stars: 3 });
    expect(result.rewards.bestStars).toBe(3);
  });

  it('pays no level gold for a loss but still records and pays quest progress', () => {
    const save = createDefaultSave(DATE);
    save.dailyQuests = {
      date: DATE,
      quests: [{ id: 'defeat_enemies', progress: 95, done: false }],
      allDoneRewarded: false,
    };
    const result = applyLevelResult(
      save,
      levelOne,
      'lost',
      0,
      wonRun({ won: false, stars: 0, enemiesDefeated: 5 }),
      DATE,
    );
    expect(result.rewards.gold).toBe(0);
    expect(result.save.gold).toBe(50);
    expect(result.save.levels.w1_l01).toBeUndefined();
    expect(result.save.dailyQuests.quests[0]?.progress).toBe(100);
    expect(result.save.dailyQuests.quests[0]?.done).toBe(true);
    expect(result.rewards.questGold).toBe(50);
  });

  it('grants the first-clear wooden chest of L4 and no second one', () => {
    const save = createDefaultSave(DATE);
    const levelFour = levelById.w1_l04!;
    const first = applyLevelResult(save, levelFour, 'won', 2, wonRun(), DATE);
    expect(first.rewards.chest).toBe('wooden');
    expect(first.save.chests.wooden).toBe(2);
    const replay = applyLevelResult(first.save, levelFour, 'won', 3, wonRun(), DATE);
    expect(replay.rewards.chest).toBeNull();
    expect(replay.save.chests.wooden).toBe(2);
  });

  it('adds duplicate unlock shards when a chest already gave the card', () => {
    const save = createDefaultSave(DATE);
    save.cards.glowshroom_monk = { level: 1, shards: 3 };
    const result = applyLevelResult(save, levelOne, 'won', 2, wonRun(), DATE);
    expect(result.save.cards.glowshroom_monk).toEqual({ level: 1, shards: 5 });
  });

  it('pays the all-done quest chest once and updates lifetime stats', () => {
    const save = createDefaultSave(DATE);
    save.dailyQuests = {
      date: DATE,
      quests: [{ id: 'win_three', progress: 2, done: false }],
      allDoneRewarded: false,
    };
    const result = applyLevelResult(save, levelOne, 'won', 1, wonRun(), DATE);
    expect(result.rewards.questChest).toBe('wooden');
    expect(result.save.chests.wooden).toBe(2);
    expect(result.save.stats.levelsWon).toBe(1);
    expect(result.save.stats.enemiesDefeated).toBe(10);
    // A second run cannot pay the all-done chest again.
    const second = applyLevelResult(result.save, levelById.w1_l02!, 'won', 1, wonRun(), DATE);
    expect(second.rewards.questChest).toBeNull();
  });
});

describe('daily quest draws', () => {
  it('draws three distinct quests deterministically from the date', () => {
    const first = createDailyQuests(DATE);
    const second = createDailyQuests(DATE);
    expect(first).toEqual(second);
    expect(first.quests).toHaveLength(3);
    expect(new Set(first.quests.map((quest) => quest.id)).size).toBe(3);
  });
});
