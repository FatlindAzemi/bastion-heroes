import { describe, expect, it } from 'vitest';

import { defenderById, enemyById, rules } from '../../src/data';
import type { DefenderDef, EnemyDef, LevelDef } from '../../src/data';
import { attackWithBeam } from '../../src/sim/behaviors/beam';
import { attackWithLob } from '../../src/sim/behaviors/lob';
import { attackWithStraight } from '../../src/sim/behaviors/straight';
import { updateEnemies } from '../../src/sim/combat/enemyActions';
import { updateProjectiles } from '../../src/sim/combat/projectiles';
import {
  applyStatus,
  findStatus,
  hasStatus,
  updateStatusEffects,
} from '../../src/sim/combat/status';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import type { DefenderState, EnemyState, Sim, SimEvent, SimState } from '../../src/sim/types';
import { createTestLevel, type TestLevelOptions } from './testLevel';

const GLOOMLING = 'gloomling';

interface Harness {
  readonly sim: Sim;
  readonly level: LevelDef;
  readonly state: SimState;
}

/** Creates a sim whose waves stay far away, so the status tests control the state. */
function createHarness(options: TestLevelOptions = {}): Harness {
  const level = createTestLevel({
    skyDrops: false,
    firstWaveDelay: 600,
    waves: [{ spawns: [] }],
    ...options,
  });
  const sim = createSim(level, [], 10001);
  return { sim, level, state: sim.state as SimState };
}

/** Registers a fixture enemy def (white-box test seam; ids are unique per test). */
function registerEnemyDef(def: EnemyDef): EnemyDef {
  (enemyById as Record<string, EnemyDef>)[def.id] = def;
  return def;
}

/** Registers a fixture defender def (white-box test seam; ids are unique per test). */
function registerDefenderDef(def: DefenderDef): DefenderDef {
  (defenderById as Record<string, DefenderDef>)[def.id] = def;
  return def;
}

/** Adds an enemy directly to the state (wave spawning is covered by #20). */
function addEnemy(
  state: SimState,
  lane: number,
  x: number,
  hp = 200,
  enemyId = GLOOMLING,
): EnemyState {
  const enemy: EnemyState = {
    id: state.nextId,
    enemyId,
    lane,
    x,
    hp,
    maxHp: hp,
    waveIndex: 0,
    blockedByDefenderId: null,
    nextBiteTick: null,
    statuses: [],
    comboCooldowns: { steam: 0, shatter: 0, toxic: 0, chain: 0 },
    shieldHp: 0,
    armorBroken: false,
    nextHealTick: null,
    hasThrown: false,
  };
  state.nextId += 1;
  state.enemies.push(enemy);
  return enemy;
}

/** Adds a defender directly to the state (placement rules are covered by #18). */
function addDefender(
  state: SimState,
  defenderDef: DefenderDef,
  lane: number,
  col: number,
  stars: 1 | 2 | 3 = 1,
): DefenderState {
  const defender: DefenderState = {
    id: state.nextId,
    defenderId: defenderDef.id,
    lane,
    col,
    stars,
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

/** Runs the status phase and the enemy phase for every tick in [fromTick, toTick). */
function runTicks(harness: Harness, fromTick: number, toTick: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let tick = fromTick; tick < toTick; tick += 1) {
    harness.state.tick = tick;
    updateStatusEffects(harness.state, harness.level, events);
    updateEnemies(harness.state, events);
  }
  return events;
}

/** A movement step without status ticking, for measuring the current speed. */
function moveOnce(harness: Harness): number {
  const enemy = harness.state.enemies[0];
  if (enemy === undefined) {
    throw new Error('expected an enemy');
  }
  const before = enemy.x;
  updateEnemies(harness.state, []);
  return before - enemy.x;
}

// Spec 4.5: Slow.
describe('slow', () => {
  it('4.5: Slow halves the move speed for 3.0 s', () => {
    const slowed = createHarness();
    const enemy = addEnemy(slowed.state, 0, 5);
    const normal = createHarness();
    addEnemy(normal.state, 0, 5);

    const normalStep = moveOnce(normal);
    applyStatus(0, enemy, { kind: 'slow' }, []);
    const slowedStep = moveOnce(slowed);

    expect(slowedStep).toBeCloseTo(normalStep * rules.status.slow.moveSpeedMultiplier);
    expect(rules.status.slow.durationS).toBe(3);

    slowed.state.tick = ticksFromSeconds(3);
    updateStatusEffects(slowed.state, slowed.level, []);
    expect(hasStatus(enemy, 'slow')).toBe(false);
    expect(moveOnce(slowed)).toBeCloseTo(normalStep);
  });

  it('4.5: Slow refreshes its duration and never stacks', () => {
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5);

    applyStatus(0, enemy, { kind: 'slow' }, []);
    applyStatus(30, enemy, { kind: 'slow' }, []);

    expect(enemy.statuses.filter((status) => status.kind === 'slow')).toHaveLength(1);
    expect(findStatus(enemy, 'slow')?.expiresAtTick).toBe(30 + ticksFromSeconds(3));
  });

  it('4.5: Slow halves the bite attack speed through the shared timers', () => {
    const harness = createHarness();
    const granny = defenderById['iron_granny'];
    if (granny === undefined) {
      throw new Error('expected the iron_granny data');
    }
    addDefender(harness.state, granny, 0, 3); // tile centre x = 3.5
    const enemy = addEnemy(harness.state, 0, 4.05); // inside the 0.55 blocking distance
    harness.state.tick = 0;

    const events: SimEvent[] = [];
    updateEnemies(harness.state, events); // first bite at tick 0, next at +0.5 s
    expect(enemy.nextBiteTick).toBe(ticksFromSeconds(0.5));

    applyStatus(0, enemy, { kind: 'slow' }, events);
    const biteTicks: number[] = [];
    for (let tick = 1; tick <= 30; tick += 1) {
      harness.state.tick = tick;
      const tickEvents: SimEvent[] = [];
      updateStatusEffects(harness.state, harness.level, tickEvents);
      updateEnemies(harness.state, tickEvents);
      for (const event of tickEvents) {
        if (event.type === 'attack' && event.sourceId === enemy.id) {
          biteTicks.push(tick);
        }
      }
    }
    // Slow halves attacks per second, so the half-second bite becomes a one-second bite.
    expect(biteTicks).toEqual([30]);
  });
});

// Spec 4.5: Freeze.
describe('freeze', () => {
  it('4.5: Freeze stops movement and bites for 2.0 s', () => {
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5);
    applyStatus(0, enemy, { kind: 'freeze' }, []);
    expect(rules.status.freeze.durationS).toBe(2);

    const before = enemy.x;
    harness.state.tick = 0;
    updateEnemies(harness.state, []);
    expect(enemy.x).toBe(before);

    harness.state.tick = ticksFromSeconds(2);
    updateStatusEffects(harness.state, harness.level, []);
    expect(hasStatus(enemy, 'freeze')).toBe(false);
    harness.state.tick = ticksFromSeconds(2) + 1;
    updateEnemies(harness.state, []);
    expect(enemy.x).toBeLessThan(before);
  });

  it('4.5: Freeze refreshes its duration and never stacks', () => {
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5);

    applyStatus(0, enemy, { kind: 'freeze' }, []);
    applyStatus(30, enemy, { kind: 'freeze' }, []);

    expect(enemy.statuses.filter((status) => status.kind === 'freeze')).toHaveLength(1);
    expect(findStatus(enemy, 'freeze')?.expiresAtTick).toBe(30 + ticksFromSeconds(2));
  });

  it('4.5/6.3: bosses receive Slow instead of Freeze', () => {
    const gloomling = enemyById[GLOOMLING];
    if (gloomling === undefined) {
      throw new Error('expected the gloomling data');
    }
    const boss = registerEnemyDef({ ...gloomling, id: 'test_boss', isBoss: true, hp: 12000 });
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5, 12000, boss.id);
    const events: SimEvent[] = [];

    applyStatus(0, enemy, { kind: 'freeze' }, events);

    expect(hasStatus(enemy, 'freeze')).toBe(false);
    expect(hasStatus(enemy, 'slow')).toBe(true);
    expect(events).toEqual([{ type: 'statusApplied', targetId: enemy.id, status: 'slow' }]);
  });

  it('4.5/6.3: bosses are immune to Stun and Knockback', () => {
    const gloomling = enemyById[GLOOMLING];
    if (gloomling === undefined) {
      throw new Error('expected the gloomling data');
    }
    const boss = registerEnemyDef({
      ...gloomling,
      id: 'test_boss_immune',
      isBoss: true,
      hp: 12000,
    });
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5, 12000, boss.id);
    const events: SimEvent[] = [];

    applyStatus(0, enemy, { kind: 'stun', durationS: 1 }, events);
    applyStatus(0, enemy, { kind: 'knockback', distanceTiles: 1 }, events);

    expect(enemy.statuses).toEqual([]);
    expect(events).toEqual([]);
  });
});

// Spec 4.5: Burn.
describe('burn', () => {
  it('4.5: Burn deals 6 Blast damage every 0.5 s for 3.0 s and ignores armor', () => {
    const gloomling = enemyById[GLOOMLING];
    if (gloomling === undefined) {
      throw new Error('expected the gloomling data');
    }
    const armored = registerEnemyDef({ ...gloomling, id: 'test_armored', armor: 'armored' });
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5, 1000, armored.id);
    applyStatus(0, enemy, { kind: 'burn' }, []);

    const events = runTicks(harness, 1, ticksFromSeconds(3) + 1);

    const burnHits = events.filter((event) => event.type === 'hit' && event.targetId === enemy.id);
    expect(burnHits).toHaveLength(6);
    for (const hit of burnHits) {
      expect(hit).toMatchObject({ amount: 6, damageType: 'blast' });
    }
    expect(enemy.hp).toBe(1000 - 6 * rules.status.burn.damage);
    expect(hasStatus(enemy, 'burn')).toBe(false);
  });

  it('4.5: Burn refreshes its duration and never stacks', () => {
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5, 1000);

    applyStatus(0, enemy, { kind: 'burn' }, []);
    applyStatus(30, enemy, { kind: 'burn' }, []);

    expect(enemy.statuses.filter((status) => status.kind === 'burn')).toHaveLength(1);
    expect(findStatus(enemy, 'burn')?.expiresAtTick).toBe(30 + ticksFromSeconds(3));
  });
});

// Spec 4.5: Poison.
describe('poison', () => {
  it('4.5: Poison deals 2 % max health per second, ignores armor and stacks up to 3', () => {
    const gloomling = enemyById[GLOOMLING];
    if (gloomling === undefined) {
      throw new Error('expected the gloomling data');
    }
    const armored = registerEnemyDef({ ...gloomling, id: 'test_armored_poison', armor: 'armored' });
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5, 1000, armored.id);

    applyStatus(0, enemy, { kind: 'poison' }, []);
    applyStatus(0, enemy, { kind: 'poison' }, []);
    applyStatus(0, enemy, { kind: 'poison' }, []);
    applyStatus(0, enemy, { kind: 'poison' }, []); // capped: refreshes instead of adding

    expect(enemy.statuses.filter((status) => status.kind === 'poison')).toHaveLength(
      rules.status.poison.maxStacks,
    );
    expect(rules.status.poison.maxStacks).toBe(3);

    runTicks(harness, 1, ticksFromSeconds(4) + 1);

    // 3 stacks x 4 seconds x 20 (2 % of 1000) = 240, with no armor multiplier applied.
    expect(enemy.hp).toBe(1000 - 240);
  });

  it('4.5: Poison stacks have independent timers', () => {
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5, 1000);
    applyStatus(0, enemy, { kind: 'poison' }, []);
    applyStatus(30, enemy, { kind: 'poison' }, []);

    runTicks(harness, 1, 61);

    // The first stack ticked at 30 and 60 (40 damage), the second only at 60 (20 damage).
    expect(enemy.hp).toBe(1000 - 60);
  });
});

// Spec 4.5: Stun.
describe('stun', () => {
  it('4.5: Stun stops movement and bites for the given duration', () => {
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 5);
    applyStatus(0, enemy, { kind: 'stun', durationS: 1.5 }, []);

    const before = enemy.x;
    harness.state.tick = 0;
    updateEnemies(harness.state, []);
    expect(enemy.x).toBe(before);

    harness.state.tick = ticksFromSeconds(1.5);
    updateStatusEffects(harness.state, harness.level, []);
    expect(hasStatus(enemy, 'stun')).toBe(false);
    harness.state.tick = ticksFromSeconds(1.5) + 1;
    updateEnemies(harness.state, []);
    expect(enemy.x).toBeLessThan(before);
  });
});

// Spec 4.5: Knockback.
describe('knockback', () => {
  it('4.5: Knockback pushes the enemy right by the given tiles over 0.2 s', () => {
    const harness = createHarness();
    const enemy = addEnemy(harness.state, 0, 4);
    applyStatus(0, enemy, { kind: 'knockback', distanceTiles: 1 }, []);
    expect(rules.status.knockback.durationS).toBe(0.2);

    // The push happens over the 0.2 s (6 ticks); the status expires in the next status phase.
    runTicks(harness, 0, ticksFromSeconds(0.2));
    expect(enemy.x).toBeCloseTo(5);

    harness.state.tick = ticksFromSeconds(0.2);
    updateStatusEffects(harness.state, harness.level, []);
    expect(hasStatus(enemy, 'knockback')).toBe(false);
  });
});

// Spec 4.5: Wet.
describe('wet', () => {
  it('4.5: Wet is set while the enemy stands on water and cleared when it leaves', () => {
    const harness = createHarness({
      terrain: [{ lane: 0, col: 4, type: 'water' }],
    });
    const enemy = addEnemy(harness.state, 0, 4.5);
    const events: SimEvent[] = [];

    harness.state.tick = 0;
    updateStatusEffects(harness.state, harness.level, events);
    expect(hasStatus(enemy, 'wet')).toBe(true);
    expect(events).toContainEqual({ type: 'statusApplied', targetId: enemy.id, status: 'wet' });

    enemy.x = 6;
    harness.state.tick = 1;
    updateStatusEffects(harness.state, harness.level, events);
    expect(hasStatus(enemy, 'wet')).toBe(false);
  });
});

/** Builds a schema-shaped defender def for the statusOnHit tests. */
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

// Spec 4.5 and 5.2: data-driven statusOnHit of the M2 defenders.
describe('statusOnHit', () => {
  it('4.5/5.2: a straight defender applies its Slow to the enemy it hits', () => {
    const snowpup = registerDefenderDef(
      makeDefenderDef({
        id: 'test_snowpup',
        pattern: 'straight',
        damageType: 'pierce',
        statusOnHit: { status: 'slow', durationS: 3, value: 0 },
      }),
    );
    const harness = createHarness();
    const defender = addDefender(harness.state, snowpup, 2, 0);
    const enemy = addEnemy(harness.state, 2, 2);
    const events: SimEvent[] = [];

    expect(attackWithStraight(harness.state, defender, snowpup, events)).toBe(true);
    for (let tick = 1; tick <= 20 && enemy.statuses.length === 0; tick += 1) {
      harness.state.tick = tick;
      updateProjectiles(harness.state, events);
    }

    expect(hasStatus(enemy, 'slow')).toBe(true);
    expect(events).toContainEqual({ type: 'statusApplied', targetId: enemy.id, status: 'slow' });
  });

  it('4.5/5.2: a lob defender applies its Burn when the arc lands', () => {
    const pyro = registerDefenderDef(
      makeDefenderDef({
        id: 'test_pyro',
        pattern: 'lob',
        damageType: 'blast',
        statusOnHit: { status: 'burn', durationS: 3, value: 0 },
      }),
    );
    const harness = createHarness();
    const defender = addDefender(harness.state, pyro, 2, 1);
    const enemy = addEnemy(harness.state, 2, 5);
    const events: SimEvent[] = [];

    attackWithLob(harness.state, defender, pyro, events);
    const projectile = harness.state.projectiles[0];
    harness.state.tick = projectile?.landTick ?? 0;
    updateProjectiles(harness.state, events);

    expect(hasStatus(enemy, 'burn')).toBe(true);
    expect(events).toContainEqual({ type: 'statusApplied', targetId: enemy.id, status: 'burn' });
  });

  it('4.5/5.2: a beam defender applies Slow, and Freeze on every 4th attack', () => {
    const frostWitch = registerDefenderDef(
      makeDefenderDef({
        id: 'test_frost_witch',
        pattern: 'beam',
        damageType: 'arcane',
        attackIntervalS: 2,
        range: 4,
        damage: 30,
        statusOnHit: { status: 'slow', durationS: 3, value: 0 },
        freezeEveryNthAttack: 4,
      }),
    );
    const harness = createHarness();
    const defender = addDefender(harness.state, frostWitch, 2, 0);
    const near = addEnemy(harness.state, 2, 2);
    const far = addEnemy(harness.state, 2, 3);
    const events: SimEvent[] = [];

    for (let attack = 1; attack <= 3; attack += 1) {
      harness.state.tick = attack * 60;
      attackWithBeam(harness.state, defender, frostWitch, events);
    }
    expect(defender.attackCount).toBe(3);
    expect(hasStatus(near, 'slow')).toBe(true);
    expect(hasStatus(far, 'slow')).toBe(true);
    expect(hasStatus(near, 'freeze')).toBe(false);

    const fourthEvents: SimEvent[] = [];
    harness.state.tick = 4 * 60;
    attackWithBeam(harness.state, defender, frostWitch, fourthEvents);

    expect(defender.attackCount).toBe(4);
    expect(hasStatus(near, 'freeze')).toBe(true);
    expect(hasStatus(far, 'freeze')).toBe(true);
    expect(fourthEvents).toContainEqual({
      type: 'statusApplied',
      targetId: near.id,
      status: 'freeze',
    });
  });
});
