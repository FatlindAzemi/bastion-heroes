import { LevelDef } from '../../src/data/schemas';
import type { TerrainType } from '../../src/sim/grid';

/** Options for the minimal schema-valid LevelDef used by the sim tests. */
export interface TestLevelOptions {
  readonly activeLanes?: number[];
  readonly terrain?: { lane: number; col: number; type: TerrainType }[];
  readonly startEssence?: number;
}

/**
 * Builds a schema-valid level definition for the sim tests. The real W1-L01
 * level data arrives with issue #27 (spec 7.2); this fixture only covers what
 * the placement rules of spec 3.1, 3.4, 3.5 and 3.7 need.
 */
export function createTestLevel(options: TestLevelOptions = {}): LevelDef {
  return LevelDef.parse({
    id: 'test_level',
    world: 1,
    number: 1,
    name: 'Test Level',
    activeLanes: options.activeLanes ?? [0, 1, 2, 3, 4],
    startEssence: options.startEssence ?? 150,
    skyDrops: true,
    terrain: options.terrain ?? [],
    loadoutSlots: 6,
    fixedLoadout: null,
    firstWaveDelay: 20,
    waves: [{ spawns: [] }],
    rewards: { gold: 0 },
    seed: 10001,
  });
}
