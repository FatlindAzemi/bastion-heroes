import { defenderById } from '../../data';
import { star3OrbEssence } from '../behaviors/star3';
import { tileCenterX } from '../grid';
import { spawnOrb } from '../orbs';
import { isDefenderActive } from '../placement';
import { producerIntervalTicks } from '../stars';
import type { SimEvent, SimState } from '../types';

/**
 * Phase 3 for the `producer` pattern (spec 3.3, 4.3, 5.2): an active producer
 * drops one Essence orb on its own tile when its timer is due, then schedules
 * the next orb with the star interval divisors (★2 /1.5, ★3 /2) and the ★3
 * `producer_orb_value_up` orb value. The pattern is dispatched from
 * `updateEssence`, so the producer never attacks in the combat phase.
 */
export function spawnProducerOrbs(state: SimState, events: SimEvent[]): void {
  const producers = state.defenders
    .filter((defender) => defender.nextOrbTick !== null)
    .sort((first, second) => first.id - second.id);

  for (const defender of producers) {
    const nextOrbTick = defender.nextOrbTick;
    if (nextOrbTick === null || state.tick < nextOrbTick) {
      continue;
    }
    if (!isDefenderActive(defender, state.tick)) {
      continue;
    }
    const defenderDef = defenderById[defender.defenderId];
    if (
      defenderDef === undefined ||
      defenderDef.pattern !== 'producer' ||
      defenderDef.attackIntervalS === undefined
    ) {
      continue;
    }
    const orbEssence = star3OrbEssence(defender, defenderDef);
    if (orbEssence === undefined) {
      continue;
    }
    const intervalTicks = producerIntervalTicks(defenderDef.attackIntervalS, defender.stars);
    let scheduledTick = nextOrbTick;
    while (state.tick >= scheduledTick) {
      spawnOrb(state, events, defender.lane, tileCenterX(defender.col), orbEssence);
      scheduledTick += intervalTicks;
    }
    defender.nextOrbTick = scheduledTick;
  }
}
