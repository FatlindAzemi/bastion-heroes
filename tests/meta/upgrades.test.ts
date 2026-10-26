import { describe, expect, it } from 'vitest';

import { upgradeGoldCost, upgradeShardCost } from '../../src/data/economy';
import { createDefaultSave } from '../../src/meta/save';
import { cardUpgradeView, upgradeCard } from '../../src/meta/upgrades';

describe('card upgrades', () => {
  it('matches the spec 8.3 cost table for Common cards', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => upgradeShardCost('common', level))).toEqual([
      2, 4, 10, 20, 50, 100, 200, 400, 800,
    ]);
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => upgradeGoldCost(level))).toEqual([
      20, 50, 150, 400, 1000, 2000, 4000, 8000, 20000,
    ]);
  });

  it('applies the rarity multipliers and rounds up', () => {
    expect(upgradeShardCost('rare', 2)).toBe(1);
    expect(upgradeShardCost('rare', 3)).toBe(2);
    expect(upgradeShardCost('epic', 4)).toBe(2);
    expect(upgradeShardCost('legendary', 10)).toBe(80);
    expect(upgradeShardCost('mythic', 10)).toBe(40);
  });

  it('reports a locked card instead of inventing an upgrade', () => {
    const save = createDefaultSave('2026-10-26');
    expect(cardUpgradeView(save, 'snowpup_yeti')).toBeNull();
    expect(upgradeCard(save, 'snowpup_yeti').result).toBe('locked');
  });

  it('refuses an upgrade without enough shards or gold', () => {
    const save = createDefaultSave('2026-10-26');
    expect(upgradeCard(save, 'sparkbolt_gremlin').result).toBe('notEnoughShards');
    save.cards.sparkbolt_gremlin!.shards = 2;
    expect(upgradeCard(save, 'sparkbolt_gremlin').result).toBe('notEnoughGold');
  });

  it('spends shards and gold and raises the level by one', () => {
    const save = createDefaultSave('2026-10-26');
    save.gold = 100;
    save.cards.sparkbolt_gremlin!.shards = 5;
    const upgraded = upgradeCard(save, 'sparkbolt_gremlin');
    expect(upgraded.result).toBe('ok');
    expect(upgraded.save.gold).toBe(80);
    expect(upgraded.save.cards.sparkbolt_gremlin).toEqual({ level: 2, shards: 3 });
  });

  it('stops at the card level cap', () => {
    const save = createDefaultSave('2026-10-26');
    save.gold = 999_999;
    save.cards.sparkbolt_gremlin = { level: 10, shards: 9999 };
    expect(upgradeCard(save, 'sparkbolt_gremlin').result).toBe('maxed');
    expect(cardUpgradeView(save, 'sparkbolt_gremlin')?.maxed).toBe(true);
  });
});
