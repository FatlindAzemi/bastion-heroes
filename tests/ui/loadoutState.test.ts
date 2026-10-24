import { describe, expect, it } from 'vitest';

import { levelById } from '../../src/data';
import { LevelDef } from '../../src/data/schemas';
import { createM2Collection } from '../../src/ui/screens/collection';
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
