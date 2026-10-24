import type { SimEvent, SimState } from '../types';

/**
 * Phase 8 (spec 11.3): removes dead entities and emits their death events.
 *
 * In M1 a defender can only die from enemy bites, so every dead defender is
 * removed with reason `eaten` (spec 4.7). `destroyed` is reserved for the later
 * non-eaten damage sources (combos, M2) and `shovel` is handled in placement.ts.
 */
export function removeDeadEntities(state: SimState, events: SimEvent[]): void {
  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    if (enemy !== undefined && enemy.hp <= 0) {
      state.enemies.splice(index, 1);
      events.push({ type: 'enemyDied', id: enemy.id });
    }
  }
  for (let index = state.defenders.length - 1; index >= 0; index -= 1) {
    const defender = state.defenders[index];
    if (defender !== undefined && defender.hp <= 0) {
      state.defenders.splice(index, 1);
      // Only combat losses count for the 3-star rule; shovelled defenders do not (spec 3.11).
      state.defendersLost += 1;
      events.push({ type: 'defenderRemoved', id: defender.id, reason: 'eaten' });
    }
  }
}
