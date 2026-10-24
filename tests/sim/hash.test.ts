import { describe, expect, it } from 'vitest';

import { createSim } from '../../src/sim/createSim';
import { hashState } from '../../src/sim/hash';
import type {
  DefenderState,
  EnemyState,
  OrbState,
  ProjectileState,
  SimState,
} from '../../src/sim/types';
import { createTestLevel } from './testLevel';

const SPARKBOLT = 'sparkbolt_gremlin';

const baseDefender: DefenderState = {
  id: 1,
  defenderId: SPARKBOLT,
  lane: 0,
  col: 0,
  stars: 1,
  hp: 300,
  maxHp: 300,
  cardLevel: 1,
  activeAtTick: 15,
  nextOrbTick: null,
  nextAttackTick: 0,
};

const baseEnemy: EnemyState = {
  id: 2,
  enemyId: 'gloomling',
  lane: 0,
  x: 5,
  hp: 200,
  maxHp: 200,
  waveIndex: 0,
  blockedByDefenderId: null,
  nextBiteTick: null,
};

const baseProjectile: ProjectileState = {
  id: 3,
  kind: 'straight',
  lane: 0,
  x: 1,
  sourceId: 1,
  damage: 20,
  damageType: 'pierce',
};

const baseOrb: OrbState = {
  id: 4,
  lane: 0,
  x: 0.5,
  value: 25,
  spawnTick: 0,
  landTick: 30,
  expiresAtTick: 270,
};

/** Creates a hashable state of a level whose first wave is far away. */
function createState(): SimState {
  return createSim(
    createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
    [{ defenderId: SPARKBOLT, level: 1 }],
    10001,
  ).state as SimState;
}

/** Applies one mutation to a fresh state. */
function stateAfter(mutate: (state: SimState) => void): SimState {
  const state = createState();
  mutate(state);
  return state;
}

const baselineHash = hashState(createState());

interface MutationCase {
  readonly name: string;
  readonly mutate: (state: SimState) => void;
}

const mutationCases: MutationCase[] = [
  {
    name: 'the tick',
    mutate: (state) => {
      state.tick += 1;
    },
  },
  {
    name: 'the rng state',
    mutate: (state) => {
      state.rng.state = 42;
    },
  },
  {
    name: 'the id counter',
    mutate: (state) => {
      state.nextId += 1;
    },
  },
  {
    name: 'the Essence',
    mutate: (state) => {
      state.essence += 1;
    },
  },
  {
    name: 'the auto-collect flag',
    mutate: (state) => {
      state.autoCollect = true;
    },
  },
  {
    name: 'a card cooldown',
    mutate: (state) => {
      state.cardCooldownEndTicks[0] = 5;
    },
  },
  {
    name: 'the level status',
    mutate: (state) => {
      state.status = 'won';
    },
  },
  {
    name: 'the star rating',
    mutate: (state) => {
      state.stars = 1;
    },
  },
  {
    name: 'the defender-loss counter',
    mutate: (state) => {
      state.defendersLost = 1;
    },
  },
  {
    name: 'the seed',
    mutate: (state) => {
      (state as { seed: number }).seed = 2;
    },
  },
  {
    name: 'the level id',
    mutate: (state) => {
      (state as { levelId: string }).levelId = 'other_level';
    },
  },
  {
    name: 'the loadout',
    mutate: (state) => {
      (state.loadout[0] as { level: number }).level = 2;
    },
  },
  {
    name: 'a defender',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
    },
  },
  {
    name: 'defender hp',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.hp = 299;
    },
  },
  {
    name: 'defender maxHp',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.maxHp = 301;
    },
  },
  {
    name: 'defender stars',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.stars = 2;
    },
  },
  {
    name: 'defender lane',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.lane = 1;
    },
  },
  {
    name: 'defender column',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.col = 1;
    },
  },
  {
    name: 'the defender card level',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.cardLevel = 2;
    },
  },
  {
    name: 'the defender activation tick',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.activeAtTick = 16;
    },
  },
  {
    name: 'the producer orb timer',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.nextOrbTick = 210;
    },
  },
  {
    name: 'the attack timer',
    mutate: (state) => {
      state.defenders.push({ ...baseDefender });
      state.defenders[0]!.nextAttackTick = 42;
    },
  },
  {
    name: 'an enemy',
    mutate: (state) => {
      state.enemies.push({ ...baseEnemy });
    },
  },
  {
    name: 'enemy position',
    mutate: (state) => {
      state.enemies.push({ ...baseEnemy });
      state.enemies[0]!.x = 4.9;
    },
  },
  {
    name: 'enemy hp',
    mutate: (state) => {
      state.enemies.push({ ...baseEnemy });
      state.enemies[0]!.hp = 175;
    },
  },
  {
    name: 'the enemy wave index',
    mutate: (state) => {
      state.enemies.push({ ...baseEnemy });
      state.enemies[0]!.waveIndex = 1;
    },
  },
  {
    name: 'the enemy blocker',
    mutate: (state) => {
      state.enemies.push({ ...baseEnemy });
      state.enemies[0]!.blockedByDefenderId = 1;
    },
  },
  {
    name: 'the enemy bite timer',
    mutate: (state) => {
      state.enemies.push({ ...baseEnemy });
      state.enemies[0]!.nextBiteTick = 30;
    },
  },
  {
    name: 'a projectile',
    mutate: (state) => {
      state.projectiles.push({ ...baseProjectile });
    },
  },
  {
    name: 'the projectile position',
    mutate: (state) => {
      state.projectiles.push({ ...baseProjectile });
      state.projectiles[0]!.x = 1.2;
    },
  },
  {
    name: 'the projectile damage',
    mutate: (state) => {
      state.projectiles.push({ ...baseProjectile });
      state.projectiles[0]!.damage = 21;
    },
  },
  {
    name: 'an Essence orb',
    mutate: (state) => {
      state.orbs.push({ ...baseOrb });
    },
  },
  {
    name: 'the orb landing tick',
    mutate: (state) => {
      state.orbs.push({ ...baseOrb });
      state.orbs[0]!.landTick = 31;
    },
  },
  {
    name: 'the orb lifetime',
    mutate: (state) => {
      state.orbs.push({ ...baseOrb });
      state.orbs[0]!.expiresAtTick = 271;
    },
  },
  {
    name: 'the wave index',
    mutate: (state) => {
      state.wave.index = 0;
    },
  },
  {
    name: 'the next wave tick',
    mutate: (state) => {
      state.wave.nextWaveTick = 600;
    },
  },
  {
    name: 'the pending spawns',
    mutate: (state) => {
      state.wave.pendingSpawns.push({ enemyId: 'gloomling', lane: 0 });
    },
  },
  {
    name: 'the next spawn tick',
    mutate: (state) => {
      state.wave.nextSpawnTick = 30;
    },
  },
  {
    name: 'the early-clear tick',
    mutate: (state) => {
      state.wave.earlyClearTick = 90;
    },
  },
  {
    name: 'the all-waves-spawned flag',
    mutate: (state) => {
      state.wave.allWavesSpawned = true;
    },
  },
  {
    name: 'the banner wave index',
    mutate: (state) => {
      state.wave.bannerWaveIndex = 1;
    },
  },
  {
    name: 'the banner tick',
    mutate: (state) => {
      state.wave.bannerTick = 90;
    },
  },
  {
    name: 'a used trap',
    mutate: (state) => {
      state.traps[0]!.used = true;
    },
  },
  {
    name: 'the trap roller position',
    mutate: (state) => {
      state.traps[0]!.rollerX = -0.4;
    },
  },
];

// Spec 11.6: the replay hash must be stable and cover the whole observable state.
describe('hashState', () => {
  it('11.6: the hash is stable and has 8 lowercase hex characters', () => {
    const state = createState();
    const hash = hashState(state);

    expect(hash).toBe(hashState(state));
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('11.6: two identical simulations hash the same', () => {
    expect(hashState(createState())).toBe(hashState(createState()));
  });

  it('11.6: hashing never mutates the state', () => {
    const state = createState();
    const before = JSON.stringify(state);

    hashState(state);

    expect(JSON.stringify(state)).toBe(before);
  });

  for (const mutationCase of mutationCases) {
    it(`11.6: the hash changes when ${mutationCase.name} changes`, () => {
      expect(hashState(stateAfter(mutationCase.mutate))).not.toBe(baselineHash);
    });
  }
});
