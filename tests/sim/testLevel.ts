import { LevelDef } from '../../src/data/schemas';
import type { TerrainType } from '../../src/sim/grid';

/** One enemy group of a test wave (spec 7.1). */
export interface TestWaveSpawn {
  readonly enemy: string;
  readonly count: number;
  readonly lanes: 'random' | number[];
}

/** One test wave; omitted fields use the 7.1 defaults of the LevelDef schema. */
export interface TestWave {
  readonly flag?: 'none' | 'big' | 'final';
  readonly duration?: number;
  readonly spawnGap?: number;
  readonly spawns: TestWaveSpawn[];
}

/** Options for the minimal schema-valid LevelDef used by the sim tests. */
export interface TestLevelOptions {
  readonly activeLanes?: number[];
  readonly terrain?: { lane: number; col: number; type: TerrainType }[];
  readonly startEssence?: number;
  readonly skyDrops?: boolean;
  readonly firstWaveDelay?: number;
  readonly waves?: TestWave[];
}

/**
 * Builds a schema-valid level definition for the sim tests. The real W1-L01
 * level data arrives with issue #27 (spec 7.2); this fixture only covers what the
 * placement and wave rules need.
 */
export function createTestLevel(options: TestLevelOptions = {}): LevelDef {
  return LevelDef.parse({
    id: 'test_level',
    world: 1,
    number: 1,
    name: 'Test Level',
    activeLanes: options.activeLanes ?? [0, 1, 2, 3, 4],
    startEssence: options.startEssence ?? 150,
    skyDrops: options.skyDrops ?? true,
    terrain: options.terrain ?? [],
    loadoutSlots: 6,
    fixedLoadout: null,
    firstWaveDelay: options.firstWaveDelay ?? 20,
    waves: options.waves ?? [{ spawns: [] }],
    rewards: { gold: 0 },
    seed: 10001,
  });
}
