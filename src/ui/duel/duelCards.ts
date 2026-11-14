/**
 * Card views of the Duel hand (spec 9.8 card visual, 18.8, 18.9): name, frame
 * rarity, portrait faction, Duel cost and kind, read from the card files in
 * `src/data/` so the HUD never hard-codes a number.
 */
import { defenderById, enemyById } from '../../data';
import type { DuelHeldKind } from './types';

/** One card of the Duel hand as the HUD draws it. */
export interface DuelCardView {
  readonly cardId: string;
  readonly name: string;
  /** Frame rarity (spec 8.2). Raider files have no rarity yet; they use `common`. */
  readonly rarity: string;
  /** Portrait faction tint (spec 9.4); raiders use the Gloom tint. */
  readonly faction: string;
  /** Duel cost in Essence (spec 18.8). */
  readonly cost: number;
  readonly kind: DuelHeldKind;
}

/** Raiders have no rarity in the card files yet; this frame is the conservative default. */
const RAIDER_FRAME_RARITY = 'common';
/** Faction key of the Gloom raiders for the portrait tint fallback. */
const RAIDER_FACTION = 'gloom';

/** The Duel card view of a card id, or null when it is not a Duel card (spec 18.8). */
export function duelCardView(cardId: string): DuelCardView | null {
  const defender = defenderById[cardId];
  if (defender?.duel !== undefined) {
    return {
      cardId,
      name: defender.name,
      rarity: defender.rarity,
      faction: defender.faction,
      cost: defender.duel.cost,
      kind: 'defender',
    };
  }
  const raider = enemyById[cardId];
  if (raider?.duel !== undefined) {
    return {
      cardId,
      name: raider.name,
      rarity: RAIDER_FRAME_RARITY,
      faction: RAIDER_FACTION,
      cost: raider.duel.cost,
      kind: 'raider',
    };
  }
  return null;
}
