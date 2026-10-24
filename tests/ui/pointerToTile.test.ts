import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data/rules';
import {
  findOrbAtTap,
  resolveTap,
  worldToTile,
  type OrbPickTarget,
} from '../../src/ui/hud/pointerToTile';

const TILE = rules.grid.tileSize;

/** World x of the centre of a column (spec 3.1). */
function columnCenterX(col: number): number {
  return (col + 0.5) * TILE;
}

/** World z of the centre of a lane (spec 9.1). */
function laneCenterZ(lane: number): number {
  return (lane + 0.5) * TILE;
}

const ORBS: readonly OrbPickTarget[] = [
  { id: 7, lane: 2, x: 4.5 },
  { id: 8, lane: 0, x: 2.5 },
];

describe('HUD pointer mapping (spec 3.1, 3.3, 3.4, 3.7, 9.1)', () => {
  it('3.1: a world point maps to the 5x9 tile that contains it', () => {
    expect(worldToTile({ x: columnCenterX(0), z: laneCenterZ(4) })).toEqual({ lane: 4, col: 0 });
    expect(worldToTile({ x: TILE * 8 + 0.9 * TILE, z: 0.1 * TILE })).toEqual({ lane: 0, col: 8 });
  });

  it('9.1: points outside the grid return null', () => {
    expect(worldToTile({ x: -0.01, z: laneCenterZ(2) })).toBeNull();
    expect(worldToTile({ x: rules.grid.columnCount * TILE, z: laneCenterZ(2) })).toBeNull();
    expect(worldToTile({ x: columnCenterX(2), z: -0.01 })).toBeNull();
    expect(worldToTile({ x: columnCenterX(2), z: rules.grid.laneCount * TILE })).toBeNull();
  });

  it('3.3: the closest orb inside the tap tolerance is picked', () => {
    expect(findOrbAtTap(ORBS, { x: 4.5 * TILE + 0.2 * TILE, z: laneCenterZ(2) })).toBe(7);
    expect(findOrbAtTap(ORBS, { x: 2.6 * TILE, z: laneCenterZ(0) })).toBe(8);
  });

  it('3.3: orbs farther away than the tap tolerance are ignored', () => {
    expect(findOrbAtTap(ORBS, { x: 4.5 * TILE, z: laneCenterZ(4) })).toBeNull();
    expect(findOrbAtTap([], { x: 4.5 * TILE, z: laneCenterZ(2) })).toBeNull();
  });

  it('3.4: a selected card places on the tapped tile', () => {
    expect(resolveTap({ x: columnCenterX(3), z: laneCenterZ(1) }, ORBS, 2, false)).toEqual({
      kind: 'place',
      cardIndex: 2,
      lane: 1,
      col: 3,
    });
  });

  it('3.7: an active shovel removes the defender on the tapped tile', () => {
    expect(resolveTap({ x: columnCenterX(0), z: laneCenterZ(0) }, ORBS, null, true)).toEqual({
      kind: 'shovel',
      lane: 0,
      col: 0,
    });
  });

  it('3.3: an orb tap wins over a selected card', () => {
    expect(resolveTap({ x: 4.5 * TILE, z: laneCenterZ(2) }, ORBS, 0, false)).toEqual({
      kind: 'collectOrb',
      orbId: 7,
    });
  });

  it('3.4: tapping outside the grid cancels the selection', () => {
    expect(resolveTap({ x: -2, z: laneCenterZ(2) }, ORBS, 2, false)).toEqual({ kind: 'cancel' });
    expect(resolveTap(null, ORBS, 2, false)).toEqual({ kind: 'cancel' });
  });
});
