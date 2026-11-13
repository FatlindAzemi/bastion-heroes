import { enemyById, rules } from '../../data';
import type { DefenderDef } from '../../data';
import { applyArmorMultiplier, calculatePreArmorDamage } from '../combat/damage';
import { applyAfterHitCombos, applyShatter } from '../combat/combos';
import { applyAttackStatus, beginDefenderAttack } from '../combat/status';
import { enemyArmor } from '../enemies/armor';
import {
  advanceX,
  defenderSide,
  enemySide,
  forwardOf,
  isAheadOf,
  type ForwardDirection,
} from '../combat/side';
import { isCloserTarget } from '../combat/targeting';
import { ENEMY_SPAWN_X, tileCenterX } from '../grid';
import type { CombatState, DefenderState, EnemyState, SimEvent } from '../types';
import { collectAuraDamageBuffs } from './aura';
import { star3RangeTiles } from './star3';

/**
 * One `beam` attack (spec 4.3): instantly hits every unit of the other side in
 * its lane within `range` tiles ahead (spec 18.1). Beams hit the body of a Shieldbearer directly (spec 6.2) and hit
 * flying enemies (spec 4.4 rule 4). A ★3 `range_up` bonus replaces the range (spec 5.2).
 */
export function attackWithBeam(
  state: CombatState,
  defender: DefenderState,
  defenderDef: DefenderDef,
  events: SimEvent[],
): boolean {
  const damageType = defenderDef.damageType;
  if (damageType === undefined) {
    return false;
  }
  const targets = beamTargets(state, defender, defenderDef);
  if (targets.length === 0) {
    return false;
  }

  const buffs = collectAuraDamageBuffs(state, defender);
  const preArmorDamage = calculatePreArmorDamage(
    defenderDef.damage,
    defender.cardLevel,
    defender.stars,
    buffs,
  );
  const primary = nearestTarget(targets, forwardOf(defenderSide(defender)));
  const attackStatus = beginDefenderAttack(defender, defenderDef);
  events.push({ type: 'attack', sourceId: defender.id, targetId: primary?.id ?? null });
  for (const enemy of targets) {
    const shatterMultiplier = applyShatter(state.tick, damageType, enemy, events);
    hitWithBeam(enemy, preArmorDamage * shatterMultiplier, damageType, events);
    if (attackStatus !== null) {
      applyAttackStatus(state.tick, enemy, attackStatus, events);
    }
    applyAfterHitCombos(state, state.tick, defenderDef.element, damageType, enemy, events);
  }
  return true;
}

/** The units of the other side the beam reaches, in id order (spec 4.3, 4.4 rule 1, 18.1). */
function beamTargets(
  state: CombatState,
  defender: DefenderState,
  defenderDef: DefenderDef,
): EnemyState[] {
  const side = defenderSide(defender);
  const forward = forwardOf(side);
  const fromX = tileCenterX(defender.col);
  const rangeTiles = star3RangeTiles(defender, defenderDef) ?? ENEMY_SPAWN_X;
  const rangeLimitX = advanceX(fromX, rangeTiles, forward);
  const behindLimitX = advanceX(fromX, -rules.combat.targetingBehindOffsetTiles, forward);
  return state.enemies
    .filter(
      (enemy) =>
        enemy.lane === defender.lane &&
        enemySide(enemy) !== side &&
        isAheadOf(enemy.x, behindLimitX, forward) &&
        !isAheadOf(enemy.x, rangeLimitX, forward),
    )
    .sort((first, second) => first.id - second.id);
}

/** The target closest to the defender's own bastion (then smallest id), for the attack event. */
function nearestTarget(
  targets: readonly EnemyState[],
  forward: ForwardDirection,
): EnemyState | undefined {
  let nearest: EnemyState | undefined;
  for (const enemy of targets) {
    if (nearest === undefined || isCloserTarget(enemy, nearest, forward)) {
      nearest = enemy;
    }
  }
  return nearest;
}

/** Applies one beam hit to an enemy (spec 4.2) and emits the hit event. */
function hitWithBeam(
  enemy: EnemyState,
  preArmorDamage: number,
  damageType: 'pierce' | 'blast' | 'arcane',
  events: SimEvent[],
): void {
  const enemyDef = enemyById[enemy.enemyId];
  if (enemyDef === undefined) {
    return;
  }
  const amount = applyArmorMultiplier(preArmorDamage, damageType, enemyArmor(enemy, enemyDef));
  enemy.hp -= amount;
  events.push({ type: 'hit', targetId: enemy.id, amount, damageType, crit: false });
}
