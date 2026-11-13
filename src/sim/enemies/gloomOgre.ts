import type { EnemyDef } from '../../data';
import {
  advanceX,
  baseLineXOf,
  enemySide,
  forwardOf,
  isAheadOf,
  opposingSide,
} from '../combat/side';
import type { CombatState, EnemyState, SimEvent } from '../types';
import { spawnEnemy } from './spawn';

/**
 * Gloom Ogre special (spec 6.2): once, at `throwAtHealthRatio` health, it throws
 * one `throwEnemyId` `throwDistanceTiles` forward (toward the base it attacks),
 * so it lands behind the first defender of the lane. The spawn point never goes
 * past that base line; the thrown enemy joins the ogre's side and wave.
 */
export function updateGloomOgre(
  state: CombatState,
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
  const forward = forwardOf(enemySide(enemy));
  const targetBaseLineX = baseLineXOf(opposingSide(enemySide(enemy)));
  const landingX = advanceX(enemy.x, distanceTiles, forward);
  const throwX = isAheadOf(landingX, targetBaseLineX, forward) ? targetBaseLineX : landingX;
  spawnEnemy(state, throwEnemyId, enemy.lane, throwX, enemy.waveIndex, events, enemy.side);
}
