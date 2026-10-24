import { enemyById, rules } from '../../data';
import type { DefenderDef } from '../../data';
import { applyArmorMultiplier, calculatePreArmorDamage } from '../combat/damage';
import { applyAfterHitCombos, applyShatter } from '../combat/combos';
import { applyAttackStatus, beginDefenderAttack } from '../combat/status';
import { ENEMY_SPAWN_X } from '../grid';
import { tileCenterX } from '../grid';
import type { DefenderState, EnemyState, SimEvent, SimState } from '../types';
import { collectAuraDamageBuffs } from './aura';
import { star3RangeTiles } from './star3';

/**
 * One `beam` attack (spec 4.3): instantly hits every enemy in its lane within
 * `range` tiles. Ignores shields (no shield system yet, see #47) and hits flying
 * enemies (spec 4.4 rule 4). A ★3 `range_up` bonus replaces the range (spec 5.2).
 */
export function attackWithBeam(
  state: SimState,
  defender: DefenderState,
  defenderDef: DefenderDef,
  events: SimEvent[],
): boolean {
  const damageType = defenderDef.damageType;
  if (damageType === undefined) {
    return false;
  }
  const fromX = tileCenterX(defender.col);
  const maximumX = fromX + (star3RangeTiles(defender, defenderDef) ?? ENEMY_SPAWN_X);
  const targets = state.enemies
    .filter(
      (enemy) =>
        enemy.lane === defender.lane &&
        enemy.x > fromX - rules.combat.targetingBehindOffsetTiles &&
        enemy.x <= maximumX,
    )
    .sort((first, second) => first.id - second.id);
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
  const primary = nearestTarget(targets);
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

/** The enemy closest to the base (smallest x, then smallest id), for the attack event. */
function nearestTarget(targets: readonly EnemyState[]): EnemyState | undefined {
  let nearest: EnemyState | undefined;
  for (const enemy of targets) {
    if (
      nearest === undefined ||
      enemy.x < nearest.x ||
      (enemy.x === nearest.x && enemy.id < nearest.id)
    ) {
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
  const amount = applyArmorMultiplier(preArmorDamage, damageType, enemyDef.armor);
  enemy.hp -= amount;
  events.push({ type: 'hit', targetId: enemy.id, amount, damageType, crit: false });
}
