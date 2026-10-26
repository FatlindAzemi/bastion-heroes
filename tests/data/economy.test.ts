import { describe, expect, it } from 'vitest';

import {
  MAX_CARD_LEVEL,
  chestDefinitions,
  economy,
  questPool,
  rarityShardMultipliers,
  upgradeGoldCosts,
  upgradeShardCosts,
} from '../../src/data/economy';

describe('meta economy data', () => {
  it('has five chests whose published odds add up to 1', () => {
    expect(chestDefinitions).toHaveLength(5);
    for (const chest of chestDefinitions) {
      const sum = Object.values(chest.odds).reduce((total, value) => total + value, 0);
      expect(sum, chest.id).toBeCloseTo(1, 10);
    }
  });

  it('has the spec 8.3 cost tables for every level 2-10', () => {
    expect(Object.keys(upgradeShardCosts)).toHaveLength(MAX_CARD_LEVEL - 1);
    expect(Object.keys(upgradeGoldCosts)).toHaveLength(MAX_CARD_LEVEL - 1);
    expect(upgradeShardCosts[10]).toBe(800);
    expect(upgradeGoldCosts[10]).toBe(20_000);
  });

  it('has the five rarity shard multipliers and six daily quests', () => {
    expect(rarityShardMultipliers).toEqual({
      common: 1,
      rare: 0.5,
      epic: 0.2,
      legendary: 0.1,
      mythic: 0.05,
    });
    expect(questPool).toHaveLength(6);
    expect(new Set(questPool.map((quest) => quest.id)).size).toBe(6);
  });

  it('keeps the starting collection small enough for the campaign unlocks', () => {
    expect(economy.startingCards).toEqual(['sparkbolt_gremlin', 'pyro_fox', 'frost_witch']);
    expect(economy.pityThreshold).toBe(40);
    expect(economy.questReward).toEqual({ gold: 50, gems: 10 });
  });
});
