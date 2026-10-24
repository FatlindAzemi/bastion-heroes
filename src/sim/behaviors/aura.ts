import { defenderById } from '../../data';
import type { DefenderDef } from '../../data';
import { isDefenderActive } from '../placement';
import type { DefenderState, SimState } from '../types';

/** One damage buff currently affecting a defender (spec 4.2, 5.2). */
export interface ActiveDamageBuff {
  name: string;
  damageRatio: number;
}

/** True when the two tiles are orthogonally adjacent: up, down, left or right (spec 4.3). */
function isOrthogonallyAdjacent(source: DefenderState, target: DefenderState): boolean {
  return Math.abs(source.lane - target.lane) + Math.abs(source.col - target.col) === 1;
}

/** The buff an aura defender gives: the data value, replaced by the ★3 value in star3Params. */
function auraBuffOf(defender: DefenderState, defenderDef: DefenderDef): ActiveDamageBuff | null {
  const buff = defenderDef.buff;
  if (buff === undefined) {
    return null;
  }
  const star3Ratio = defender.stars === 3 ? defenderDef.star3Params?.['damageRatio'] : undefined;
  return { name: buff.name, damageRatio: star3Ratio ?? buff.damageRatio };
}

/**
 * Collects the damage buffs a defender receives from `aura` defenders on the four
 * orthogonally adjacent tiles (spec 4.3, 5.2). Buffs with the same name do not
 * stack: the highest value wins (spec 4.2). The returned ratios are summed into
 * the damage formula's `(1 + sum(buffs))`.
 */
export function collectAuraDamageBuffs(state: SimState, target: DefenderState): number[] {
  const highestByName = new Map<string, number>();
  for (const source of state.defenders) {
    if (source.id === target.id || !isOrthogonallyAdjacent(source, target)) {
      continue;
    }
    if (!isDefenderActive(source, state.tick)) {
      continue;
    }
    const sourceDef = defenderById[source.defenderId];
    if (sourceDef === undefined || sourceDef.pattern !== 'aura') {
      continue;
    }
    const buff = auraBuffOf(source, sourceDef);
    if (buff === null) {
      continue;
    }
    const existing = highestByName.get(buff.name) ?? 0;
    if (buff.damageRatio > existing) {
      highestByName.set(buff.name, buff.damageRatio);
    }
  }
  return [...highestByName.values()];
}
