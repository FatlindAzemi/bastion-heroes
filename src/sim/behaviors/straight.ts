import type { DefenderDef } from '../../data';
import { calculatePreArmorDamage } from '../combat/damage';
import { spawnProjectile } from '../combat/projectiles';
import { findTarget } from '../combat/targeting';
import { tileCenterX } from '../grid';
import type { DefenderState, SimEvent, SimState } from '../types';
import { beginDefenderAttack } from '../combat/status';
import { collectAuraDamageBuffs } from './aura';
import { star3ExtraHits, star3RangeTiles } from './star3';

/**
 * One `straight` attack (spec 4.3): fires a projectile to the right at the first
 * enemy in the lane that the pattern can hit (non-flying unless `hitsFlying`).
 * A ★3 `piercing_arrow` projectile passes through its first targets (spec 5.2).
 * Returns true when the defender fired.
 */
export function attackWithStraight(
  state: SimState,
  defender: DefenderState,
  defenderDef: DefenderDef,
  events: SimEvent[],
): boolean {
  const damageType = defenderDef.damageType;
  if (damageType === undefined) {
    return false;
  }
  const fireFromX = tileCenterX(defender.col);
  const hitsFlying = defenderDef.hitsFlying === true;
  const target = findTarget(state.enemies, {
    lane: defender.lane,
    fromX: fireFromX,
    rangeTiles: star3RangeTiles(defender, defenderDef),
    canHitFlying: hitsFlying,
  });
  if (target === undefined) {
    return false;
  }

  const buffs = collectAuraDamageBuffs(state, defender);
  const attackStatus = beginDefenderAttack(defender, defenderDef);
  events.push({ type: 'attack', sourceId: defender.id, targetId: target.id });
  spawnProjectile(
    state,
    defender,
    {
      kind: 'straight',
      lane: defender.lane,
      x: fireFromX,
      damage: calculatePreArmorDamage(
        defenderDef.damage,
        defender.cardLevel,
        defender.stars,
        buffs,
      ),
      damageType,
      hitsFlying,
      status: attackStatus,
      element: defenderDef.element,
      piercesRemaining: star3ExtraHits(defender, defenderDef),
    },
    events,
  );
  return true;
}
