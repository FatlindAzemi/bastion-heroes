import { defenderById, enemyById, rules } from '../../data';
import { star3MeleeReflectRatio } from '../behaviors/star3';
import { updateEnemySpecial } from '../enemies/dispatch';
import { tileCenterX } from '../grid';
import { isDefenderActive, ticksFromSeconds } from '../placement';
import type { CombatState, DefenderState, EnemyState, SimEvent } from '../types';
import { advanceX, defenderSide, distanceAhead, enemySide, forwardOf, isAheadOf } from './side';
import {
  enemyAttackSpeedMultiplier,
  enemyMoveSpeedMultiplier,
  findStatus,
  isEnemyIncapacitated,
} from './status';

/** True when this defender can block the walking unit at all (spec 3.8, 4.3, 18.6). */
function canBlock(state: CombatState, defender: DefenderState, enemy: EnemyState): boolean {
  if (defenderById[defender.defenderId]?.pattern === 'trap') {
    return false;
  }
  return (
    defender.lane === enemy.lane &&
    defenderSide(defender) !== enemySide(enemy) &&
    isDefenderActive(defender, state.tick)
  );
}

/**
 * Finds the active ground defender of the other side that blocks this walking
 * unit (spec 3.8, 18.6): same lane, tile centre at most 0.55 units ahead of the
 * unit (to its left in the campaign). Traps are invisible to enemies (spec 4.3)
 * and flying enemies are never blocked by ground defenders.
 */
export function findBlockingDefender(
  state: CombatState,
  enemy: EnemyState,
): DefenderState | undefined {
  const forward = forwardOf(enemySide(enemy));
  let blocker: DefenderState | undefined;
  for (const defender of state.defenders) {
    if (!canBlock(state, defender, enemy)) {
      continue;
    }
    const distance = distanceAhead(enemy.x, tileCenterX(defender.col), forward);
    if (distance < 0 || distance > rules.blocking.blockDistance) {
      continue;
    }
    if (
      blocker === undefined ||
      isAheadOf(tileCenterX(blocker.col), tileCenterX(defender.col), forward)
    ) {
      blocker = defender;
    }
  }
  return blocker;
}

/**
 * Bites the blocking defender for biteDamage (spec 4.7). A ★3 Iron Granny
 * reflects part of that melee damage back to the enemy (spec 5.2).
 *
 * Enemy bites have no damage type in the 4.1 table, so they emit `attack` (eat
 * animation) and not the typed `hit` event that defender attacks use. The
 * reflection is an untyped hit too and reuses the same `attack` event, from the
 * defender to the enemy.
 */
export function biteDefender(enemy: EnemyState, defender: DefenderState, events: SimEvent[]): void {
  const enemyDef = enemyById[enemy.enemyId];
  if (enemyDef === undefined || enemyDef.biteDamage <= 0 || enemyDef.biteIntervalS === undefined) {
    // Enemies without an attack (Bat Swarm's "—", spec 6.1) never damage a defender.
    return;
  }
  defender.hp -= enemyDef.biteDamage;
  events.push({ type: 'attack', sourceId: enemy.id, targetId: defender.id });
  const defenderDef = defenderById[defender.defenderId];
  if (defenderDef === undefined) {
    return;
  }
  const reflectedDamage = Math.round(
    enemyDef.biteDamage * star3MeleeReflectRatio(defender, defenderDef),
  );
  if (reflectedDamage <= 0) {
    return;
  }
  enemy.hp -= reflectedDamage;
  events.push({ type: 'attack', sourceId: defender.id, targetId: enemy.id });
}

/**
 * Applies one tick of active knockback movement; returns true when it moved
 * (spec 4.5). The unit is pushed back against its own forward direction: to the
 * right for a campaign enemy.
 */
export function updateKnockback(enemy: EnemyState): boolean {
  const knockback = findStatus(enemy, 'knockback');
  if (knockback === undefined) {
    return false;
  }
  enemy.x = advanceX(enemy.x, -knockback.knockbackTilesPerTick, forwardOf(enemySide(enemy)));
  return true;
}

/**
 * Walks the unit forward with its status-aware speed (spec 3.8, 4.5, 18.1):
 * towards -x for a campaign enemy and a north raider, towards +x for a south raider.
 */
export function walkForward(enemy: EnemyState, speedTilesPerSecond: number): void {
  enemy.blockedByDefenderId = null;
  enemy.nextBiteTick = null;
  const stepTiles = (speedTilesPerSecond / rules.tick.tickRate) * enemyMoveSpeedMultiplier(enemy);
  enemy.x = advanceX(enemy.x, stepTiles, forwardOf(enemySide(enemy)));
}

/** Phase 7 (spec 11.3): enemies move, block and eat, sorted by id (spec 3.8, 4.5, 4.7). */
export function updateEnemies(state: CombatState, events: SimEvent[]): void {
  const enemies = [...state.enemies].sort((first, second) => first.id - second.id);
  for (const enemy of enemies) {
    const enemyDef = enemyById[enemy.enemyId];
    if (enemyDef === undefined) {
      continue;
    }
    // Special behaviours tick even while blocked or frozen: healing and the
    // ogre's one-time throw are abilities, not movement or attacks (spec 6.2).
    // A dead enemy no longer acts: it is removed in phase 8.
    if (enemy.hp > 0) {
      updateEnemySpecial(state, enemy, enemyDef, events);
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
      walkForward(enemy, enemyDef.speed);
      continue;
    }

    enemy.blockedByDefenderId = blocker.id;
    if (enemyDef.biteIntervalS === undefined) {
      // An enemy without an attack stays pinned in front of the defender harmlessly.
      continue;
    }
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
