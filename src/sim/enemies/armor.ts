import type { EnemyDef } from '../../data';
import type { ArmorType } from '../combat/damage';
import type { EnemyState } from '../types';

/**
 * Effective armor of an enemy right now (spec 4.1, 6.2): an enemy with
 * `armorBreakHp` uses `armorAfterBreak` once its health drops to that value
 * (Pot-Head Gloomling: pot falls off at 200 hp and the body becomes Light).
 */
export function enemyArmor(enemy: EnemyState, enemyDef: EnemyDef): ArmorType {
  if (enemyDef.armorBreakHp !== undefined && enemy.hp <= enemyDef.armorBreakHp) {
    return enemyDef.armorAfterBreak ?? enemyDef.armor;
  }
  return enemyDef.armor;
}
