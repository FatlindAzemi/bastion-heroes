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
import { star3SplashRadius } from './star3';

/**
 * One `splash` attack (spec 4.3): like `lob`, and the impact deals full damage to
 * the target and `rules.combat.splashSecondaryDamageRatio` (50 %) to every enemy
 * within the splash radius. The radius comes from the defender data (0.8 for the
 * Boomcap Brewer) or from its ★3 `splash_radius_up` bonus (1.2, spec 5.2).
 */
export function attackWithSplash(
  state: SimState,
  defender: DefenderState,
  defenderDef: DefenderDef,
  events: SimEvent[],
): boolean {
  const damageType = defenderDef.damageType;
  const splashRadius = star3SplashRadius(defender, defenderDef);
  if (damageType === undefined || splashRadius === null) {
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
      kind: 'splash',
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
      splashRadius,
    },
    events,
  );
  return true;
}
