import { defenderById } from '../../data';
import { attackWithStraight } from '../behaviors/straight';
import { isDefenderActive, ticksFromSeconds } from '../placement';
import type { SimEvent, SimState } from '../types';

/**
 * Phase 4 (spec 11.3): every active defender acts in id order with its pattern.
 * M1 implements `straight` (spec 4.3, 5.2); the other patterns arrive with the
 * M2 issues (#2.1). A defender cannot act during its 0.5 s drop (spec 3.4).
 */
export function updateDefenders(state: SimState, events: SimEvent[]): void {
  const defenders = [...state.defenders].sort((first, second) => first.id - second.id);
  for (const defender of defenders) {
    if (!isDefenderActive(defender, state.tick)) {
      continue;
    }
    const defenderDef = defenderById[defender.defenderId];
    if (defenderDef === undefined || defenderDef.pattern !== 'straight') {
      // Walls do not attack (spec 5.2); producers drop orbs in phase 3 (#19).
      continue;
    }
    const attackIntervalTicks =
      defenderDef.attackIntervalS === undefined ? 0 : ticksFromSeconds(defenderDef.attackIntervalS);
    if (state.tick < defender.nextAttackTick) {
      continue;
    }
    if (attackWithStraight(state, defender, events)) {
      defender.nextAttackTick = state.tick + attackIntervalTicks;
    }
  }
}
