import {
  BoxGeometry,
  type BufferGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { rules } from '../data/rules';
import { GREYBOX_COLORS } from './greyboxPalette';
import { createToonMaterial } from './toonMaterial';
import { columnToWorldX, laneToWorldZ } from './worldMapping';

/** Grid size from the rules data (spec 3.1: 5 lanes x 9 columns, 1 tile = 1 unit). */
const LANE_COUNT = rules.grid.laneCount;
const COLUMN_COUNT = rules.grid.columnCount;
const TILE_SIZE = rules.grid.tileSize;

/** World position of the grid centre, used by the base and portal markers. */
const GRID_CENTER_X = (COLUMN_COUNT * TILE_SIZE) / 2;
const GRID_CENTER_Z = (LANE_COUNT * TILE_SIZE) / 2;

/** Ground plane size: large enough to fill the camera view around the grid (spec 9.1). */
const GROUND_WIDTH = 24;
const GROUND_DEPTH = 18;

/** Dirt frame width around the playfield, in tiles (greybox art, spec 9.4). */
const LAWN_BORDER_WIDTH = 0.5;

/** Height of the rock blocks that mark blocked tiles, in tiles (greybox art). */
const ROCK_HEIGHT = 0.4;

/** One terrain tile of the level definition (spec 7.1). */
export interface TerrainTile {
  readonly lane: number;
  readonly col: number;
  readonly type: string;
}

/** The part of the level definition the greybox renderer needs (spec 7.1; a `LevelDef` fits). */
export interface LevelViewOptions {
  readonly activeLanes: readonly number[];
  readonly terrain?: readonly TerrainTile[];
}

/** The static greybox environment: ground, tile grid and base/portal markers. */
export interface Grid {
  readonly group: Group;
  dispose(): void;
}

/** Appends a translated box to a merge list. */
function pushBox(
  parts: BufferGeometry[],
  size: [number, number, number],
  position: [number, number, number],
): void {
  const geometry = new BoxGeometry(size[0], size[1], size[2]);
  geometry.translate(position[0], position[1], position[2]);
  parts.push(geometry);
}

/** Appends a flat ground-plane quad to a merge list. */
function pushGroundPlane(
  parts: BufferGeometry[],
  width: number,
  depth: number,
  x: number,
  z: number,
  y: number,
): void {
  const plane = new PlaneGeometry(width, depth);
  plane.rotateX(-Math.PI / 2);
  plane.translate(x, y, z);
  parts.push(plane);
}

/** Merges geometries, failing loudly instead of drawing nothing (same guard as the title scene). */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  if (geometry === null) {
    throw new Error('Greybox grid: geometry merge failed');
  }
  return geometry;
}

/** Adds one merged mesh unless the list is empty. */
function addMergedMesh(group: Group, parts: BufferGeometry[], color: number): void {
  if (parts.length === 0) {
    return;
  }
  group.add(new Mesh(merge(parts), createToonMaterial(color)));
}

/** Key of a tile in the rock-tile set. */
function tileKey(lane: number, col: number): string {
  return `${lane}:${col}`;
}

/**
 * Collects the blocked tiles: every tile of an inactive lane is a rock (spec 7.1) and
 * terrain tiles of type `rock` are rocks too. The other terrain types arrive with their
 * worlds in M7, so they render as normal grass for now.
 */
function collectRockTiles(options: LevelViewOptions): ReadonlySet<string> {
  const activeLanes = new Set(options.activeLanes);
  const rockTiles = new Set<string>();
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    if (activeLanes.has(lane)) {
      continue;
    }
    for (let col = 0; col < COLUMN_COUNT; col += 1) {
      rockTiles.add(tileKey(lane, col));
    }
  }
  for (const tile of options.terrain ?? []) {
    if (tile.type === 'rock') {
      rockTiles.add(tileKey(tile.lane, tile.col));
    }
  }
  return rockTiles;
}

/** Adds one rock block with a dark cross on top, marking a blocked tile (spec 3.1, 7.1). */
function addRockBlock(
  blocks: BufferGeometry[],
  crosses: BufferGeometry[],
  x: number,
  z: number,
): void {
  const baseY = 0.02;
  pushBox(
    blocks,
    [TILE_SIZE * 0.96, ROCK_HEIGHT, TILE_SIZE * 0.96],
    [x, baseY + ROCK_HEIGHT / 2, z],
  );
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new BoxGeometry(TILE_SIZE * 0.7, 0.03, TILE_SIZE * 0.12);
    bar.rotateY(angle);
    bar.translate(x, baseY + ROCK_HEIGHT + 0.02, z);
    crosses.push(bar);
  }
}

/** The greybox rock geometries of every blocked tile (spec 7.1: inactive lanes and `rock` terrain). */
export interface RockTileGeometries {
  readonly blocks: BufferGeometry[];
  readonly crosses: BufferGeometry[];
}

/**
 * Builds the rock block and cross geometries of every blocked tile. The level
 * scene overlays them on the environment (issue #73), so the very same blocked
 * tiles read the same in the greybox fallback and in the final environment.
 */
export function rockTileGeometries(options: LevelViewOptions): RockTileGeometries {
  const rockTiles = collectRockTiles(options);
  const blocks: BufferGeometry[] = [];
  const crosses: BufferGeometry[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    for (let col = 0; col < COLUMN_COUNT; col += 1) {
      if (rockTiles.has(tileKey(lane, col))) {
        addRockBlock(blocks, crosses, columnToWorldX(col), laneToWorldZ(lane));
      }
    }
  }
  return { blocks, crosses };
}

/** Checkerboard grass tiles of spec 9.4, with rock blocks for blocked tiles. */
function addTiles(group: Group, options: LevelViewOptions): void {
  const rockTiles = collectRockTiles(options);
  const lightTiles: BufferGeometry[] = [];
  const darkTiles: BufferGeometry[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    for (let col = 0; col < COLUMN_COUNT; col += 1) {
      if (rockTiles.has(tileKey(lane, col))) {
        continue;
      }
      const tiles = (lane + col) % 2 === 0 ? lightTiles : darkTiles;
      pushGroundPlane(tiles, TILE_SIZE, TILE_SIZE, columnToWorldX(col), laneToWorldZ(lane), 0.02);
    }
  }
  const rocks = rockTileGeometries(options);
  addMergedMesh(group, lightTiles, GREYBOX_COLORS.grassLight);
  addMergedMesh(group, darkTiles, GREYBOX_COLORS.grassDark);
  addMergedMesh(group, rocks.blocks, GREYBOX_COLORS.stoneDark);
  addMergedMesh(group, rocks.crosses, GREYBOX_COLORS.gloom);
}

/** Bold horizontal strips between the lanes, so the five rows read at a glance (spec 9.1). */
function addLaneDividers(group: Group): void {
  const parts: BufferGeometry[] = [];
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    pushGroundPlane(parts, COLUMN_COUNT * TILE_SIZE, 0.14, GRID_CENTER_X, lane * TILE_SIZE, 0.035);
  }
  addMergedMesh(group, parts, GREYBOX_COLORS.gloom);
}

/** Stone base apron at x < 0, its bright base line at x = 0 and the trap pads (spec 3.1, 3.9). */
function addBaseMarker(group: Group, options: LevelViewOptions): void {
  const platform: BufferGeometry[] = [];
  pushBox(
    platform,
    [1.6, 0.16, LANE_COUNT * TILE_SIZE],
    [rules.grid.baseLineX - 0.8, 0.08, GRID_CENTER_Z],
  );
  addMergedMesh(group, platform, GREYBOX_COLORS.stone);

  const baseLine: BufferGeometry[] = [];
  pushBox(
    baseLine,
    [0.08, 0.02, LANE_COUNT * TILE_SIZE],
    [rules.grid.baseLineX, 0.17, GRID_CENTER_Z],
  );
  addMergedMesh(group, baseLine, GREYBOX_COLORS.bone);

  const trapPads: BufferGeometry[] = [];
  for (const lane of options.activeLanes) {
    pushBox(trapPads, [0.32, 0.14, 0.5], [rules.trap.trapStartX, 0.23, laneToWorldZ(lane)]);
  }
  addMergedMesh(group, trapPads, GREYBOX_COLORS.wood);
}

/** Dusk-purple portal marker at the enemy spawn point, where enemies enter (spec 3.1, 9.4). */
function addPortalMarker(group: Group): void {
  const portalX = rules.grid.enemySpawnX + 0.4;
  const strips: BufferGeometry[] = [];
  pushGroundPlane(
    strips,
    0.9,
    LANE_COUNT * TILE_SIZE,
    rules.grid.enemySpawnX,
    GRID_CENTER_Z,
    0.025,
  );
  addMergedMesh(group, strips, GREYBOX_COLORS.gloomPurple);

  const pillars: BufferGeometry[] = [];
  for (const z of [-0.12, LANE_COUNT * TILE_SIZE + 0.12]) {
    pushBox(pillars, [0.28, 2.8, 0.28], [portalX, 1.4, z]);
  }
  addMergedMesh(group, pillars, GREYBOX_COLORS.gloomPurple);

  const plane = new PlaneGeometry(LANE_COUNT * TILE_SIZE, 2.2);
  plane.rotateY(Math.PI / 2);
  const portal = new Mesh(
    plane,
    new MeshBasicMaterial({
      color: GREYBOX_COLORS.violet,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
    }),
  );
  portal.position.set(portalX, 1.1, GRID_CENTER_Z);
  group.add(portal);
}

/** Dark neutral void around the lawn, so the playfield reads clearly (spec 9.4 Gloom shadow). */
function addGround(group: Group): void {
  const parts: BufferGeometry[] = [];
  pushGroundPlane(parts, GROUND_WIDTH, GROUND_DEPTH, GRID_CENTER_X, GRID_CENTER_Z, 0);
  addMergedMesh(group, parts, GREYBOX_COLORS.gloom);
}

/** Dirt frame around the 5 x 9 playfield, so the field boundary is unmistakable (spec 9.4). */
function addLawnBorder(group: Group): void {
  const width = COLUMN_COUNT * TILE_SIZE;
  const depth = LANE_COUNT * TILE_SIZE;
  const parts: BufferGeometry[] = [];
  pushGroundPlane(
    parts,
    width + LAWN_BORDER_WIDTH * 2,
    LAWN_BORDER_WIDTH,
    GRID_CENTER_X,
    -LAWN_BORDER_WIDTH / 2,
    0.015,
  );
  pushGroundPlane(
    parts,
    width + LAWN_BORDER_WIDTH * 2,
    LAWN_BORDER_WIDTH,
    GRID_CENTER_X,
    depth + LAWN_BORDER_WIDTH / 2,
    0.015,
  );
  pushGroundPlane(parts, LAWN_BORDER_WIDTH, depth, -LAWN_BORDER_WIDTH / 2, GRID_CENTER_Z, 0.015);
  pushGroundPlane(
    parts,
    LAWN_BORDER_WIDTH,
    depth,
    width + LAWN_BORDER_WIDTH / 2,
    GRID_CENTER_Z,
    0.015,
  );
  addMergedMesh(group, parts, GREYBOX_COLORS.dirt);
}

/** Disposes the geometry and material of one mesh. */
function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }
  material.dispose();
}

/** Frees every geometry and material of the grid group. */
function disposeGroup(group: Group): void {
  group.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    object.geometry.dispose();
    disposeMaterial(object.material);
  });
  group.clear();
}

/**
 * Builds the greybox level floor of spec 9.1/9.4: 5 x 9 checkerboard tiles (1 tile = 1
 * unit), rock blocks for blocked tiles, lane dividers and base/portal markers.
 */
export function createGrid(options: LevelViewOptions): Grid {
  const group = new Group();
  addGround(group);
  addLawnBorder(group);
  addTiles(group, options);
  addLaneDividers(group);
  addBaseMarker(group, options);
  addPortalMarker(group);
  return { group, dispose: (): void => disposeGroup(group) };
}
