import { describe, expect, it } from 'vitest';

import { defenderById, enemyById } from '../../src/data';
import type { DefenderDef } from '../../src/data';
import { attackWithBeam } from '../../src/sim/behaviors/beam';
import { attackWithDiagonal } from '../../src/sim/behaviors/diagonal';
import { attackWithLob } from '../../src/sim/behaviors/lob';
import { attackWithSplash } from '../../src/sim/behaviors/splash';
import { attackWithStraight } from '../../src/sim/behaviors/straight';
import { updateTrapDefender } from '../../src/sim/behaviors/trap';
import { updateEnemies } from '../../src/sim/combat/enemyActions';
import { updateProjectiles } from '../../src/sim/combat/projectiles';
import { createSim } from '../../src/sim/createSim';
import { enemyArmor } from '../../src/sim/enemies/armor';
import { spawnEnemy } from '../../src/sim/enemies/spawn';
import { ticksFromSeconds } from '../../src/sim/placement';
import type { DefenderState, EnemyState, Sim, SimEvent, SimState } from '../../src/sim/types';
import { createTestLevel } from './testLevel';

/** Builds a schema-shaped defender definition for a behaviour test. */
function makeDefenderDef(
  overrides: Partial<DefenderDef> & { id: string; pattern: DefenderDef['pattern'] },
): DefenderDef {
  return {
    name: overrides.id,
    faction: 'wildgrove',
    rarity: 'common',
    role: 'shooter',
    cost: 100,
    cooldownS: 7.5,
    startsReady: true,
    hp: 300,
    damage: 20,
    damageType: 'pierce',
    attackIntervalS: 1.4,
    range: 9,
    element: 'none',
    star3Bonus: 'none',
    milestone: 'M2',
    ...overrides,
  };
}

/** Registers a fixture def in the data registry (white-box test seam, like patterns.test.ts). */
function registerDefenderDef(def: DefenderDef): DefenderDef {
  (defenderById as Record<string, DefenderDef>)[def.id] = def;
  return def;
}

/** Creates a sim whose waves stay far away, so the tests control the enemies. */
function createHarness(): Sim {
  return createSim(
    createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
    [],
    10001,
  );
}

/** Adds a defender directly to the state (placement rules are covered by #18). */
function addDefender(sim: Sim, defenderDef: DefenderDef, lane: number, col: number): DefenderState {
  const state = sim.state as SimState;
  const defender: DefenderState = {
    id: state.nextId,
    defenderId: defenderDef.id,
    lane,
    col,
    stars: 1,
    hp: defenderDef.hp,
    maxHp: defenderDef.hp,
    cardLevel: 1,
    activeAtTick: 0,
    nextOrbTick: null,
    nextAttackTick: 0,
    trapReadyAtTick: null,
    trapRearmed: false,
    attackCount: 0,
    burstShotsRemaining: 0,
  };
  state.nextId += 1;
  state.defenders.push(defender);
  return defender;
}

/** Spawns an enemy of the real data at a position, through the product spawn helper. */
function spawnAt(sim: Sim, enemyId: string, lane: number, x: number): EnemyState {
  const enemy = spawnEnemy(sim.state as SimState, enemyId, lane, x, 0, []);
  if (enemy === undefined) {
    throw new Error(`expected enemy data for ${enemyId}`);
  }
  return enemy;
}

/** Runs the projectile phase until every projectile is gone. */
function runProjectilesToEnd(sim: Sim): SimEvent[] {
  const state = sim.state as SimState;
  const events: SimEvent[] = [];
  while (state.projectiles.length > 0) {
    state.tick += 1;
    updateProjectiles(state, events);
  }
  return events;
}

/** Fires one straight projectile at an enemy and returns the hit events. */
function hitWithSparkbolt(sim: Sim, lane: number): SimEvent[] {
  const sparkbolt = defenderById['sparkbolt_gremlin'];
  if (sparkbolt === undefined) {
    throw new Error('expected the sparkbolt data');
  }
  const defender = addDefender(sim, sparkbolt, lane, 0);
  const events: SimEvent[] = [];
  attackWithStraight(sim.state as SimState, defender, sparkbolt, events);
  return [...events, ...runProjectilesToEnd(sim)];
}

/** Sets the tick and runs the enemy phase once. */
function runEnemyPhaseAt(sim: Sim, tick: number): SimEvent[] {
  const state = sim.state as SimState;
  state.tick = tick;
  const events: SimEvent[] = [];
  updateEnemies(state, events);
  return events;
}

// Spec 6.2: pothead, shieldbearer, shade_wisp, bat_swarm.
describe('M2 enemy behaviors (spec 6.2)', () => {
  it('6.2: pothead is Armored, then Light once its health reaches 200', () => {
    const pothead = enemyById['pothead'];
    if (pothead === undefined) {
      throw new Error('expected the pothead data');
    }
    const sim = createHarness();
    const enemy = spawnAt(sim, 'pothead', 0, 3);
    expect(enemyArmor(enemy, pothead)).toBe('armored');

    enemy.hp = 200;
    expect(enemyArmor(enemy, pothead)).toBe('light');

    enemy.hp = 201;
    expect(enemyArmor(enemy, pothead)).toBe('armored');
  });

  it('6.2/4.1: pothead takes Pierce hits at 0.5 armor, then at 1.25 after the pot falls off', () => {
    const sim = createHarness();
    const enemy = spawnAt(sim, 'pothead', 0, 3);
    enemy.hp = 300;
    hitWithSparkbolt(sim, 0);
    expect(enemy.hp).toBe(300 - 10); // 20 Pierce × 0.5 vs Armored

    enemy.hp = 200;
    hitWithSparkbolt(sim, 0);
    expect(enemy.hp).toBe(200 - 25); // 20 Pierce × 1.25 vs Light
  });

  it('6.2: pothead sets armorBroken once it is at or below 200 hp (renderer model swap)', () => {
    const sim = createHarness();
    const enemy = spawnAt(sim, 'pothead', 0, 3);
    runEnemyPhaseAt(sim, 0);
    expect(enemy.armorBroken).toBe(false);

    enemy.hp = 200;
    runEnemyPhaseAt(sim, 1);
    expect(enemy.armorBroken).toBe(true);
  });

  it('6.2: a straight projectile hits the Shieldbearer shield first, not the body', () => {
    const sim = createHarness();
    const enemy = spawnAt(sim, 'shieldbearer', 0, 3);
    expect(enemy.shieldHp).toBe(600);

    hitWithSparkbolt(sim, 0);

    expect(enemy.shieldHp).toBe(600 - 10); // 20 Pierce × 0.5 vs the Armored shield
    expect(enemy.hp).toBe(300);
  });

  it('6.2: a diagonal projectile also hits the shield first', () => {
    const diagonal = registerDefenderDef(
      makeDefenderDef({ id: 'test_diagonal_shield', pattern: 'diagonal', damage: 20 }),
    );
    const sim = createHarness();
    const enemy = spawnAt(sim, 'shieldbearer', 1, 3);
    const defender = addDefender(sim, diagonal, 1, 0);
    const events: SimEvent[] = [];

    attackWithDiagonal(sim.state as SimState, defender, diagonal, events);
    runProjectilesToEnd(sim);

    expect(enemy.shieldHp).toBe(600 - 10);
    expect(enemy.hp).toBe(300);
  });

  it('6.2: when the shield breaks the body continues and takes Light-armor damage (overflow is lost)', () => {
    const sim = createHarness();
    const enemy = spawnAt(sim, 'shieldbearer', 0, 3);
    enemy.shieldHp = 5;

    hitWithSparkbolt(sim, 0);
    expect(enemy.shieldHp).toBe(0);
    expect(enemy.hp).toBe(300); // the 10-point hit breaks a 5-point shield, overflow is lost

    hitWithSparkbolt(sim, 0);
    expect(enemy.hp).toBe(300 - 25); // 20 Pierce × 1.25 vs the Light body
  });

  it('6.2: a piercing shot is stopped by the shield instead of passing through', () => {
    const sparkbolt = defenderById['sparkbolt_gremlin'];
    if (sparkbolt === undefined) {
      throw new Error('expected the sparkbolt data');
    }
    const sim = createHarness();
    const state = sim.state as SimState;
    const enemy = spawnAt(sim, 'shieldbearer', 0, 3);
    const defender = addDefender(sim, sparkbolt, 0, 0);
    state.projectiles.push({
      id: state.nextId,
      kind: 'straight',
      lane: 0,
      x: 0.5,
      originX: 0.5,
      sourceId: defender.id,
      damage: 20,
      damageType: 'pierce',
      hitsFlying: false,
      targetId: null,
      landTick: null,
      splashRadius: null,
      targetLane: null,
      switchAtX: null,
      statusKind: null,
      statusDurationS: 0,
      statusStacks: 1,
      element: 'none',
      piercesRemaining: 1,
      firePatch: null,
    });
    state.nextId += 1;

    runProjectilesToEnd(sim);

    expect(state.projectiles).toEqual([]);
    expect(enemy.shieldHp).toBe(600 - 10);
    expect(enemy.hp).toBe(300);
  });

  it('6.2: lob, splash and beam hit the Shieldbearer body directly, leaving the shield full', () => {
    const lob = registerDefenderDef(
      makeDefenderDef({
        id: 'test_lob_shield',
        pattern: 'lob',
        damage: 40,
        damageType: 'blast',
        attackIntervalS: 2,
        range: 6,
      }),
    );
    const splash = registerDefenderDef(
      makeDefenderDef({
        id: 'test_splash_shield',
        pattern: 'splash',
        damage: 40,
        damageType: 'blast',
        attackIntervalS: 2.8,
        splashRadius: 0.8,
      }),
    );
    const beam = registerDefenderDef(
      makeDefenderDef({
        id: 'test_beam_shield',
        pattern: 'beam',
        damage: 40,
        damageType: 'arcane',
        attackIntervalS: 2,
        range: 9,
      }),
    );

    for (const [defenderDef, damage] of [
      [lob, 40],
      [splash, 40],
      [beam, 30],
    ] as const) {
      const sim = createHarness();
      const enemy = spawnAt(sim, 'shieldbearer', 2, 5);
      const defender = addDefender(sim, defenderDef, 2, 0);
      const events: SimEvent[] = [];
      if (defenderDef.pattern === 'beam') {
        attackWithBeam(sim.state as SimState, defender, defenderDef, events);
      } else if (defenderDef.pattern === 'splash') {
        attackWithSplash(sim.state as SimState, defender, defenderDef, events);
        runProjectilesToEnd(sim);
      } else {
        attackWithLob(sim.state as SimState, defender, defenderDef, events);
        runProjectilesToEnd(sim);
      }

      expect(enemy.shieldHp).toBe(600);
      expect(enemy.hp).toBe(300 - damage);
    }
  });

  it('6.2: a trap hits the Shieldbearer body directly and ignores the shield', () => {
    const snaptrap = registerDefenderDef(
      makeDefenderDef({
        id: 'test_trap_shield',
        pattern: 'trap',
        damage: 1800,
        damageType: 'blast',
        attackIntervalS: undefined,
        range: undefined,
        armDelayS: 12,
        rearmS: 20,
      }),
    );
    const sim = createHarness();
    const state = sim.state as SimState;
    const enemy = spawnAt(sim, 'shieldbearer', 2, 2.5);
    const defender = addDefender(sim, snaptrap, 2, 2);
    defender.trapReadyAtTick = 0;

    const events: SimEvent[] = [];
    updateTrapDefender(state, defender, snaptrap, events);

    expect(enemy.shieldHp).toBe(600);
    expect(enemy.hp).toBeLessThan(0);
  });

  it('6.2/4.1: shade_wisp has Spectral armor and is not flying', () => {
    const wisp = enemyById['shade_wisp'];
    if (wisp === undefined) {
      throw new Error('expected the shade wisp data');
    }
    const sim = createHarness();
    const enemy = spawnAt(sim, 'shade_wisp', 0, 3);
    expect(enemyArmor(enemy, wisp)).toBe('spectral');

    hitWithSparkbolt(sim, 0);
    expect(enemy.hp).toBe(300 - 20); // Pierce is neutral (1.0) vs Spectral
  });

  it('6.2: bat_swarm flies, so ground straight shots cannot hit it', () => {
    const sim = createHarness();
    const enemy = spawnAt(sim, 'bat_swarm', 0, 3);

    hitWithSparkbolt(sim, 0);

    expect(enemy.hp).toBe(120);
  });

  it('6.2: a hitsFlying shot does hit bat_swarm', () => {
    const antiAir = registerDefenderDef(
      makeDefenderDef({ id: 'test_anti_air', pattern: 'straight', hitsFlying: true }),
    );
    const sim = createHarness();
    const state = sim.state as SimState;
    const enemy = spawnAt(sim, 'bat_swarm', 0, 3);
    const defender = addDefender(sim, antiAir, 0, 0);
    const events: SimEvent[] = [];

    attackWithStraight(state, defender, antiAir, events);
    runProjectilesToEnd(sim);

    expect(enemy.hp).toBe(120 - 25); // 20 Pierce × 1.25 vs Light
  });

  it('6.2: bat_swarm flies over walls and does not attack them', () => {
    const granny = defenderById['iron_granny'];
    if (granny === undefined) {
      throw new Error('expected the iron granny data');
    }
    const sim = createHarness();
    const bat = spawnAt(sim, 'bat_swarm', 0, 0.8);
    const wall = addDefender(sim, granny, 0, 0);

    runEnemyPhaseAt(sim, 0);

    expect(bat.blockedByDefenderId).toBeNull();
    expect(wall.hp).toBe(granny.hp);
    expect(bat.x).toBeLessThan(0.8);
  });

  it('3.9/6.2: the Last Stand Trap does hit flying enemies', () => {
    const sim = createHarness();
    spawnAt(sim, 'bat_swarm', 0, 0.2);

    const events: SimEvent[] = [];
    for (let tick = 0; tick < 120; tick += 1) {
      events.push(...sim.step());
    }

    expect(sim.state.traps[0]?.used).toBe(true);
    expect(events.some((event) => event.type === 'enemyDied')).toBe(true);
    expect(sim.state.enemies).toEqual([]);
  });
});

// Spec 6.2: the Gloom Priest heal pulse.
describe('Gloom Priest (spec 6.2)', () => {
  const HEAL_INTERVAL_TICKS = 90;

  it('6.2: heals every enemy within 1.5 tiles for 60 every 3 s, never itself', () => {
    const sim = createHarness();
    const priest = spawnAt(sim, 'gloom_priest', 2, 5);
    const near = spawnAt(sim, 'gloomling', 2, 6);
    const adjacentLane = spawnAt(sim, 'gloomling', 3, 5.5);
    const far = spawnAt(sim, 'gloomling', 4, 8);
    priest.hp = 300;
    near.hp = 100;
    adjacentLane.hp = 100;
    far.hp = 100;

    runEnemyPhaseAt(sim, HEAL_INTERVAL_TICKS - 1);
    expect(near.hp).toBe(100); // no pulse before the 3 s interval

    runEnemyPhaseAt(sim, HEAL_INTERVAL_TICKS);
    expect(near.hp).toBe(160);
    expect(adjacentLane.hp).toBe(160);
    expect(far.hp).toBe(100);
    expect(priest.hp).toBe(300);
    expect(priest.nextHealTick).toBe(2 * HEAL_INTERVAL_TICKS);
  });

  it('6.2: a heal never raises an enemy above its maxHp', () => {
    const sim = createHarness();
    spawnAt(sim, 'gloom_priest', 2, 5);
    const near = spawnAt(sim, 'gloomling', 2, 6);
    near.hp = near.maxHp - 10;

    runEnemyPhaseAt(sim, HEAL_INTERVAL_TICKS);

    expect(near.hp).toBe(near.maxHp);
  });

  it('6.2: the heal pulse repeats every 3 s', () => {
    const sim = createHarness();
    spawnAt(sim, 'gloom_priest', 2, 5);
    const near = spawnAt(sim, 'gloomling', 2, 6);
    near.hp = 50;

    runEnemyPhaseAt(sim, HEAL_INTERVAL_TICKS);
    runEnemyPhaseAt(sim, 2 * HEAL_INTERVAL_TICKS);

    expect(near.hp).toBe(170);
  });
});

// Spec 6.2: the Gloom Ogre smash and its one-time Gloomling throw.
describe('Gloom Ogre (spec 6.2)', () => {
  it('6.2: smashes a blocking defender for 200 every 1.0 s', () => {
    const granny = defenderById['iron_granny'];
    if (granny === undefined) {
      throw new Error('expected the iron granny data');
    }
    const sim = createHarness();
    const ogre = spawnAt(sim, 'gloom_ogre', 0, 0.6);
    const wall = addDefender(sim, granny, 0, 0);

    runEnemyPhaseAt(sim, 0);
    expect(wall.hp).toBe(granny.hp - 200);
    expect(ogre.nextBiteTick).toBe(ticksFromSeconds(1));

    runEnemyPhaseAt(sim, ticksFromSeconds(1) - 1);
    expect(wall.hp).toBe(granny.hp - 200);

    runEnemyPhaseAt(sim, ticksFromSeconds(1));
    expect(wall.hp).toBe(granny.hp - 400);
  });

  it('6.2: at 50 % health it throws one Gloomling 3 tiles forward, behind the first defender', () => {
    const granny = defenderById['iron_granny'];
    if (granny === undefined) {
      throw new Error('expected the iron granny data');
    }
    const sim = createHarness();
    const state = sim.state as SimState;
    addDefender(sim, granny, 0, 2);
    const ogre = spawnAt(sim, 'gloom_ogre', 0, 3.05);
    ogre.hp = 901;

    runEnemyPhaseAt(sim, 0);
    expect(ogre.hasThrown).toBe(false);
    expect(state.enemies.filter((enemy) => enemy.enemyId === 'gloomling')).toHaveLength(0);

    ogre.hp = 900;
    const events = runEnemyPhaseAt(sim, 1);

    expect(ogre.hasThrown).toBe(true);
    const thrown = state.enemies.filter((enemy) => enemy.enemyId === 'gloomling');
    expect(thrown).toHaveLength(1);
    expect(thrown[0]?.x).toBeCloseTo(3.05 - 3);
    expect(thrown[0]?.x).toBeLessThan(2.5); // behind the first defender's tile centre
    expect(thrown[0]?.waveIndex).toBe(ogre.waveIndex);
    expect(events.filter((event) => event.type === 'enemySpawned')).toHaveLength(1);

    ogre.hp = 500;
    runEnemyPhaseAt(sim, 2);
    expect(state.enemies.filter((enemy) => enemy.enemyId === 'gloomling')).toHaveLength(1);
  });
});
