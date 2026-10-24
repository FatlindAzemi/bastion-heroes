import { defenderById, enemyById, rules } from '../../data';
import { tileCenterX } from '../grid';
import { isDefenderActive, ticksFromSeconds } from '../placement';
import type { DefenderState, EnemyState, SimEvent, SimState } from '../types';
import {
  enemyAttackSpeedMultiplier,
  enemyMoveSpeedMultiplier,
  findStatus,
  isEnemyIncapacitated,
} from './status';

/**
 * Finds the active ground defender that blocks this enemy (spec 3.8): same lane,
 * tile centre at most 0.55 units to the left of the enemy. Traps are invisible to
 * enemies (spec 4.3) and flying enemies are never blocked by ground defenders.
 */
function findBlockingDefender(state: SimState, enemy: EnemyState): DefenderState | undefined {
  let blocker: DefenderState | undefined;
  for (const defender of state.defenders) {
    if (defenderById[defender.defenderId]?.pattern === 'trap') {
      continue;
    }
    if (defender.lane !== enemy.lane || !isDefenderActive(defender, state.tick)) {
      continue;
    }
    const distanceToTheLeft = enemy.x - tileCenterX(defender.col);
    if (distanceToTheLeft < 0 || distanceToTheLeft > rules.blocking.blockDistance) {
      continue;
    }
    if (blocker === undefined || tileCenterX(defender.col) > tileCenterX(blocker.col)) {
      blocker = defender;
    }
  }
  return blocker;
}

/**
 * Bites the blocking defender for biteDamage (spec 4.7). Enemy bites have no
 * damage type in the 4.1 table, so they emit `attack` (eat animation) and not the
 * typed `hit` event that defender attacks use.
 */
function biteDefender(enemy: EnemyState, defender: DefenderState, events: SimEvent[]): void {
  const enemyDef = enemyById[enemy.enemyId];
  if (enemyDef === undefined) {
    return;
  }
  defender.hp -= enemyDef.biteDamage;
  events.push({ type: 'attack', sourceId: enemy.id, targetId: defender.id });
}

/** Applies one tick of active knockback movement; returns true when it moved (spec 4.5). */
function updateKnockback(enemy: EnemyState): boolean {
  const knockback = findStatus(enemy, 'knockback');
  if (knockback === undefined) {
    return false;
  }
  enemy.x += knockback.knockbackTilesPerTick;
  return true;
}

/** Walks the enemy left with its status-aware speed (spec 3.8, 4.5). */
function walkLeft(enemy: EnemyState, speedTilesPerSecond: number): void {
  enemy.blockedByDefenderId = null;
  enemy.nextBiteTick = null;
  enemy.x -= (speedTilesPerSecond / rules.tick.tickRate) * enemyMoveSpeedMultiplier(enemy);
}

/** Phase 7 (spec 11.3): enemies move, block and eat, sorted by id (spec 3.8, 4.5, 4.7). */
export function updateEnemies(state: SimState, events: SimEvent[]): void {
  const enemies = [...state.enemies].sort((first, second) => first.id - second.id);
  for (const enemy of enemies) {
    const enemyDef = enemyById[enemy.enemyId];
    if (enemyDef === undefined) {
      continue;
    }
    if (updateKnockback(enemy)) {
      continue;
    }
    if (isEnemyIncapacitated(enemy)) {
      // Frozen or stunned: no movement and no bites (spec 4.5).
      continue;
    }
    const blocker = enemyDef.isFlying ? undefined : findBlockingDefender(state, enemy);
    if (blocker === undefined) {
      walkLeft(enemy, enemyDef.speed);
      continue;
    }

    enemy.blockedByDefenderId = blocker.id;
    if (enemy.nextBiteTick === null) {
      // A blocked enemy starts eating immediately, then every biteIntervalS.
      enemy.nextBiteTick = state.tick;
    }
    if (state.tick >= enemy.nextBiteTick) {
      biteDefender(enemy, blocker, events);
      // Slow halves the attack speed, so the next bite takes longer (spec 4.5).
      const biteIntervalSeconds = enemyDef.biteIntervalS / enemyAttackSpeedMultiplier(enemy);
      enemy.nextBiteTick = state.tick + ticksFromSeconds(biteIntervalSeconds);
    }
  }
}
