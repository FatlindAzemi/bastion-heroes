import type { EnemyDef } from '../../data';
import type { EnemyState, SimEvent, SimState } from '../types';
import { updateGloomOgre } from './gloomOgre';
import { updateGloomPriest } from './gloomPriest';
import { updatePothead } from './pothead';

/**
 * Runs the `EnemyDef.special` behaviour of one enemy in the enemy phase
 * (spec 6.2). Passive traits are data-driven in the damage pipeline instead of
 * here: the Pot-Head armor break is read by `enemyArmor` and the Shieldbearer
 * shield is read by `absorbShieldHit`.
 */
export function updateEnemySpecial(
  state: SimState,
  enemy: EnemyState,
  enemyDef: EnemyDef,
  events: SimEvent[],
): void {
  switch (enemyDef.special) {
    case 'pot_armor':
      updatePothead(enemy, enemyDef);
      break;
    case 'gloom_priest_heal':
      updateGloomPriest(state, enemy, enemyDef);
      break;
    case 'gloom_ogre_throw':
      updateGloomOgre(state, enemy, enemyDef, events);
      break;
    default:
      // gloomling, shade_wisp and bat_swarm have no special; 'directional_shield'
      // is passive and resolved where projectile hits are applied (spec 6.2).
      break;
  }
}
