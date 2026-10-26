import { describe, expect, it } from 'vitest';

import { MAP_NODE_POSITIONS, mapPathD, nodePosition } from '../../src/ui/screens/levelMapLayout';

// Issue #114: the winding World 1 map path is pure geometry and must stay stable
// for the ten level medallions.

describe('nodePosition', () => {
  it('returns the matching medallion position', () => {
    expect(nodePosition(0)).toEqual({ left: 23, top: 88 });
    expect(nodePosition(9)).toEqual({ left: 60, top: 9 });
  });

  it('clamps out-of-range indices to the first and last medallion', () => {
    expect(nodePosition(-4)).toEqual(MAP_NODE_POSITIONS[0]);
    expect(nodePosition(42)).toEqual(MAP_NODE_POSITIONS[MAP_NODE_POSITIONS.length - 1]);
  });
});

describe('mapPathD', () => {
  it('starts at the first medallion and curves through every other one', () => {
    const path = mapPathD();
    expect(path.startsWith('M 23 88')).toBe(true);
    expect(path.match(/ C /g)?.length).toBe(MAP_NODE_POSITIONS.length - 1);
    expect(path).toContain(` ${MAP_NODE_POSITIONS[9]?.left} ${MAP_NODE_POSITIONS[9]?.top}`);
  });

  it('returns an empty path for an empty map', () => {
    expect(mapPathD([])).toBe('');
  });
});
