import { rules } from '../data';
import type { LevelDef } from '../data';

/**
 * Grid helpers (spec 3.1). The grid is 5 lanes x 9 columns of tiles that are one
 * world unit wide; all numbers come from `src/data/rules.ts`, never from here.
 */

/** Terrain types a tile can have (spec 3.1). */
export type TerrainType = LevelDef['terrain'][number]['type'];

/** Number of lanes, index 0 = top (spec 3.1). */
export const LANE_COUNT = rules.grid.laneCount;

/** Number of columns, index 0 = left next to the base (spec 3.1). */
export const COLUMN_COUNT = rules.grid.columnCount;

/** One tile is this many world units wide (spec 3.1). */
export const TILE_SIZE = rules.grid.tileSize;

/** The base line is at this world x (spec 3.1). */
export const BASE_LINE_X = rules.grid.baseLineX;

/** Enemies spawn at this world x, just right of the grid (spec 3.1). */
export const ENEMY_SPAWN_X = rules.grid.enemySpawnX;

/** Terrain of a tile that the level does not override (spec 3.1). */
const DEFAULT_TERRAIN: TerrainType = 'normal';

/** A position in simulation world units (spec 3.1). */
export interface WorldPosition {
  /** Along the lane; column c spans x = c .. c + 1. */
  x: number;
  /** Across the lanes; lane l center is y = l + 0.5. */
  y: number;
}

/** True when the lane index is inside the grid (spec 3.1). */
export function isValidLane(lane: number): boolean {
  return Number.isInteger(lane) && lane >= 0 && lane < LANE_COUNT;
}

/** True when the column index is inside the grid (spec 3.1). */
export function isValidColumn(col: number): boolean {
  return Number.isInteger(col) && col >= 0 && col < COLUMN_COUNT;
}

/** True when the tile is inside the 5 x 9 grid (spec 3.1). */
export function isInBounds(lane: number, col: number): boolean {
  return isValidLane(lane) && isValidColumn(col);
}

/** World x of the center of column c (spec 3.1: column c spans x = c .. c + 1). */
export function tileCenterX(col: number): number {
  return col * TILE_SIZE + TILE_SIZE / 2;
}

/** World center of a tile (spec 3.1: lane l center is y = l + 0.5). */
export function tileCenter(lane: number, col: number): WorldPosition {
  return { x: tileCenterX(col), y: lane * TILE_SIZE + TILE_SIZE / 2 };
}

/** True when the lane is active in this level; the other lanes are rocks and unused (spec 3.1, 7.1). */
export function isActiveLane(level: LevelDef, lane: number): boolean {
  return level.activeLanes.includes(lane);
}

/** Terrain of a tile: the level's override or normal when there is none (spec 3.1, 7.1). */
export function terrainAt(level: LevelDef, lane: number, col: number): TerrainType {
  const tile = level.terrain.find(
    (terrainTile) => terrainTile.lane === lane && terrainTile.col === col,
  );
  return tile?.type ?? DEFAULT_TERRAIN;
}

/**
 * True when a defender may be placed on this terrain (spec 3.4): normal and
 * highGround always, rock and lava never. Water becomes placeable only on a
 * platform defender, which arrives with the Harbor Turtle in M7 (spec 5).
 */
export function isPlaceableTerrain(terrain: TerrainType): boolean {
  return terrain === 'normal' || terrain === 'highGround';
}

/** True when a defender may be placed on the tile (spec 3.1, 3.4). */
export function isPlaceableTile(level: LevelDef, lane: number, col: number): boolean {
  return (
    isInBounds(lane, col) &&
    isActiveLane(level, lane) &&
    isPlaceableTerrain(terrainAt(level, lane, col))
  );
}
