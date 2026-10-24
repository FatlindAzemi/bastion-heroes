import type { EnemyDef } from '../../data';
import type { EnemyState } from '../types';

/**
 * Pot-Head Gloomling special (spec 6.2): mirrors the armor break into the state
 * so the renderer can swap to the no-pot model. The damage formula reads the
 * broken state directly through `enemyArmor` (armor.ts).
 */
export function updatePothead(enemy: EnemyState, enemyDef: EnemyDef): void {
  if (enemyDef.armorBreakHp !== undefined && enemy.hp <= enemyDef.armorBreakHp) {
    enemy.armorBroken = true;
  }
}
