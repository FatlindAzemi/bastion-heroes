import { defenderById } from '../../data';
import type { DefenderDef } from '../../data';
import { attackWithBeam } from '../behaviors/beam';
import { attackWithDiagonal } from '../behaviors/diagonal';
import { attackWithLob } from '../behaviors/lob';
import { attackWithSplash } from '../behaviors/splash';
import { attackWithStraight } from '../behaviors/straight';
import { updateTrapDefender } from '../behaviors/trap';
import { isDefenderActive, ticksFromSeconds } from '../placement';
import type { DefenderState, SimEvent, SimState } from '../types';

/** Runs the attack behaviour of one pattern; returns true when the defender fired (spec 4.3). */
function attackWithPattern(
  state: SimState,
  defender: DefenderState,
  defenderDef: DefenderDef,
  events: SimEvent[],
): boolean {
  switch (defenderDef.pattern) {
    case 'straight':
      return attackWithStraight(state, defender, defenderDef, events);
    case 'lob':
      return attackWithLob(state, defender, defenderDef, events);
    case 'splash':
      return attackWithSplash(state, defender, defenderDef, events);
    case 'beam':
      return attackWithBeam(state, defender, defenderDef, events);
    case 'diagonal':
      return attackWithDiagonal(state, defender, defenderDef, events);
    default:
      return false;
  }
}

/**
 * Phase 4 (spec 11.3): every active defender acts in id order, dispatched through
 * its `DefenderDef.pattern` (spec 4.3). Walls block but never attack (5.2), aura
 * defenders only buff their neighbours (behaviors/aura.ts), producers drop orbs in
 * phase 3 (behaviors/producer.ts) and traps trigger from their own behaviour.
 * `melee` is not in any roster defender (5.2); enemy bites are spec 4.7.
 * A defender cannot act during its 0.5 s drop (spec 3.4).
 */
export function updateDefenders(state: SimState, events: SimEvent[]): void {
  const defenders = [...state.defenders].sort((first, second) => first.id - second.id);
  for (const defender of defenders) {
    if (!isDefenderActive(defender, state.tick)) {
      continue;
    }
    const defenderDef = defenderById[defender.defenderId];
    if (defenderDef === undefined) {
      continue;
    }
    if (defenderDef.pattern === 'trap') {
      updateTrapDefender(state, defender, defenderDef, events);
      continue;
    }
    if (
      defenderDef.pattern === 'aura' ||
      defenderDef.pattern === 'producer' ||
      defenderDef.pattern === 'wall' ||
      defenderDef.pattern === 'melee'
    ) {
      continue;
    }
    const attackIntervalTicks =
      defenderDef.attackIntervalS === undefined ? 0 : ticksFromSeconds(defenderDef.attackIntervalS);
    if (state.tick < defender.nextAttackTick) {
      continue;
    }
    if (attackWithPattern(state, defender, defenderDef, events)) {
      defender.nextAttackTick = state.tick + attackIntervalTicks;
    }
  }
}
