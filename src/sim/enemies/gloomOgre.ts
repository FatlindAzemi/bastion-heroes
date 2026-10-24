import { rules } from '../../data';
import type { EnemyDef } from '../../data';
import type { EnemyState, SimEvent, SimState } from '../types';
import { spawnEnemy } from './spawn';

/**
 * Gloom Ogre special (spec 6.2): once, at `throwAtHealthRatio` health, it throws
 * one `throwEnemyId` `throwDistanceTiles` forward (toward the base), so it lands
 * behind the first defender of the lane. The spawn point never goes past the
 * base line; the thrown enemy joins the same wave as the ogre.
 */
export function updateGloomOgre(
  state: SimState,
  enemy: EnemyState,
  enemyDef: EnemyDef,
  events: SimEvent[],
): void {
  const healthRatio = enemyDef.throwAtHealthRatio;
  const throwEnemyId = enemyDef.throwEnemyId;
  const distanceTiles = enemyDef.throwDistanceTiles;
  if (
    enemy.hasThrown ||
    healthRatio === undefined ||
    throwEnemyId === undefined ||
    distanceTiles === undefined
  ) {
    return;
  }
  if (enemy.hp > enemy.maxHp * healthRatio) {
    return;
  }
  enemy.hasThrown = true;
  const throwX = Math.max(rules.grid.baseLineX, enemy.x - distanceTiles);
  spawnEnemy(state, throwEnemyId, enemy.lane, throwX, enemy.waveIndex, events);
}
