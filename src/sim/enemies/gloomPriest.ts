import type { EnemyDef } from '../../data';
import { ticksFromSeconds } from '../placement';
import type { EnemyState, SimState } from '../types';

/** Distance in tiles on the 2D simulation plane (spec 3.1; combos of 4.6 use the same measure). */
function distanceTiles(first: EnemyState, second: EnemyState): number {
  return Math.hypot(first.lane - second.lane, first.x - second.x);
}

/** Heals every living enemy in the radius except the priest itself, capped at maxHp (spec 6.2). */
function healEnemiesInRadius(
  state: SimState,
  priest: EnemyState,
  amount: number,
  radiusTiles: number,
): void {
  for (const target of [...state.enemies].sort((first, second) => first.id - second.id)) {
    if (target.id === priest.id || target.hp <= 0) {
      continue;
    }
    if (distanceTiles(priest, target) > radiusTiles) {
      continue;
    }
    target.hp = Math.min(target.maxHp, target.hp + amount);
  }
}

/**
 * Gloom Priest special (spec 6.2): every `healIntervalS` seconds it heals every
 * enemy within `healRadiusTiles` for `healAmount` health, never itself. The first
 * pulse comes one interval after spawn (set in spawn.ts).
 */
export function updateGloomPriest(state: SimState, enemy: EnemyState, enemyDef: EnemyDef): void {
  const intervalS = enemyDef.healIntervalS;
  const amount = enemyDef.healAmount;
  const radiusTiles = enemyDef.healRadiusTiles;
  if (intervalS === undefined || amount === undefined || radiusTiles === undefined) {
    return;
  }
  if (enemy.nextHealTick === null || state.tick < enemy.nextHealTick) {
    return;
  }
  healEnemiesInRadius(state, enemy, amount, radiusTiles);
  enemy.nextHealTick = state.tick + ticksFromSeconds(intervalS);
}
