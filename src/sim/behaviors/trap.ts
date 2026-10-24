import { enemyById, rules } from '../../data';
import type { DefenderDef } from '../../data';
import { applyArmorMultiplier, calculatePreArmorDamage } from '../combat/damage';
import { ticksFromSeconds } from '../placement';
import type { DefenderState, EnemyState, SimEvent, SimState } from '../types';
import { collectAuraDamageBuffs } from './aura';

/** True when the enemy stands on the trap defender's tile (spec 4.3 trap). */
function isOnTile(defender: DefenderState, enemy: EnemyState): boolean {
  const tileLeftX = defender.col * rules.grid.tileSize;
  return (
    enemy.lane === defender.lane &&
    enemy.x >= tileLeftX &&
    enemy.x < tileLeftX + rules.grid.tileSize
  );
}

/**
 * Phase 4 for a `trap` defender (spec 4.3, 5.2): invisible to enemies, it arms
 * after `armDelayS`, triggers once when a non-flying enemy steps on its tile and
 * is then used up. A ★3 trap rearms once after `rearmS`. Burrowed enemies will
 * never trigger it when they arrive with #47 (no burrowed state exists yet).
 */
export function updateTrapDefender(
  state: SimState,
  defender: DefenderState,
  defenderDef: DefenderDef,
  events: SimEvent[],
): void {
  const readyAtTick = defender.trapReadyAtTick;
  if (readyAtTick === null || state.tick < readyAtTick) {
    return;
  }
  const trigger = [...state.enemies]
    .sort((first, second) => first.id - second.id)
    .find((enemy) => {
      const enemyDef = enemyById[enemy.enemyId];
      return enemyDef !== undefined && enemyDef.isFlying !== true && isOnTile(defender, enemy);
    });
  if (trigger === undefined) {
    return;
  }
  const damageType = defenderDef.damageType;
  if (damageType === undefined) {
    return;
  }
  const triggerDef = enemyById[trigger.enemyId];
  if (triggerDef === undefined) {
    return;
  }

  const buffs = collectAuraDamageBuffs(state, defender);
  const preArmorDamage = calculatePreArmorDamage(
    defenderDef.damage,
    defender.cardLevel,
    defender.stars,
    buffs,
  );
  const amount = applyArmorMultiplier(preArmorDamage, damageType, triggerDef.armor);
  trigger.hp -= amount;
  events.push({ type: 'attack', sourceId: defender.id, targetId: trigger.id });
  events.push({ type: 'hit', targetId: trigger.id, amount, damageType, crit: false });

  defender.trapReadyAtTick = null;
  if (defender.stars === 3 && defenderDef.rearmS !== undefined && !defender.trapRearmed) {
    defender.trapRearmed = true;
    defender.trapReadyAtTick = state.tick + ticksFromSeconds(defenderDef.rearmS);
  }
}
