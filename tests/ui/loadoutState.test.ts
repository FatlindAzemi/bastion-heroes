import { describe, expect, it } from 'vitest';

import { levelById } from '../../src/data';
import { questById } from '../../src/data/economy';
import { LevelDef } from '../../src/data/schemas';
import { createDefaultSave } from '../../src/meta/save';
import { createM2Collection, createOwnedCollection } from '../../src/ui/screens/collection';
import {
  addCardToLoadout,
  chosenLoadout,
  filledSlotCount,
  hasFixedLoadout,
  initialLoadout,
  isLoadoutComplete,
  removeCardFromLoadout,
  replaceLoadout,
} from '../../src/ui/screens/loadoutState';
import type { CollectionCardView } from '../../src/ui/screens/types';

/** Parses a registered level exactly like the boot path does (spec 7.1). */
function parsedLevel(levelId: string): LevelDef {
  const level = levelById[levelId];
  if (level === undefined) {
    throw new Error(`test setup: level "${levelId}" is not registered`);
  }
  return LevelDef.parse(level);
}

/** Returns one real M2 collection card. */
function collectionCard(index: number): CollectionCardView {
  const card = createM2Collection()[index];
  if (card === undefined) {
    throw new Error(`test setup: collection card ${index} is missing`);
  }
  return card;
}

const DATE = '2026-10-26';

describe('Loadout slot state (spec 3.12 rules 2 and 4, issue #49)', () => {
  it('3.12: tutorial levels 1-4 start with their fixed loadout pre-filled', () => {
    const level = parsedLevel('w1_l01');
    expect(hasFixedLoadout(level)).toBe(true);
    const slots = initialLoadout(level);
    expect(slots).toEqual([{ defenderId: 'sparkbolt_gremlin', cardLevel: 1 }]);
    expect(isLoadoutComplete(slots)).toBe(true);
  });

  it('3.12: free levels start empty and need every slot filled', () => {
    const level = parsedLevel('w1_l05');
    const slots = initialLoadout(level);
    expect(slots).toHaveLength(level.loadoutSlots);
    expect(filledSlotCount(slots)).toBe(0);
    expect(isLoadoutComplete(slots)).toBe(false);
  });

  it('3.12: tapping collection cards fills the first empty slot without duplicates', () => {
    const level = parsedLevel('w1_l05');
    const empty = initialLoadout(level);
    const first = addCardToLoadout(empty, collectionCard(6));
    const second = addCardToLoadout(first, collectionCard(0));
    expect(second).toEqual([
      { defenderId: 'snowpup_yeti', cardLevel: 1 },
      { defenderId: 'boomcap_brewer', cardLevel: 1 },
      null,
      null,
      null,
      null,
    ]);
    expect(addCardToLoadout(second, collectionCard(6))).toBe(second);
  });

  it('3.12: tapping a filled slot removes its card', () => {
    const level = parsedLevel('w1_l05');
    const slots = addCardToLoadout(initialLoadout(level), collectionCard(6));
    const removed = removeCardFromLoadout(slots, 0);
    expect(removed[0]).toBeNull();
    expect(filledSlotCount(removed)).toBe(0);
    expect(removeCardFromLoadout(slots, 99)).toBe(slots);
  });

  it('3.12: the Recommended replacement pads the level slots and Fight only passes filled cards', () => {
    const level = parsedLevel('w1_l05');
    const slots = replaceLoadout(level, [
      { defenderId: 'snowpup_yeti', cardLevel: 1 },
      { defenderId: 'boomcap_brewer', cardLevel: 1 },
    ]);
    expect(slots).toHaveLength(level.loadoutSlots);
    expect(filledSlotCount(slots)).toBe(2);
    expect(chosenLoadout(slots)).toEqual([
      { defenderId: 'snowpup_yeti', cardLevel: 1 },
      { defenderId: 'boomcap_brewer', cardLevel: 1 },
    ]);
  });

  it('3.12: filling every slot makes the loadout complete', () => {
    const level = parsedLevel('w1_l05');
    const collection = createM2Collection();
    let slots = initialLoadout(level);
    for (const card of collection) {
      slots = addCardToLoadout(slots, card);
    }
    expect(filledSlotCount(slots)).toBe(level.loadoutSlots);
    expect(isLoadoutComplete(slots)).toBe(true);
    // The 7th and 8th cards of the roster do not fit into 6 slots.
    expect(slots.some((slot) => slot?.defenderId === collection[5]?.defenderId)).toBe(true);
    expect(slots.some((slot) => slot?.defenderId === collection[6]?.defenderId)).toBe(false);
  });
});

describe('initialLoadout with the M4 save (spec 3.12 rule 4, 8.7)', () => {
  it('uses the saved card levels of the fixed tutorial loadout', () => {
    const save = createDefaultSave(DATE);
    save.cards.sparkbolt_gremlin = { level: 2, shards: 0 };
    save.cards.glowshroom_monk = { level: 3, shards: 0 };
    const slots = initialLoadout(parsedLevel('w1_l02'), {
      collection: createOwnedCollection(save),
    });
    expect(slots).toEqual([
      { defenderId: 'sparkbolt_gremlin', cardLevel: 2 },
      { defenderId: 'glowshroom_monk', cardLevel: 3 },
    ]);
    expect(isLoadoutComplete(slots)).toBe(true);
  });

  it('falls back to card level 1 when a fixed card is missing from the collection', () => {
    const slots = initialLoadout(parsedLevel('w1_l01'), { collection: [] });
    expect(slots).toEqual([{ defenderId: 'sparkbolt_gremlin', cardLevel: 1 }]);
  });

  it('restores a saved free loadout in slot order at saved card levels', () => {
    const save = createDefaultSave(DATE);
    save.cards.snowpup_yeti = { level: 2, shards: 0 };
    save.cards.pyro_fox = { level: 3, shards: 0 };
    save.cards.boomcap_brewer = { level: 1, shards: 0 };
    const slots = initialLoadout(parsedLevel('w1_l05'), {
      collection: createOwnedCollection(save),
      savedIds: ['snowpup_yeti', 'pyro_fox', 'boomcap_brewer'],
    });
    expect(slots).toEqual([
      { defenderId: 'snowpup_yeti', cardLevel: 2 },
      { defenderId: 'pyro_fox', cardLevel: 3 },
      { defenderId: 'boomcap_brewer', cardLevel: 1 },
      null,
      null,
      null,
    ]);
  });

  it('drops unknown and duplicate saved ids and pads the empty slots', () => {
    const save = createDefaultSave(DATE);
    const slots = initialLoadout(parsedLevel('w1_l05'), {
      collection: createOwnedCollection(save),
      savedIds: ['pyro_fox', 'unknown_card', 'pyro_fox', 'frost_witch'],
    });
    expect(slots).toEqual([
      { defenderId: 'pyro_fox', cardLevel: 1 },
      { defenderId: 'frost_witch', cardLevel: 1 },
      null,
      null,
      null,
      null,
    ]);
    expect(isLoadoutComplete(slots)).toBe(false);
  });

  it('ignores saved ids on a fixed-loadout tutorial level', () => {
    const save = createDefaultSave(DATE);
    const slots = initialLoadout(parsedLevel('w1_l01'), {
      collection: createOwnedCollection(save),
      savedIds: ['pyro_fox'],
    });
    expect(slots).toEqual([{ defenderId: 'sparkbolt_gremlin', cardLevel: 1 }]);
  });

  it('keeps daily quest progress records aligned with the quest definitions', () => {
    // Guard the fixture assumption used by the e2e/screenshot save seeds: progress
    // records only carry { id, progress, done }, the target lives in questById.
    const save = createDefaultSave(DATE);
    for (const progress of save.dailyQuests.quests) {
      expect(questById[progress.id]?.target).toBeGreaterThan(0);
    }
  });
});
