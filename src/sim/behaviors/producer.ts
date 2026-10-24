import { defenderById, rules } from '../../data';
import { tileCenterX } from '../grid';
import { spawnOrb } from '../orbs';
import { isDefenderActive, ticksFromSeconds } from '../placement';
import type { DefenderState, SimEvent, SimState } from '../types';

/**
 * The interval between two producer orbs in ticks. The star bonuses of spec 3.6
 * divide the base interval: ★2 by 1.5 and ★3 by 2.
 */
function producerIntervalTicks(defender: DefenderState, attackIntervalS: number): number {
  const divisor =
    defender.stars === 3
      ? rules.merge.producerStar3IntervalDivisor
      : defender.stars === 2
        ? rules.merge.producerStar2IntervalDivisor
        : 1;
  return ticksFromSeconds(attackIntervalS / divisor);
}

/**
 * Phase 3 for the `producer` pattern (spec 3.3, 4.3, 5.2): an active producer
 * drops one Essence orb on its own tile when its timer is due, then schedules
 * the next orb with the star interval divisors. The pattern is dispatched from
 * `updateEssence`, so the producer never attacks in the combat phase.
 */
export function spawnProducerOrbs(state: SimState, events: SimEvent[]): void {
  const producers = state.defenders
    .filter((defender) => defender.nextOrbTick !== null)
    .sort((first, second) => first.id - second.id);

  for (const defender of producers) {
    const firstOrbTick = defender.nextOrbTick;
    if (firstOrbTick === null || state.tick < firstOrbTick) {
      continue;
    }
    if (!isDefenderActive(defender, state.tick)) {
      continue;
    }
    const defenderDef = defenderById[defender.defenderId];
    if (
      defenderDef === undefined ||
      defenderDef.pattern !== 'producer' ||
      defenderDef.attackIntervalS === undefined ||
      defenderDef.orbEssence === undefined
    ) {
      continue;
    }
    const intervalTicks = producerIntervalTicks(defender, defenderDef.attackIntervalS);
    let nextOrbTick = firstOrbTick;
    while (state.tick >= nextOrbTick) {
      spawnOrb(state, events, defender.lane, tileCenterX(defender.col), defenderDef.orbEssence);
      nextOrbTick += intervalTicks;
    }
    defender.nextOrbTick = nextOrbTick;
  }
}
