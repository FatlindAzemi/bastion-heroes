/**
 * Loadout slot state for the Loadout screen (spec 3.12 rules 2 and 4, issue #49).
 * The tutorial levels 1-4 use a fixed, pre-chosen loadout (spec 7.2), every other
 * level starts empty and the player fills its slots.
 *
 * M4 seam: there is no save data yet (spec 8, 11.9), so the loadout is not
 * persisted and not pre-filled from a previous run. The M4 save will own that.
 */
import type { LevelDef } from '../../data/schemas';
import type { CollectionCardView, LoadoutChoice } from './types';

/** One loadout slot row: a chosen card, or null while the slot is empty. */
export type LoadoutSlots = readonly (LoadoutChoice | null)[];

/** Card level of the fixed tutorial cards until the M4 upgrades exist (spec 4.2). */
const FIXED_CARD_LEVEL = 1;

/** True for the tutorial levels 1-4 with a fixed, pre-chosen loadout (spec 3.12, 7.2). */
export function hasFixedLoadout(level: LevelDef): boolean {
  return level.fixedLoadout !== null;
}

/** Builds the initial slot row: the fixed tutorial loadout, or empty free slots. */
export function initialLoadout(level: LevelDef): LoadoutSlots {
  if (level.fixedLoadout !== null) {
    return level.fixedLoadout.map((defenderId) => ({
      defenderId,
      cardLevel: FIXED_CARD_LEVEL,
    }));
  }
  return Array.from({ length: level.loadoutSlots }, () => null);
}

/** Number of filled slots. */
export function filledSlotCount(slots: LoadoutSlots): number {
  return slots.filter((slot) => slot !== null).length;
}

/** True when every slot holds a card, so "Fight!" may start the level (spec 3.12 rule 4). */
export function isLoadoutComplete(slots: LoadoutSlots): boolean {
  return slots.every((slot) => slot !== null);
}

/** Fills the first empty slot with a collection card; a card can only be in one slot. */
export function addCardToLoadout(slots: LoadoutSlots, card: CollectionCardView): LoadoutSlots {
  if (slots.some((slot) => slot?.defenderId === card.defenderId)) {
    return slots;
  }
  const emptyIndex = slots.findIndex((slot) => slot === null);
  if (emptyIndex === -1) {
    return slots;
  }
  const next = [...slots];
  next[emptyIndex] = { defenderId: card.defenderId, cardLevel: card.cardLevel };
  return next;
}

/** Empties one slot; tapping a filled slot removes its card (issue #49). */
export function removeCardFromLoadout(slots: LoadoutSlots, slotIndex: number): LoadoutSlots {
  if (slotIndex < 0 || slotIndex >= slots.length) {
    return slots;
  }
  const next = [...slots];
  next[slotIndex] = null;
  return next;
}

/** Replaces the slots with a pick (the Recommended button), padding with empty slots. */
export function replaceLoadout(level: LevelDef, choices: readonly LoadoutChoice[]): LoadoutSlots {
  return Array.from({ length: level.loadoutSlots }, (_, index) => choices[index] ?? null);
}

/** The chosen cards in slot order, ready to start the level (spec 11.3). */
export function chosenLoadout(slots: LoadoutSlots): readonly LoadoutChoice[] {
  return slots.filter((slot): slot is LoadoutChoice => slot !== null);
}
