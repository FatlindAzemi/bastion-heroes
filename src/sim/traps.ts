import { enemyById, rules } from '../data';
import type { EnemyDef } from '../data';
import type { SimEvent, SimState, TrapState } from './types';

/** Tiles the roller moves per tick (spec 3.9: 8 tiles/s at 30 ticks/s). */
const TRAP_SPEED_TILES_PER_TICK = rules.trap.trapSpeedTilesPerS / rules.tick.tickRate;

/** Creates one unused Last Stand Trap per lane (spec 3.9). */
export function initialTraps(): TrapState[] {
  return Array.from({ length: rules.grid.laneCount }, () => ({ used: false, rollerX: null }));
}

/**
 * Damage the trap deals to one enemy (spec 3.9): bosses take `rules.trap.trapBossDamage`
 * and survive, every other enemy dies instantly (null means an instant kill).
 * Exported so the boss branch is unit-testable although no boss data exists in M1.
 */
export function trapDamage(enemyDef: Pick<EnemyDef, 'isBoss'>): number | null {
  return enemyDef.isBoss ? rules.trap.trapBossDamage : null;
}

/**
 * Fires the trap of every lane where an enemy reached the base line and the trap
 * is still unused (spec 3.9). The roller starts at `rules.trap.trapStartX`.
 */
function fireReadyTraps(state: SimState, events: SimEvent[]): void {
  for (let lane = 0; lane < state.traps.length; lane += 1) {
    const trap = state.traps[lane];
    if (trap === undefined || trap.used) {
      continue;
    }
    const reachedBaseLine = state.enemies.some(
      (enemy) => enemy.lane === lane && enemy.x <= rules.grid.baseLineX,
    );
    if (!reachedBaseLine) {
      continue;
    }
    trap.used = true;
    trap.rollerX = rules.trap.trapStartX;
    events.push({ type: 'trapFired', lane });
  }
}

/** Rolls every active trap right, kills the enemies it touches and stops at trapEndX (spec 3.9). */
function rollTraps(state: SimState, events: SimEvent[]): void {
  for (let lane = 0; lane < state.traps.length; lane += 1) {
    const trap = state.traps[lane];
    if (trap === undefined || trap.rollerX === null) {
      continue;
    }
    const previousX = trap.rollerX;
    trap.rollerX += TRAP_SPEED_TILES_PER_TICK;
    const rollerX = trap.rollerX;

    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];
      if (enemy === undefined || enemy.lane !== lane) {
        continue;
      }
      if (enemy.x > rollerX || enemy.x <= previousX) {
        continue;
      }
      const enemyDef = enemyById[enemy.enemyId];
      if (enemyDef === undefined) {
        continue;
      }
      const damage = trapDamage(enemyDef);
      if (damage === null) {
        // Instant kill: removed right away so the win check of phase 10 sees it gone.
        state.enemies.splice(index, 1);
        events.push({ type: 'enemyDied', id: enemy.id });
      } else {
        enemy.hp -= damage;
      }
    }

    if (trap.rollerX >= rules.trap.trapEndX) {
      trap.rollerX = null;
    }
  }
}

/**
 * Phase 9 of every tick (spec 11.3): fires unused traps whose lane was reached and
 * rolls the active rollers over the enemies (spec 3.9). One use per lane per level;
 * a roller that reached `trapEndX` reports `rollerX: null` and the trap stays used.
 */
export function updateTraps(state: SimState, events: SimEvent[]): void {
  fireReadyTraps(state, events);
  rollTraps(state, events);
}
