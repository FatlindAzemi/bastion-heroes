/**
 * The Recommended loadout rule (spec 3.12 rule 3, issue #49): pure and
 * deterministic so it can be unit-tested against the real M2 roster.
 *
 * Rule: for every enemy armor type in first-appearance order, add the
 * highest-card-level owned card whose damage multiplier against that armor is
 * above 1; then add one producer; then fill the remaining slots with the
 * highest-card-level leftover cards. Every card is used at most once and the
 * tie-break is the registry order of the collection (the order of `collection`).
 */
import { rules } from '../../data';
import type { ArmorType, CollectionCardView, LoadoutChoice } from './types';

/** True when a card with this damage type is effective (multiplier > 1) against the armor. */
function isEffectiveAgainst(
  damageType: NonNullable<CollectionCardView['damageType']>,
  armor: ArmorType,
): boolean {
  return rules.combat.damageMultipliers[damageType][armor] > 1;
}

/** True when a card is a producer (spec 3.12 rule 3 adds one producer after the counters). */
function isProducer(card: CollectionCardView): boolean {
  return card.role === 'producer';
}

/**
 * The best unused card matching `accept`: highest card level, ties resolved by
 * the order of `collection` (registry order), which is the deterministic tie-break.
 */
function bestCard(
  collection: readonly CollectionCardView[],
  usedIds: ReadonlySet<string>,
  accept: (card: CollectionCardView) => boolean,
): CollectionCardView | null {
  let best: CollectionCardView | null = null;
  for (const card of collection) {
    if (usedIds.has(card.defenderId) || !accept(card)) {
      continue;
    }
    if (best === null || card.cardLevel > best.cardLevel) {
      best = card;
    }
  }
  return best;
}

/**
 * Builds the Recommended loadout (spec 3.12 rule 3). `enemyArmors` may contain
 * duplicates; they are deduplicated in first-appearance order. Returns at most
 * `slotCount` unique cards, in the order the rule picked them.
 */
export function recommendLoadout(
  collection: readonly CollectionCardView[],
  enemyArmors: readonly ArmorType[],
  slotCount: number,
): LoadoutChoice[] {
  const picked: CollectionCardView[] = [];
  const usedIds = new Set<string>();
  const slotsFull = (): boolean => picked.length >= slotCount;

  /** Picks a card and records it so it can never be chosen twice. */
  const pick = (card: CollectionCardView): void => {
    if (slotsFull()) {
      return;
    }
    picked.push(card);
    usedIds.add(card.defenderId);
  };

  for (const armor of new Set(enemyArmors)) {
    if (slotsFull()) {
      break;
    }
    const counter = bestCard(
      collection,
      usedIds,
      (card) => card.damageType !== null && isEffectiveAgainst(card.damageType, armor),
    );
    if (counter !== null) {
      pick(counter);
    }
  }

  if (!slotsFull()) {
    const producer = bestCard(collection, usedIds, isProducer);
    if (producer !== null) {
      pick(producer);
    }
  }

  const leftovers = collection
    .filter((card) => !usedIds.has(card.defenderId))
    .sort((first, second) => second.cardLevel - first.cardLevel);
  for (const card of leftovers) {
    if (slotsFull()) {
      break;
    }
    pick(card);
  }

  return picked.map((card) => ({ defenderId: card.defenderId, cardLevel: card.cardLevel }));
}
