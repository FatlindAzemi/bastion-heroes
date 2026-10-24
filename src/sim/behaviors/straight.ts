import { defenderById } from '../../data';
import { calculatePreArmorDamage } from '../combat/damage';
import { findTarget } from '../combat/targeting';
import { tileCenterX } from '../grid';
import type { DefenderState, ProjectileState, SimEvent, SimState } from '../types';

/**
 * One `straight` attack (spec 4.3): fires a projectile to the right at the first
 * non-flying enemy in the lane. Returns true when the defender fired.
 */
export function attackWithStraight(
  state: SimState,
  defender: DefenderState,
  events: SimEvent[],
): boolean {
  const defenderDef = defenderById[defender.defenderId];
  if (defenderDef === undefined || defenderDef.damageType === undefined) {
    return false;
  }
  const fireFromX = tileCenterX(defender.col);
  const target = findTarget(state.enemies, {
    lane: defender.lane,
    fromX: fireFromX,
    rangeTiles: defenderDef.range,
    canHitFlying: false,
  });
  if (target === undefined) {
    return false;
  }

  const projectile: ProjectileState = {
    id: state.nextId,
    kind: 'straight',
    lane: defender.lane,
    x: fireFromX,
    sourceId: defender.id,
    damage: calculatePreArmorDamage(defenderDef.damage, defender.cardLevel, defender.stars),
    damageType: defenderDef.damageType,
  };
  state.nextId += 1;
  state.projectiles.push(projectile);
  events.push({ type: 'attack', sourceId: defender.id, targetId: target.id });
  events.push({
    type: 'projectileSpawned',
    id: projectile.id,
    kind: projectile.kind,
    x: projectile.x,
    lane: projectile.lane,
  });
  return true;
}
