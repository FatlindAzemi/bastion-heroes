import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data';
import {
  BASE_LINE_X,
  COLUMN_COUNT,
  ENEMY_SPAWN_X,
  isPlaceableTerrain,
  isPlaceableTile,
  LANE_COUNT,
  TILE_SIZE,
  terrainAt,
  tileCenter,
  tileCenterX,
} from '../../src/sim/grid';
import { createTestLevel } from './testLevel';

// Spec 3.1: the grid, world coordinates and terrain of the simulation.
describe('grid helpers', () => {
  it('3.1: the grid has 5 lanes and 9 columns', () => {
    expect(LANE_COUNT).toBe(5);
    expect(COLUMN_COUNT).toBe(9);
    expect(LANE_COUNT).toBe(rules.grid.laneCount);
    expect(COLUMN_COUNT).toBe(rules.grid.columnCount);
  });

  it('3.1: one tile is one world unit wide and column c spans x=c..c+1', () => {
    expect(TILE_SIZE).toBe(1);
    expect(tileCenterX(0)).toBe(0.5);
    expect(tileCenterX(3)).toBe(3.5);
    expect(tileCenterX(8)).toBe(8.5);
  });

  it('3.1: lane l center is y=l+0.5', () => {
    expect(tileCenter(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(tileCenter(2, 5)).toEqual({ x: 5.5, y: 2.5 });
    expect(tileCenter(4, 8)).toEqual({ x: 8.5, y: 4.5 });
  });

  it('3.1: the base line is x=0 and the enemy spawn point is x=9.6', () => {
    expect(BASE_LINE_X).toBe(0);
    expect(ENEMY_SPAWN_X).toBe(9.6);
    expect(BASE_LINE_X).toBe(rules.grid.baseLineX);
    expect(ENEMY_SPAWN_X).toBe(rules.grid.enemySpawnX);
  });

  it('3.1: tiles outside the 5x9 grid are not placeable', () => {
    const level = createTestLevel();

    expect(isPlaceableTile(level, 0, 0)).toBe(true);
    expect(isPlaceableTile(level, -1, 0)).toBe(false);
    expect(isPlaceableTile(level, LANE_COUNT, 0)).toBe(false);
    expect(isPlaceableTile(level, 0, -1)).toBe(false);
    expect(isPlaceableTile(level, 0, COLUMN_COUNT)).toBe(false);
  });

  it('3.1: rock tiles are not placeable', () => {
    expect(isPlaceableTerrain('normal')).toBe(true);
    expect(isPlaceableTerrain('highGround')).toBe(true);
    expect(isPlaceableTerrain('rock')).toBe(false);
    expect(isPlaceableTerrain('lava')).toBe(false);
    // Water becomes placeable only on a platform defender (Harbor Turtle, M7, spec 5).
    expect(isPlaceableTerrain('water')).toBe(false);
  });

  it('3.1: a tile without a terrain entry is normal terrain', () => {
    const level = createTestLevel({ terrain: [{ lane: 2, col: 4, type: 'rock' }] });

    expect(terrainAt(level, 2, 4)).toBe('rock');
    expect(terrainAt(level, 2, 3)).toBe('normal');
    expect(terrainAt(level, 0, 0)).toBe('normal');
  });

  it('3.1: rock tiles and lanes not listed in activeLanes are not placeable', () => {
    const level = createTestLevel({
      activeLanes: [2],
      terrain: [{ lane: 2, col: 4, type: 'rock' }],
    });

    expect(isPlaceableTile(level, 2, 0)).toBe(true);
    expect(isPlaceableTile(level, 2, 4)).toBe(false);
    expect(isPlaceableTile(level, 0, 0)).toBe(false);
  });
});
