import type { DefenderDef } from '../../data';
import { rules } from '../../data';
import { calculatePreArmorDamage } from '../combat/damage';
import { spawnProjectile } from '../combat/projectiles';
import { findTarget } from '../combat/targeting';
import { tileCenterX } from '../grid';
import { ticksFromSeconds } from '../placement';
import type { DefenderState, SimEvent, SimState } from '../types';
import { beginDefenderAttack } from '../combat/status';
import { collectAuraDamageBuffs } from './aura';

/**
 * One `lob` attack (spec 4.3): throws an arc at the first enemy in range in the
 * lane. The arc takes `rules.combat.lobFlightTimeS` to land, ignores shields
 * (no shield system yet, see #47) and cannot hit flying enemies.
 */
export function attackWithLob(
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
  const target = findTarget(state.enemies, {
    lane: defender.lane,
    fromX,
    rangeTiles: defenderDef.range,
    canHitFlying: false,
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
      kind: 'lob',
      lane: defender.lane,
      x: fromX,
      damage: calculatePreArmorDamage(
        defenderDef.damage,
        defender.cardLevel,
        defender.stars,
        buffs,
      ),
      damageType,
      hitsFlying: false,
      status: attackStatus,
      element: defenderDef.element,
      targetId: target.id,
      landTick: state.tick + ticksFromSeconds(rules.combat.lobFlightTimeS),
    },
    events,
  );
  return true;
}
