import { describe, expect, it } from 'vitest';

import { defenderById, enemyById, rules } from '../../src/data';
import type { DefenderDef, EnemyDef } from '../../src/data';
import { DefenderDef as DefenderDefSchema } from '../../src/data/schemas';
import { collectAuraDamageBuffs } from '../../src/sim/behaviors/aura';
import { attackWithBeam } from '../../src/sim/behaviors/beam';
import { attackWithDiagonal } from '../../src/sim/behaviors/diagonal';
import { attackWithLob } from '../../src/sim/behaviors/lob';
import { spawnProducerOrbs } from '../../src/sim/behaviors/producer';
import { attackWithSplash } from '../../src/sim/behaviors/splash';
import { attackWithStraight } from '../../src/sim/behaviors/straight';
import { updateTrapDefender } from '../../src/sim/behaviors/trap';
import { updateDefenders } from '../../src/sim/combat/defenderActions';
import { updateProjectiles } from '../../src/sim/combat/projectiles';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import type { DefenderState, EnemyState, Sim, SimEvent, SimState } from '../../src/sim/types';
import { createTestLevel } from './testLevel';

const GLOOMLING = 'gloomling';

/** Builds a schema-shaped defender definition for a pattern test. */
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

/**
 * Registers a fixture def in the data registry so the sim's data lookups can find
 * it (white-box test seam; fixture ids are unique per test file).
 */
function registerDefenderDef(def: DefenderDef): DefenderDef {
  (defenderById as Record<string, DefenderDef>)[def.id] = def;
  return def;
}

/** Registers a flying enemy variant for the flying rules of 4.4 and 4.3. */
function registerFlyingEnemy(): EnemyDef {
  const gloomling = enemyById[GLOOMLING];
  if (gloomling === undefined) {
    throw new Error('expected the gloomling data');
  }
  const bat: EnemyDef = { ...gloomling, id: 'test_bat', name: 'Test Bat', isFlying: true };
  (enemyById as Record<string, EnemyDef>)[bat.id] = bat;
  return bat;
}

/** Creates a sim whose waves stay far away, so the pattern tests control the state. */
function createHarness(): Sim {
  return createSim(
    createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
    [],
    10001,
  );
}

/** Adds a defender directly to the state (placement rules are covered by #18). */
function addDefender(
  sim: Sim,
  defenderDef: DefenderDef,
  lane: number,
  col: number,
  stars: 1 | 2 | 3 = 1,
): DefenderState {
  const state = sim.state as SimState;
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
    trapReadyAtTick:
      defenderDef.pattern === 'trap' ? ticksFromSeconds(defenderDef.armDelayS ?? 0) : null,
    trapRearmed: false,
  };
  state.nextId += 1;
  state.defenders.push(defender);
  return defender;
}

/** Adds an enemy directly to the state (wave spawning is covered by #20). */
function addEnemy(sim: Sim, lane: number, x: number, hp = 200, enemyId = GLOOMLING): EnemyState {
  const state = sim.state as SimState;
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
  };
  state.nextId += 1;
  state.enemies.push(enemy);
  return enemy;
}

/** Sets the tick and runs the projectile phase (the phases around it are covered by #21). */
function runProjectilesAt(sim: Sim, tick: number): SimEvent[] {
  const state = sim.state as SimState;
  state.tick = tick;
  const events: SimEvent[] = [];
  updateProjectiles(state, events);
  return events;
}

// Spec 4.3: the lob pattern.
describe('lob pattern', () => {
  const lobDef = makeDefenderDef({
    id: 'test_lobber',
    pattern: 'lob',
    damage: 40,
    damageType: 'blast',
    attackIntervalS: 2,
    range: 6,
  });

  it('4.3: lob throws at the first enemy in range and cannot hit flying enemies', () => {
    const sim = createHarness();
    const defender = addDefender(sim, lobDef, 2, 1);
    const enemy = addEnemy(sim, 2, 5);
    const events: SimEvent[] = [];

    expect(attackWithLob(sim.state as SimState, defender, lobDef, events)).toBe(true);
    expect(events).toContainEqual({ type: 'attack', sourceId: defender.id, targetId: enemy.id });
    expect(events).toContainEqual({
      type: 'projectileSpawned',
      id: 3,
      kind: 'lob',
      x: 1.5,
      lane: 2,
    });

    const flyingSim = createHarness();
    const flyingDefender = addDefender(flyingSim, lobDef, 2, 1);
    const bat = registerFlyingEnemy();
    addEnemy(flyingSim, 2, 5, 200, bat.id);
    const flyingEvents: SimEvent[] = [];
    expect(attackWithLob(flyingSim.state as SimState, flyingDefender, lobDef, flyingEvents)).toBe(
      false,
    );
  });

  it('4.3: the lob arc lands after 0.8 s and damages its target', () => {
    const sim = createHarness();
    const defender = addDefender(sim, lobDef, 2, 1);
    const enemy = addEnemy(sim, 2, 5);
    const state = sim.state as SimState;
    const events: SimEvent[] = [];
    attackWithLob(state, defender, lobDef, events);

    const projectile = state.projectiles[0];
    expect(projectile?.landTick).toBe(ticksFromSeconds(rules.combat.lobFlightTimeS));
    expect(projectile?.landTick).toBe(24);

    runProjectilesAt(sim, (projectile?.landTick ?? 0) - 1);
    expect(enemy.hp).toBe(200);
    expect(state.projectiles).toHaveLength(1);

    const landingEvents = runProjectilesAt(sim, projectile?.landTick ?? 0);
    expect(enemy.hp).toBe(200 - 40); // Blast vs Light = 1.0 in the 4.1 table
    expect(landingEvents.filter((event) => event.type === 'hit')).toHaveLength(1);
    expect(landingEvents.filter((event) => event.type === 'projectileEnded')).toHaveLength(1);
    expect(state.projectiles).toEqual([]);
  });
});

// Spec 4.3: the splash pattern.
describe('splash pattern', () => {
  const splashDef = makeDefenderDef({
    id: 'test_boomcap',
    pattern: 'splash',
    damage: 40,
    damageType: 'blast',
    attackIntervalS: 2.8,
    range: 9,
    splashRadius: 0.8,
  });

  it('4.3: splash deals full damage to the target and 50 % inside the radius', () => {
    const sim = createHarness();
    const defender = addDefender(sim, splashDef, 2, 1);
    const target = addEnemy(sim, 2, 5);
    const near = addEnemy(sim, 2, 5.5);
    const outside = addEnemy(sim, 2, 6.5);
    const state = sim.state as SimState;
    const events: SimEvent[] = [];
    attackWithSplash(state, defender, splashDef, events);

    const projectile = state.projectiles[0];
    const landingEvents = runProjectilesAt(sim, projectile?.landTick ?? 0);

    expect(target.hp).toBe(200 - 40);
    expect(near.hp).toBe(200 - 20);
    expect(outside.hp).toBe(200);
    expect(landingEvents.filter((event) => event.type === 'hit')).toHaveLength(2);
    expect(state.projectiles).toEqual([]);
  });

  it('4.3: splash cannot hit flying enemies', () => {
    const sim = createHarness();
    const defender = addDefender(sim, splashDef, 2, 1);
    const bat = registerFlyingEnemy();
    addEnemy(sim, 2, 5, 200, bat.id);
    const events: SimEvent[] = [];

    expect(attackWithSplash(sim.state as SimState, defender, splashDef, events)).toBe(false);
  });
});

// Spec 4.3: the beam pattern.
describe('beam pattern', () => {
  const beamDef = makeDefenderDef({
    id: 'test_frost_witch',
    pattern: 'beam',
    damage: 40,
    damageType: 'arcane',
    attackIntervalS: 2,
    range: 3,
  });

  it('4.3: a beam hits every enemy in its lane within range instantly and hits flying', () => {
    const sim = createHarness();
    const defender = addDefender(sim, beamDef, 2, 0); // tile centre x = 0.5
    const near = addEnemy(sim, 2, 2);
    const bat = registerFlyingEnemy();
    const flying = addEnemy(sim, 2, 2.5, 200, bat.id);
    const far = addEnemy(sim, 2, 4); // outside range 3 (max x = 3.5)
    const otherLane = addEnemy(sim, 1, 2);
    const events: SimEvent[] = [];

    expect(attackWithBeam(sim.state as SimState, defender, beamDef, events)).toBe(true);

    // Arcane vs Light = 0.75 in the 4.1 table.
    expect(near.hp).toBe(200 - 30);
    expect(flying.hp).toBe(200 - 30);
    expect(far.hp).toBe(200);
    expect(otherLane.hp).toBe(200);
    expect(events.filter((event) => event.type === 'hit')).toHaveLength(2);
    expect(events).toContainEqual({ type: 'attack', sourceId: defender.id, targetId: near.id });
    expect(sim.state.projectiles).toEqual([]);
  });
});

// Spec 4.3: the diagonal pattern.
describe('diagonal pattern', () => {
  const diagonalDef = makeDefenderDef({
    id: 'test_venom_sprout',
    pattern: 'diagonal',
    damage: 12,
    damageType: 'pierce',
    attackIntervalS: 1.6,
    range: 9,
  });

  it('4.3: diagonal fires one projectile per lane and switches the side ones after one tile', () => {
    const sim = createHarness();
    const defender = addDefender(sim, diagonalDef, 2, 2); // tile centre x = 2.5
    addEnemy(sim, 2, 6);
    const state = sim.state as SimState;
    const events: SimEvent[] = [];
    attackWithDiagonal(state, defender, diagonalDef, events);

    expect(events.filter((event) => event.type === 'projectileSpawned')).toHaveLength(3);
    expect(state.projectiles.map((projectile) => projectile.lane)).toEqual([2, 2, 2]);
    expect(state.projectiles.map((projectile) => projectile.targetLane)).toEqual([null, 1, 3]);
    const switchAtX = 2.5 + rules.combat.diagonalLaneSwitchTiles;

    const stateAfterSwitch = state;
    for (let step = 0; step < 6; step += 1) {
      stateAfterSwitch.tick += 1;
      updateProjectiles(stateAfterSwitch, []);
    }

    expect(state.projectiles.map((projectile) => projectile.lane)).toEqual([2, 1, 3]);
    expect(state.projectiles.every((projectile) => projectile.targetLane === null)).toBe(true);
    expect(state.projectiles[0]?.x).toBeGreaterThanOrEqual(switchAtX);
  });

  it('4.3: diagonal at the top lane only fires into its own and the lane below', () => {
    const sim = createHarness();
    const defender = addDefender(sim, diagonalDef, 0, 2);
    addEnemy(sim, 0, 6);
    const events: SimEvent[] = [];

    attackWithDiagonal(sim.state as SimState, defender, diagonalDef, events);

    expect(events.filter((event) => event.type === 'projectileSpawned')).toHaveLength(2);
  });
});

// Spec 4.3 and 5.2: the aura pattern.
describe('aura pattern', () => {
  const drumDef = registerDefenderDef(
    makeDefenderDef({
      id: 'test_drummer',
      pattern: 'aura',
      damage: 0,
      attackIntervalS: undefined,
      range: undefined,
      buff: { name: 'drum', damageRatio: 0.25 },
      star3Params: { damageRatio: 0.4 },
    }),
  );
  const hypeDef = registerDefenderDef(
    makeDefenderDef({
      id: 'test_hype',
      pattern: 'aura',
      damage: 0,
      attackIntervalS: undefined,
      range: undefined,
      buff: { name: 'hype', damageRatio: 0.1 },
    }),
  );

  it('4.3: aura buffs the four orthogonally adjacent tiles and same-name buffs do not stack', () => {
    const sim = createHarness();
    const sparkbolt = defenderById['sparkbolt_gremlin'];
    if (sparkbolt === undefined) {
      throw new Error('expected the sparkbolt data');
    }
    const target = addDefender(sim, sparkbolt, 2, 2);
    addDefender(sim, drumDef, 1, 2); // above, +25 %
    const strongDrum = addDefender(sim, drumDef, 2, 3, 3); // right, ★3 +40 %
    addDefender(sim, hypeDef, 3, 2); // below, different name
    addDefender(sim, drumDef, 4, 2); // not adjacent: no buff
    expect(strongDrum.stars).toBe(3);

    const ratios = collectAuraDamageBuffs(sim.state as SimState, target).sort();

    expect(ratios).toEqual([0.1, 0.4]);
  });

  it('4.3: an aura defender does not attack', () => {
    const sim = createHarness();
    addDefender(sim, drumDef, 2, 2);
    addEnemy(sim, 2, 5);
    const events: SimEvent[] = [];

    updateDefenders(sim.state as SimState, events);

    expect(events).toEqual([]);
  });
});

// Spec 4.3 and 3.6: the producer pattern.
describe('producer pattern', () => {
  it('4.3/3.6: producer orbs keep the base interval and apply the star divisors', () => {
    const glowshroom = defenderById['glowshroom_monk'];
    if (glowshroom === undefined) {
      throw new Error('expected the glowshroom data');
    }
    const baseSeconds = glowshroom.attackIntervalS ?? 0;
    expect(baseSeconds).toBe(24);

    for (const [stars, expectedInterval] of [
      [2, ticksFromSeconds(baseSeconds / rules.merge.producerStar2IntervalDivisor)],
      [3, ticksFromSeconds(baseSeconds / rules.merge.producerStar3IntervalDivisor)],
    ] as const) {
      const sim = createHarness();
      const defender = addDefender(sim, glowshroom, 2, 0, stars);
      defender.nextOrbTick = 0;
      const events: SimEvent[] = [];

      spawnProducerOrbs(sim.state as SimState, events);

      expect(events.filter((event) => event.type === 'orbSpawned')).toHaveLength(1);
      expect(defender.nextOrbTick).toBe(expectedInterval);
    }
  });

  it('4.3: a producer displaces no attack in the combat phase', () => {
    const glowshroom = defenderById['glowshroom_monk'];
    if (glowshroom === undefined) {
      throw new Error('expected the glowshroom data');
    }
    const sim = createHarness();
    addDefender(sim, glowshroom, 2, 0);
    addEnemy(sim, 2, 5);
    const events: SimEvent[] = [];

    updateDefenders(sim.state as SimState, events);

    expect(events).toEqual([]);
  });
});

// Spec 4.3 and 5.2: the trap pattern.
describe('trap pattern', () => {
  const trapDef = registerDefenderDef(
    makeDefenderDef({
      id: 'test_snaptrap',
      pattern: 'trap',
      damage: 1800,
      damageType: 'blast',
      attackIntervalS: undefined,
      range: undefined,
      armDelayS: 12,
      rearmS: 20,
    }),
  );

  it('4.3: a trap arms after armDelayS and triggers when an enemy steps on its tile', () => {
    const sim = createHarness();
    const defender = addDefender(sim, trapDef, 2, 2); // tile x spans 2 .. 3
    expect(defender.trapReadyAtTick).toBe(ticksFromSeconds(12));
    const enemy = addEnemy(sim, 2, 2.5);
    const state = sim.state as SimState;

    state.tick = ticksFromSeconds(12) - 1;
    const earlyEvents: SimEvent[] = [];
    updateTrapDefender(state, defender, trapDef, earlyEvents);
    expect(earlyEvents).toEqual([]);

    state.tick = ticksFromSeconds(12);
    const events: SimEvent[] = [];
    updateTrapDefender(state, defender, trapDef, events);

    expect(enemy.hp).toBe(200 - 1800); // Blast vs Light = 1.0 in the 4.1 table
    expect(events.filter((event) => event.type === 'hit')).toHaveLength(1);
    expect(defender.trapReadyAtTick).toBeNull();
    expect(defender.trapRearmed).toBe(false);
  });

  it('4.3: a ★3 trap rearms once after rearmS', () => {
    const sim = createHarness();
    const defender = addDefender(sim, trapDef, 2, 2, 3);
    addEnemy(sim, 2, 2.5);
    const state = sim.state as SimState;

    state.tick = ticksFromSeconds(12);
    updateTrapDefender(state, defender, trapDef, []);
    expect(defender.trapRearmed).toBe(true);
    expect(defender.trapReadyAtTick).toBe(ticksFromSeconds(12) + ticksFromSeconds(20));

    addEnemy(sim, 2, 2.6);
    state.tick = defender.trapReadyAtTick ?? 0;
    updateTrapDefender(state, defender, trapDef, []);
    expect(defender.trapReadyAtTick).toBeNull();
    expect(defender.trapRearmed).toBe(true);
  });

  it('4.3: flying enemies do not trigger a trap', () => {
    const sim = createHarness();
    const defender = addDefender(sim, trapDef, 2, 2);
    const bat = registerFlyingEnemy();
    addEnemy(sim, 2, 2.5, 200, bat.id);
    const state = sim.state as SimState;
    state.tick = ticksFromSeconds(12);
    const events: SimEvent[] = [];

    updateTrapDefender(state, defender, trapDef, events);

    expect(events).toEqual([]);
    expect(defender.trapReadyAtTick).toBe(ticksFromSeconds(12));
  });

  it('4.3: traps are invisible to enemies and never block them', () => {
    const sim = createHarness();
    addDefender(sim, trapDef, 2, 2);
    const enemy = addEnemy(sim, 2, 3.1); // just right of the trap tile
    const startX = enemy.x;

    const events = sim.step();

    expect(enemy.x).toBeLessThan(startX);
    expect(events.some((event) => event.type === 'attack')).toBe(false);
    expect(enemy.blockedByDefenderId).toBeNull();
  });
});

// Spec 4.3 and 11.3: the dispatch through DefenderDef.pattern.
describe('pattern dispatch', () => {
  it('4.3: defenderActions dispatches the pattern from the defender data and sets the interval', () => {
    const beamDef = registerDefenderDef(
      makeDefenderDef({
        id: 'test_dispatch_beam',
        pattern: 'beam',
        damage: 10,
        damageType: 'arcane',
        attackIntervalS: 2,
        range: 9,
      }),
    );
    const sim = createHarness();
    const defender = addDefender(sim, beamDef, 2, 0);
    addEnemy(sim, 2, 3);
    const state = sim.state as SimState;
    const events: SimEvent[] = [];

    updateDefenders(state, events);

    expect(events).toContainEqual({ type: 'attack', sourceId: defender.id, targetId: 2 });
    expect(events.filter((event) => event.type === 'hit')).toHaveLength(1);
    expect(defender.nextAttackTick).toBe(ticksFromSeconds(2));
  });

  it('4.3: the M1 straight pattern still dispatches and fires', () => {
    const sparkbolt = defenderById['sparkbolt_gremlin'];
    if (sparkbolt === undefined) {
      throw new Error('expected the sparkbolt data');
    }
    const sim = createHarness();
    const defender = addDefender(sim, sparkbolt, 2, 0);
    addEnemy(sim, 2, 5);
    const state = sim.state as SimState;
    const events: SimEvent[] = [];

    expect(attackWithStraight(state, defender, sparkbolt, events)).toBe(true);
    expect(events.filter((event) => event.type === 'projectileSpawned')).toHaveLength(1);
  });
});

// Spec 11.5: the added pattern fields parse with the defender schema.
describe('pattern data fields', () => {
  it('11.5: the new pattern fields parse with DefenderDef', () => {
    const parsed = DefenderDefSchema.parse({
      id: 'test_pattern_fields',
      name: 'Pattern Fields',
      faction: 'wildgrove',
      rarity: 'common',
      role: 'shooter',
      cost: 100,
      cooldownS: 7.5,
      startsReady: true,
      hp: 300,
      pattern: 'splash',
      damage: 40,
      damageType: 'blast',
      attackIntervalS: 2.8,
      range: 9,
      splashRadius: 0.8,
      hitsFlying: true,
      buff: { name: 'drum', damageRatio: 0.25 },
      armDelayS: 12,
      rearmS: 20,
      element: 'none',
      star3Bonus: 'none',
      milestone: 'M2',
    });

    expect(parsed.splashRadius).toBe(0.8);
    expect(parsed.hitsFlying).toBe(true);
    expect(parsed.buff).toEqual({ name: 'drum', damageRatio: 0.25 });
    expect(parsed.armDelayS).toBe(12);
    expect(parsed.rearmS).toBe(20);
  });
});
