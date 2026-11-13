import { BASE_LINE_X, COLUMN_COUNT, ENEMY_SPAWN_X, TILE_SIZE } from '../grid';
import type { Side } from '../types';

/**
 * Sides and directions of the shared combat code (spec 18.1, 19.11).
 *
 * Every unit belongs to one side. "Forward" is towards the enemy bastion: +x for
 * south, -x for north. The campaign is the special case "defenders are south,
 * enemies are north", which is what a unit without a `side` field means. The
 * simulation always works in absolute coordinates; nothing here mirrors a state.
 *
 * For forward = +1 every helper does exactly the arithmetic and the comparison
 * the campaign code did before, so campaign results stay bit-identical (11.6).
 */

/** +1 when forward is +x (south), -1 when forward is -x (north). */
export type ForwardDirection = 1 | -1;

/** Side of the campaign's defenders, and of everything they fire (spec 18.1). */
export const CAMPAIGN_DEFENDER_SIDE: Side = 'south';

/** Side of the campaign's enemies (spec 18.1). */
export const CAMPAIGN_ENEMY_SIDE: Side = 'north';

/** A state object that may carry its side; campaign objects carry none. */
interface MaybeSided {
  readonly side?: Side;
}

/** The forward direction of a side (spec 18.1). */
export function forwardOf(side: Side): ForwardDirection {
  return side === 'south' ? 1 : -1;
}

/** The other side. */
export function opposingSide(side: Side): Side {
  return side === 'south' ? 'north' : 'south';
}

/** Side of a defender; the campaign's defenders are south. */
export function defenderSide(defender: MaybeSided): Side {
  return defender.side ?? CAMPAIGN_DEFENDER_SIDE;
}

/** Side of a walking unit (campaign enemy, Duel raider); the campaign's enemies are north. */
export function enemySide(enemy: MaybeSided): Side {
  return enemy.side ?? CAMPAIGN_ENEMY_SIDE;
}

/** Side of a projectile or fire patch: the side of the defender that made it. */
export function attackSide(attack: MaybeSided): Side {
  return attack.side ?? CAMPAIGN_DEFENDER_SIDE;
}

/** True when `x` is strictly further forward than `otherX`. */
export function isAheadOf(x: number, otherX: number, forward: ForwardDirection): boolean {
  return forward === 1 ? x > otherX : x < otherX;
}

/** Moves `x` forward by `tiles` (backwards for a negative amount). */
export function advanceX(x: number, tiles: number, forward: ForwardDirection): number {
  return forward === 1 ? x + tiles : x - tiles;
}

/** How far `toX` lies ahead of `fromX`; negative when it lies behind. */
export function distanceAhead(fromX: number, toX: number, forward: ForwardDirection): number {
  return forward === 1 ? toX - fromX : fromX - toX;
}

/** Mirrors a world x across the middle of the grid (spec 18.1: x becomes 9 - x). */
export function mirrorX(x: number): number {
  return 2 * BASE_LINE_X + COLUMN_COUNT * TILE_SIZE - x;
}

/** World x of a side's own base line (spec 18.1: south 0.0, north 9.0). */
export function baseLineXOf(side: Side): number {
  return side === 'south' ? BASE_LINE_X : mirrorX(BASE_LINE_X);
}

/** World x past which a projectile flying forward has left the lane (spec 4.3). */
export function laneEndX(forward: ForwardDirection): number {
  return forward === 1 ? ENEMY_SPAWN_X : mirrorX(ENEMY_SPAWN_X);
}
