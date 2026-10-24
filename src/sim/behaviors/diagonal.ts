import type { DefenderDef } from '../../data';
import { rules } from '../../data';
import { calculatePreArmorDamage } from '../combat/damage';
import { spawnProjectile } from '../combat/projectiles';
import { findTarget } from '../combat/targeting';
import { tileCenterX } from '../grid';
import type { AttackStatus } from '../combat/status';
import type { ElementKind } from '../types';
import type { DefenderState, SimEvent, SimState } from '../types';
import { beginDefenderAttack } from '../combat/status';
import { collectAuraDamageBuffs } from './aura';

/**
 * One `diagonal` attack (spec 4.3): fires three straight projectiles — one in the
 * defender's lane, one for the lane above and one for the lane below (when those
 * lanes exist). The side projectiles start in the defender's lane and switch to
 * their target lane once, `rules.combat.diagonalLaneSwitchTiles` after spawning.
 */
export function attackWithDiagonal(
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
    canHitFlying: defenderDef.hitsFlying === true,
  });
  if (target === undefined) {
    return false;
  }

  const buffs = collectAuraDamageBuffs(state, defender);
  const damage = calculatePreArmorDamage(
    defenderDef.damage,
    defender.cardLevel,
    defender.stars,
    buffs,
  );
  const hitsFlying = defenderDef.hitsFlying === true;
  const attackStatus = beginDefenderAttack(defender, defenderDef);
  const switchAtX = fromX + rules.combat.diagonalLaneSwitchTiles;
  events.push({ type: 'attack', sourceId: defender.id, targetId: target.id });
  fireLane(
    state,
    defender,
    events,
    damageType,
    damage,
    hitsFlying,
    fromX,
    null,
    null,
    attackStatus,
    defenderDef.element,
  );
  if (defender.lane > 0) {
    fireLane(
      state,
      defender,
      events,
      damageType,
      damage,
      hitsFlying,
      fromX,
      defender.lane - 1,
      switchAtX,
      attackStatus,
      defenderDef.element,
    );
  }
  if (defender.lane < rules.grid.laneCount - 1) {
    fireLane(
      state,
      defender,
      events,
      damageType,
      damage,
      hitsFlying,
      fromX,
      defender.lane + 1,
      switchAtX,
      attackStatus,
      defenderDef.element,
    );
  }
  return true;
}

/** Spawns one diagonal projectile; a non-null target lane is reached at switchAtX (spec 4.3). */
function fireLane(
  state: SimState,
  defender: DefenderState,
  events: SimEvent[],
  damageType: 'pierce' | 'blast' | 'arcane',
  damage: number,
  hitsFlying: boolean,
  fromX: number,
  targetLane: number | null,
  switchAtX: number | null,
  attackStatus: AttackStatus | null,
  element: ElementKind,
): void {
  spawnProjectile(
    state,
    defender,
    {
      kind: 'diagonal',
      lane: defender.lane,
      x: fromX,
      damage,
      damageType,
      hitsFlying,
      targetLane,
      switchAtX,
      status: attackStatus,
      element,
    },
    events,
  );
}
