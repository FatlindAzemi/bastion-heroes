import { enemyById, rules } from '../../data';
import { ENEMY_SPAWN_X } from '../grid';
import type { EnemyState } from '../types';

/** Options of the spec 4.4 target search. */
export interface TargetingOptions {
  /** Lane the attack happens in. */
  readonly lane: number;
  /** World x of the attacker (the defender's tile centre for defenders). */
  readonly fromX: number;
  /** Range in tiles ahead; omitted means the whole lane ahead (spec 4.4 rule 3). */
  readonly rangeTiles?: number;
  /** True when the pattern can hit flying enemies (spec 4.4 rule 4); false for straight. */
  readonly canHitFlying?: boolean;
}

/**
 * Picks the target of one attack (spec 4.4): only enemies in front of the
 * attacker (x > fromX - 0.3) and within range, the smallest x first and the
 * earliest spawned enemy (smallest id) on a tie.
 */
export function findTarget(
  enemies: readonly EnemyState[],
  options: TargetingOptions,
): EnemyState | undefined {
  const minimumX = options.fromX - rules.combat.targetingBehindOffsetTiles;
  const maximumX = options.fromX + (options.rangeTiles ?? ENEMY_SPAWN_X);
  let target: EnemyState | undefined;
  for (const enemy of enemies) {
    if (enemy.lane !== options.lane || enemy.x <= minimumX || enemy.x > maximumX) {
      continue;
    }
    const enemyDef = enemyById[enemy.enemyId];
    if (enemyDef?.isFlying === true && options.canHitFlying !== true) {
      continue;
    }
    if (
      target === undefined ||
      enemy.x < target.x ||
      (enemy.x === target.x && enemy.id < target.id)
    ) {
      target = enemy;
    }
  }
  return target;
}
