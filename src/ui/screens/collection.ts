/**
 * The card collection shown by the Loadout screen (spec 3.12 rule 2, issue #49).
 *
 * M4 seam: the save data, collection, rarity unlocks and card upgrades do not
 * exist yet (spec 8, 11.9), so the collection is the full M2 roster at card
 * level 1 (spec 5.1). When the M4 save arrives this module reads the owned
 * cards and their levels from it instead.
 */
import { defenders } from '../../data';
import type { DefenderDef } from '../../data/schemas';
import type { CollectionCardView } from './types';

/** Card level of every M2 card until the M4 upgrade system exists (spec 4.2, 8.3). */
const ROSTER_CARD_LEVEL = 1;

/** Projects one defender definition into the card view the screens render. */
function toCardView(defender: DefenderDef): CollectionCardView {
  return {
    defenderId: defender.id,
    name: defender.name,
    rarity: defender.rarity,
    faction: defender.faction,
    role: defender.role,
    cost: defender.cost,
    damageType: defender.damageType ?? null,
    cardLevel: ROSTER_CARD_LEVEL,
  };
}

/**
 * The M2 collection: every M2 defender in registry order (the deterministic
 * tie-break of the Recommended rule, spec 3.12 rule 3), at card level 1.
 */
export function createM2Collection(): readonly CollectionCardView[] {
  return defenders.map(toCardView);
}
