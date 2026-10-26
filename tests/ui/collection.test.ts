import { describe, expect, it } from 'vitest';

import { defenders } from '../../src/data';
import { createDefaultSave } from '../../src/meta/save';
import {
  createCollectionEntries,
  createM2Collection,
  createOwnedCollection,
} from '../../src/ui/screens/collection';

// Issue #113 / M4: the loadout roster only shows owned cards, while the Collection
// screen shows the full roster sorted owned first, then rarity (Mythic first) and
// Essence cost, with the shard/upgrade state of the save.

const DATE = '2026-10-26';

describe('createM2Collection', () => {
  it('projects the full defender registry in registry order at card level 1', () => {
    const collection = createM2Collection();
    expect(collection.map((card) => card.defenderId)).toEqual(
      defenders.map((defender) => defender.id),
    );
    expect(collection.every((card) => card.cardLevel === 1)).toBe(true);
  });

  it('carries the card facts the Loadout renders', () => {
    const sparkbolt = createM2Collection().find((card) => card.defenderId === 'sparkbolt_gremlin');
    expect(sparkbolt).toMatchObject({
      name: 'Sparkbolt Gremlin',
      rarity: 'common',
      faction: 'forge',
      role: 'shooter',
      cost: 150,
      damageType: 'pierce',
      cardLevel: 1,
    });
  });
});

describe('createOwnedCollection', () => {
  it('only includes owned cards, in registry order, at their saved levels', () => {
    const save = createDefaultSave(DATE);
    save.cards.frost_witch = { level: 3, shards: 5 };
    save.cards.pyro_fox = { level: 2, shards: 1 };
    save.cards.sparkbolt_gremlin = { level: 4, shards: 0 };

    expect(createOwnedCollection(save).map((card) => [card.defenderId, card.cardLevel])).toEqual([
      ['frost_witch', 3],
      ['pyro_fox', 2],
      ['sparkbolt_gremlin', 4],
    ]);
  });

  it('is empty when the save owns no cards', () => {
    const save = createDefaultSave(DATE);
    save.cards = {};
    expect(createOwnedCollection(save)).toEqual([]);
  });
});

describe('createCollectionEntries', () => {
  it('sorts owned cards first, then mythic-first rarity and Essence cost', () => {
    const entries = createCollectionEntries(createDefaultSave(DATE));
    expect(entries.map((entry) => entry.card.defenderId)).toEqual([
      'pyro_fox',
      'frost_witch',
      'sparkbolt_gremlin',
      'iron_granny',
      'rune_archer',
      'glowshroom_monk',
      'boomcap_brewer',
      'snowpup_yeti',
    ]);
    expect(entries.map((entry) => entry.owned)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('shows the saved upgrade state of every card', () => {
    const save = createDefaultSave(DATE);
    save.gold = 20;
    save.cards.sparkbolt_gremlin = { level: 1, shards: 2 };
    const sparkbolt = createCollectionEntries(save).find(
      (entry) => entry.card.defenderId === 'sparkbolt_gremlin',
    );
    expect(sparkbolt).toMatchObject({
      owned: true,
      shards: 2,
      shardsNeeded: 2,
      goldCost: 20,
      maxed: false,
      canUpgrade: true,
    });

    const locked = createCollectionEntries(save).find(
      (entry) => entry.card.defenderId === 'snowpup_yeti',
    );
    expect(locked).toMatchObject({
      owned: false,
      shards: 0,
      shardsNeeded: 0,
      goldCost: 0,
      canUpgrade: false,
    });
  });

  it('reports a max-level card as maxed with no shard or gold cost', () => {
    const save = createDefaultSave(DATE);
    save.gold = 99_999;
    save.cards.sparkbolt_gremlin = { level: 10, shards: 99_999 };
    const sparkbolt = createCollectionEntries(save).find(
      (entry) => entry.card.defenderId === 'sparkbolt_gremlin',
    );
    expect(sparkbolt).toMatchObject({
      maxed: true,
      shardsNeeded: 0,
      goldCost: 0,
      canUpgrade: false,
    });
  });
});
