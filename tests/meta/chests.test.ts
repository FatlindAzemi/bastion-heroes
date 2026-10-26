import { describe, expect, it } from 'vitest';

import { chestById } from '../../src/data/economy';
import { createMetaRng } from '../../src/meta/rng';
import { buyChest, openChest, rollRarity } from '../../src/meta/chests';
import { createDefaultSave } from '../../src/meta/save';

const DATE = '2026-10-26';

describe('gem chest purchase', () => {
  it('buys a Magic Chest for 500 gems and adds it to the inventory', () => {
    const save = createDefaultSave(DATE);
    save.gems = 640;
    const bought = buyChest(save, 'magic');
    expect(bought.result).toBe('ok');
    expect(bought.save.gems).toBe(140);
    expect(bought.save.chests.magic).toBe(1);
    // The transaction is pure: the source save keeps its gems and inventory.
    expect(save.gems).toBe(640);
    expect(save.chests.magic ?? 0).toBe(0);
  });

  it('buys a Legendary Chest for 1500 gems', () => {
    const save = createDefaultSave(DATE);
    save.gems = 1500;
    const bought = buyChest(save, 'legendary');
    expect(bought.result).toBe('ok');
    expect(bought.save.gems).toBe(0);
    expect(bought.save.chests.legendary).toBe(1);
  });

  it('refuses a purchase when the player cannot afford the chest', () => {
    const save = createDefaultSave(DATE);
    save.gems = 499;
    const bought = buyChest(save, 'magic');
    expect(bought.result).toBe('notEnoughGems');
    expect(bought.save).toBe(save);
    expect(save.chests.magic ?? 0).toBe(0);
  });

  it('does not sell the campaign-earned chests', () => {
    for (const chestId of ['wooden', 'silver', 'gold'] as const) {
      const save = createDefaultSave(DATE);
      save.gems = 10_000;
      const bought = buyChest(save, chestId);
      expect(bought.result).toBe('notForSale');
      expect(bought.save).toBe(save);
    }
  });

  it('buys then opens a Magic Chest through the normal inventory path', () => {
    const save = createDefaultSave(DATE);
    save.gems = 500;
    const bought = buyChest(save, 'magic').save;
    const opened = openChest(bought, 'magic', 99);
    expect(opened).not.toBeNull();
    expect(opened?.save.chests.magic).toBe(0);
    expect(opened?.save.gold).toBe(1_000);
    expect(opened?.result.stacks).toHaveLength(4);
  });
});

describe('chest opening', () => {
  it('consumes one chest, pays its gold and produces at least one stack', () => {
    const save = createDefaultSave(DATE);
    const opened = openChest(save, 'wooden', 1234);
    expect(opened).not.toBeNull();
    expect(opened!.save.chests.wooden).toBe(0);
    expect(opened!.result.gold).toBe(40);
    expect(opened!.save.gold).toBe(40);
    expect(opened!.result.stacks.length).toBeGreaterThanOrEqual(1);
    expect(opened!.result.stacks.length).toBeLessThanOrEqual(2);
  });

  it('returns null when the inventory has no chest of that type', () => {
    const save = createDefaultSave(DATE);
    expect(openChest(save, 'gold', 1)).toBeNull();
  });

  it('unlocks a new card with the first shard and keeps the rest as shards', () => {
    const save = createDefaultSave(DATE);
    save.chests.gold = 1;
    let found = false;
    for (let seed = 1; seed < 500 && !found; seed += 1) {
      const opened = openChest(save, 'gold', seed);
      const newStack = opened?.result.stacks.find((stack) => stack.isNew);
      if (opened !== null && opened !== undefined && newStack !== undefined) {
        expect(opened.save.cards[newStack.cardId]?.level).toBe(1);
        expect(opened.save.cards[newStack.cardId]?.shards).toBe(newStack.shards);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('adds duplicate stacks to the owned card shards', () => {
    const save = createDefaultSave(DATE);
    for (const chestId of ['wooden', 'silver', 'gold'] as const) {
      save.chests[chestId] = 1;
      const opened = openChest(save, chestId, 42)!;
      const stack = opened.result.stacks[0]!;
      if (!stack.isNew) {
        expect(opened.save.cards[stack.cardId]?.shards).toBeGreaterThanOrEqual(stack.shards);
      }
    }
  });

  it('forces the guaranteed Legendary at 40 silver-or-better chests and resets', () => {
    const save = createDefaultSave(DATE);
    save.chests.silver = 1;
    save.pity.sinceLegendary = 39;
    const opened = openChest(save, 'silver', 7)!;
    expect(opened.result.pityForced).toBe(true);
    expect(opened.result.pityAfter).toBe(0);
    expect(opened.result.stacks[0]?.rarity).not.toBe('common');
  });

  it('does not advance the pity counter on wooden chests', () => {
    const save = createDefaultSave(DATE);
    save.pity.sinceLegendary = 10;
    const opened = openChest(save, 'wooden', 3)!;
    expect(opened.result.pityAfter).toBe(10);
  });

  it('rolls the published wooden chest odds within 0.5 percentage points over 100,000 rolls', () => {
    const random = createMetaRng(987654);
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
    const odds = chestById.wooden.odds;
    for (let index = 0; index < 100_000; index += 1) {
      counts[rollRarity(odds, random)] += 1;
    }
    expect(Math.abs(counts.common / 100_000 - odds.common)).toBeLessThan(0.005);
    expect(Math.abs(counts.rare / 100_000 - odds.rare)).toBeLessThan(0.005);
    expect(Math.abs(counts.epic / 100_000 - odds.epic)).toBeLessThan(0.005);
  });

  it('is deterministic for a seed', () => {
    const save = createDefaultSave(DATE);
    save.chests.gold = 2;
    const first = openChest(save, 'gold', 555)!;
    const second = openChest(save, 'gold', 555)!;
    expect(first.result).toEqual(second.result);
  });
});
