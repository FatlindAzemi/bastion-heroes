/**
 * Card collection projections of the M4 save (spec 3.12, 8.3, 8.6).
 *
 * `createOwnedCollection` is the loadout roster: owned cards only, in registry
 * order (the deterministic Recommended tie-break). `createCollectionEntries` is
 * the Collection screen grid: every card, owned first, then rarity (Mythic first)
 * and Essence cost, with the shard/upgrade state of the save.
 */
import { defenders } from '../../data';
import { RARITY_ORDER } from '../../data/economy';
import type { DefenderDef } from '../../data/schemas';
import { cardUpgradeView, type SaveData } from '../../meta';
import type { CollectionCardView } from './types';

/** Projects one defender definition into the card view the Loadout renders. */
function toCardView(defender: DefenderDef, cardLevel: number): CollectionCardView {
  return {
    defenderId: defender.id,
    name: defender.name,
    rarity: defender.rarity,
    faction: defender.faction,
    role: defender.role,
    cost: defender.cost,
    damageType: defender.damageType ?? null,
    cardLevel,
  };
}

/**
 * The M2 debug collection: every defender in registry order at card level 1.
 * Only the temporary `?level=<id>&scout=1` debug flow still uses it.
 */
export function createM2Collection(): readonly CollectionCardView[] {
  return defenders.map((defender) => toCardView(defender, 1));
}

/** The owned cards in registry order, at their saved card levels (spec 3.12). */
export function createOwnedCollection(save: SaveData): readonly CollectionCardView[] {
  return defenders.flatMap((defender) => {
    const card = save.cards[defender.id];
    return card === undefined ? [] : [toCardView(defender, card.level)];
  });
}

/** One card tile of the Collection screen. */
export interface CollectionEntry {
  readonly card: CollectionCardView;
  readonly owned: boolean;
  readonly shards: number;
  readonly shardsNeeded: number;
  readonly goldCost: number;
  readonly maxed: boolean;
  readonly canUpgrade: boolean;
}

/** Rarity sort rank of spec 8.6: Mythic first, Common last. */
function rarityRank(defender: DefenderDef): number {
  const index = RARITY_ORDER.indexOf(defender.rarity);
  return index === -1 ? RARITY_ORDER.length : index;
}

/** The full collection grid, sorted by owned first, rarity and Essence cost (spec 8.6). */
export function createCollectionEntries(save: SaveData): readonly CollectionEntry[] {
  const sorted = [...defenders].sort((left, right) => {
    const leftOwned = save.cards[left.id] !== undefined;
    const rightOwned = save.cards[right.id] !== undefined;
    if (leftOwned !== rightOwned) {
      return leftOwned ? -1 : 1;
    }
    const rarityDelta = rarityRank(left) - rarityRank(right);
    if (rarityDelta !== 0) {
      return rarityDelta;
    }
    const costDelta = left.cost - right.cost;
    return costDelta !== 0 ? costDelta : left.name.localeCompare(right.name);
  });
  return sorted.map((defender) => {
    const ownedCard = save.cards[defender.id];
    const upgrade = cardUpgradeView(save, defender.id);
    return {
      card: toCardView(defender, ownedCard?.level ?? 1),
      owned: ownedCard !== undefined,
      shards: upgrade?.shards ?? 0,
      shardsNeeded: upgrade?.shardsNeeded ?? 0,
      goldCost: upgrade?.goldCost ?? 0,
      maxed: upgrade?.maxed ?? false,
      canUpgrade: upgrade?.canUpgrade ?? false,
    };
  });
}
