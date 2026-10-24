import { rules } from '../../data/rules';

/** A tile of the 5 x 9 grid (spec 3.1). */
export interface TilePoint {
  readonly lane: number;
  readonly col: number;
}

/** A point on the ground plane in world units (spec 9.1). */
export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/** An orb the HUD can pick (spec 3.3). */
export interface OrbPickTarget {
  readonly id: number;
  readonly lane: number;
  readonly x: number;
}

/** What a tap on the field should do (spec 3.3, 3.4, 3.7). */
export type TapCommand =
  | { readonly kind: 'collectOrb'; readonly orbId: number }
  | {
      readonly kind: 'place';
      readonly cardIndex: number;
      readonly lane: number;
      readonly col: number;
    }
  | { readonly kind: 'shovel'; readonly lane: number; readonly col: number }
  | { readonly kind: 'cancel' };

/** Touch tolerance around an orb centre, in tiles (input hit area, not a game rule). */
const ORB_TAP_RADIUS_TILES = 0.6;

/**
 * Converts a world point on the ground plane into a grid tile (spec 3.1, 9.1).
 * Returns null when the point is outside the 5 x 9 grid.
 */
export function worldToTile(world: WorldPoint): TilePoint | null {
  const col = Math.floor(world.x / rules.grid.tileSize);
  const lane = Math.floor(world.z / rules.grid.tileSize);
  if (col < 0 || col >= rules.grid.columnCount || lane < 0 || lane >= rules.grid.laneCount) {
    return null;
  }
  return { lane, col };
}

/** Returns the id of the closest orb under the tap, or null when none is close enough (spec 3.3). */
export function findOrbAtTap(orbs: readonly OrbPickTarget[], world: WorldPoint): number | null {
  const tileSize = rules.grid.tileSize;
  let closestId: number | null = null;
  let closestDistance = ORB_TAP_RADIUS_TILES;
  for (const orb of orbs) {
    const dx = world.x / tileSize - orb.x;
    const dz = world.z / tileSize - (orb.lane + 0.5);
    const distance = Math.hypot(dx, dz);
    if (distance <= closestDistance) {
      closestDistance = distance;
      closestId = orb.id;
    }
  }
  return closestId;
}

/**
 * Resolves one tap on the field into a HUD command (spec 3.4, 3.7):
 * an orb tap collects, an active shovel removes, a selected card places, and a tap
 * outside the grid cancels the current selection.
 */
export function resolveTap(
  world: WorldPoint | null,
  orbs: readonly OrbPickTarget[],
  selectedCardIndex: number | null,
  shovelActive: boolean,
): TapCommand {
  if (world === null) {
    return { kind: 'cancel' };
  }
  const orbId = findOrbAtTap(orbs, world);
  if (orbId !== null) {
    return { kind: 'collectOrb', orbId };
  }
  const tile = worldToTile(world);
  if (tile === null) {
    return { kind: 'cancel' };
  }
  if (shovelActive) {
    return { kind: 'shovel', lane: tile.lane, col: tile.col };
  }
  if (selectedCardIndex !== null) {
    return { kind: 'place', cardIndex: selectedCardIndex, lane: tile.lane, col: tile.col };
  }
  return { kind: 'cancel' };
}
