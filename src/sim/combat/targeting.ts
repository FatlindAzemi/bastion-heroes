import { enemyById, rules } from '../../data';
import { ENEMY_SPAWN_X } from '../grid';
import type { EnemyState, Side } from '../types';
import {
  advanceX,
  CAMPAIGN_DEFENDER_SIDE,
  enemySide,
  forwardOf,
  isAheadOf,
  type ForwardDirection,
} from './side';

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
  /** Side of the attacker; omitted means the campaign's defenders (south, spec 18.1). */
  readonly side?: Side;
}

/**
 * True when `candidate` is a better target than `current` for an attacker facing
 * `forward` (spec 4.4 rule 2, 18.1): the unit closest to the attacker's own
 * bastion first, the earliest spawned unit (smallest id) on a tie.
 */
export function isCloserTarget(
  candidate: EnemyState,
  current: EnemyState,
  forward: ForwardDirection,
): boolean {
  return (
    isAheadOf(current.x, candidate.x, forward) ||
    (candidate.x === current.x && candidate.id < current.id)
  );
}

/**
 * Picks the target of one attack (spec 4.4, 18.1): only units of the other side
 * that are in front of the attacker (less than 0.3 tiles behind it) and within
 * range, the one closest to the attacker's own bastion first and the earliest
 * spawned unit (smallest id) on a tie. In the campaign that is "x > fromX - 0.3,
 * smallest x first".
 */
export function findTarget(
  enemies: readonly EnemyState[],
  options: TargetingOptions,
): EnemyState | undefined {
  const side = options.side ?? CAMPAIGN_DEFENDER_SIDE;
  const forward = forwardOf(side);
  const behindLimitX = advanceX(options.fromX, -rules.combat.targetingBehindOffsetTiles, forward);
  const rangeLimitX = advanceX(options.fromX, options.rangeTiles ?? ENEMY_SPAWN_X, forward);
  let target: EnemyState | undefined;
  for (const enemy of enemies) {
    if (enemy.lane !== options.lane || enemySide(enemy) === side) {
      continue;
    }
    if (!isAheadOf(enemy.x, behindLimitX, forward) || isAheadOf(enemy.x, rangeLimitX, forward)) {
      continue;
    }
    const enemyDef = enemyById[enemy.enemyId];
    if (enemyDef?.isFlying === true && options.canHitFlying !== true) {
      continue;
    }
    if (target === undefined || isCloserTarget(enemy, target, forward)) {
      target = enemy;
    }
  }
  return target;
}
