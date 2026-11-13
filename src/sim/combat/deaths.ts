import type { CombatState, SimEvent, SimState } from '../types';

/** Removes the dead walking units of every side and emits `enemyDied` for each (spec 11.3). */
export function removeDeadEnemies(state: CombatState, events: SimEvent[]): void {
  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    if (enemy !== undefined && enemy.hp <= 0) {
      state.enemies.splice(index, 1);
      events.push({ type: 'enemyDied', id: enemy.id });
    }
  }
}

/**
 * Removes the dead defenders of every side, emits `defenderRemoved` for each and
 * returns how many were removed (spec 4.7, 11.3).
 *
 * A defender can only die from the bites of walking units, so every dead defender
 * is removed with reason `eaten`. `destroyed` is reserved for later non-eaten
 * damage sources and `shovel` is handled in placement.ts.
 */
export function removeDeadDefenders(state: CombatState, events: SimEvent[]): number {
  let removedCount = 0;
  for (let index = state.defenders.length - 1; index >= 0; index -= 1) {
    const defender = state.defenders[index];
    if (defender !== undefined && defender.hp <= 0) {
      state.defenders.splice(index, 1);
      removedCount += 1;
      events.push({ type: 'defenderRemoved', id: defender.id, reason: 'eaten' });
    }
  }
  return removedCount;
}

/**
 * Phase 8 of the campaign (spec 11.3): removes dead entities and emits their
 * death events. Only combat losses count for the 3-star rule; shovelled
 * defenders do not (spec 3.11).
 */
export function removeDeadEntities(state: SimState, events: SimEvent[]): void {
  removeDeadEnemies(state, events);
  state.defendersLost += removeDeadDefenders(state, events);
}
