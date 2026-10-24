import { describe, expect, it } from 'vitest';

import { defenderById } from '../../src/data';
import type { DefenderDef } from '../../src/data';
import { attackWithBeam } from '../../src/sim/behaviors/beam';
import { attackWithLob } from '../../src/sim/behaviors/lob';
import { spawnProducerOrbs } from '../../src/sim/behaviors/producer';
import { attackWithSplash } from '../../src/sim/behaviors/splash';
import {
  star3BoltBurst,
  star3ExtraHits,
  star3FirePatch,
  star3MeleeReflectRatio,
  star3RangeTiles,
  star3SplashRadius,
  star3StatusDurationS,
} from '../../src/sim/behaviors/star3';
import { attackWithStraight } from '../../src/sim/behaviors/straight';
import { updateDefenders } from '../../src/sim/combat/defenderActions';
import { updateEnemies } from '../../src/sim/combat/enemyActions';
import { updateFirePatches } from '../../src/sim/combat/firePatches';
import { updateProjectiles } from '../../src/sim/combat/projectiles';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import type { DefenderState, EnemyState, Sim, SimEvent, SimState } from '../../src/sim/types';
import { createTestLevel } from './testLevel';

const GLOOMLING = 'gloomling';

/** Builds a schema-shaped defender definition for a ★3 bonus test. */
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
 * it (white-box test seam, like patterns.test.ts). M2 defender data lands in #46.
 */
function registerDefenderDef(def: DefenderDef): DefenderDef {
  (defenderById as Record<string, DefenderDef>)[def.id] = def;
  return def;
}

/** Creates a sim whose waves stay far away, so the tests control the state. */
function createHarness(): Sim {
  return createSim(
    createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
    [],
    10001,
  );
}

/** Adds a defender directly to the state (placement is covered by merge.test.ts). */
function addDefender(
  sim: Sim,
  defenderDef: DefenderDef,
  lane: number,
  col: number,
  stars: 1 | 2 | 3 = 3,
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
    trapReadyAtTick: null,
    trapRearmed: false,
    attackCount: 0,
    burstShotsRemaining: 0,
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

/** Sets the tick and runs the projectile phase. */
function runProjectilesAt(sim: Sim, tick: number): SimEvent[] {
  const state = sim.state as SimState;
  state.tick = tick;
  const events: SimEvent[] = [];
  updateProjectiles(state, events);
  return events;
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

/** Runs the combat phase for the given number of ticks and returns the events. */
function runDefenders(sim: Sim, tickCount: number): { tick: number; events: SimEvent[] }[] {
  const state = sim.state as SimState;
  const ticks: { tick: number; events: SimEvent[] }[] = [];
  for (let tick = 0; tick < tickCount; tick += 1) {
    state.tick = tick;
    const events: SimEvent[] = [];
    updateDefenders(state, events);
    ticks.push({ tick, events });
  }
  return ticks;
}

/** The ticks at which the given combat phase spawned a projectile. */
function projectileTicks(ticks: { tick: number; events: SimEvent[] }[]): number[] {
  return ticks
    .filter(({ events }) => events.some((event) => event.type === 'projectileSpawned'))
    .map(({ tick }) => tick);
}

// Spec 3.6 and 5.2: the data-driven ★3 bonus framework.
describe('star-3 bonus framework (spec 5.2)', () => {
  const splashDef = makeDefenderDef({
    id: 'test_boomcap',
    pattern: 'splash',
    damage: 40,
    damageType: 'blast',
    attackIntervalS: 2.8,
    splashRadius: 0.8,
    star3Bonus: 'splash_radius_up',
    star3Params: { splashRadius: 1.2 },
  });
  const rangeDef = makeDefenderDef({
    id: 'test_frost_witch',
    pattern: 'beam',
    damage: 30,
    damageType: 'arcane',
    attackIntervalS: 2,
    range: 4,
    star3Bonus: 'range_up',
    star3Params: { range: 6 },
  });

  it('5.2: the handlers are keyed by star3Bonus and only apply at ★3', () => {
    const sim = createHarness();
    const twoStars = addDefender(sim, splashDef, 2, 1, 2);
    const threeStars = addDefender(sim, splashDef, 3, 1, 3);

    expect(star3SplashRadius(twoStars, splashDef)).toBe(0.8);
    expect(star3SplashRadius(threeStars, splashDef)).toBe(1.2);
    expect(star3RangeTiles(addDefender(sim, rangeDef, 4, 1, 2), rangeDef)).toBe(4);
    expect(star3RangeTiles(addDefender(sim, rangeDef, 4, 2, 3), rangeDef)).toBe(6);
  });

  it('5.2: a bonus id the defender does not have keeps the base values', () => {
    const sim = createHarness();
    const unknownDef = makeDefenderDef({
      id: 'test_unknown_bonus',
      pattern: 'straight',
      star3Bonus: 'not_a_bonus',
      star3Params: { splashRadius: 9, range: 9 },
    });
    const unknown = addDefender(sim, unknownDef, 3, 1, 3);

    expect(star3SplashRadius(unknown, unknownDef)).toBeNull();
    expect(star3RangeTiles(unknown, unknownDef)).toBe(9);
    expect(star3BoltBurst(unknown, unknownDef)).toBeNull();
    expect(star3ExtraHits(unknown, unknownDef)).toBe(0);
    expect(star3MeleeReflectRatio(unknown, unknownDef)).toBe(0);
    expect(star3StatusDurationS(unknown, unknownDef, 3)).toBe(3);
    expect(star3FirePatch(unknown, unknownDef)).toBeNull();
  });

  it('5.2: missing star3Params fall back to the base data instead of inventing values', () => {
    const sim = createHarness();
    const brokenSplash = makeDefenderDef({
      id: 'test_broken_splash',
      pattern: 'splash',
      splashRadius: 0.8,
      star3Bonus: 'splash_radius_up',
    });
    const defender = addDefender(sim, brokenSplash, 2, 0, 3);

    expect(star3SplashRadius(defender, brokenSplash)).toBe(0.8);
  });
});

// Spec 5.2: the three M1 defenders' ★3 bonuses.
describe('M1 ★3 bonuses (spec 5.2)', () => {
  it('5.2: Glowshroom Monk orbs are worth 35 at ★3 and 25 below', () => {
    const glowshroom = defenderById['glowshroom_monk'];
    if (glowshroom === undefined) {
      throw new Error('expected the glowshroom data');
    }
    const star3Sim = createHarness();
    const star3Monk = addDefender(star3Sim, glowshroom, 2, 0, 3);
    star3Monk.nextOrbTick = 0;
    const star3Events: SimEvent[] = [];
    spawnProducerOrbs(star3Sim.state as SimState, star3Events);
    expect(orbSpawnedEvent(star3Events)?.value).toBe(35);

    const star2Sim = createHarness();
    const star2Monk = addDefender(star2Sim, glowshroom, 2, 0, 2);
    star2Monk.nextOrbTick = 0;
    const star2Events: SimEvent[] = [];
    spawnProducerOrbs(star2Sim.state as SimState, star2Events);
    expect(orbSpawnedEvent(star2Events)?.value).toBe(25);
  });

  it('5.2: Sparkbolt Gremlin ★3 fires 2 bolts 0.15 s apart per attack', () => {
    const sparkbolt = defenderById['sparkbolt_gremlin'];
    if (sparkbolt === undefined) {
      throw new Error('expected the sparkbolt data');
    }
    const gapTicks = ticksFromSeconds(0.15);
    expect(gapTicks).toBe(5);

    const sim = createHarness();
    const defender = addDefender(sim, sparkbolt, 0, 0, 3);
    addEnemy(sim, 0, 5);

    expect(projectileTicks(runDefenders(sim, 10))).toEqual([0, gapTicks]);
    expect(star3BoltBurst(defender, sparkbolt)).toEqual({ boltCount: 2, gapTicks });
  });

  it('5.2: a ★2 Sparkbolt Gremlin fires a single bolt per attack', () => {
    const sparkbolt = defenderById['sparkbolt_gremlin'];
    if (sparkbolt === undefined) {
      throw new Error('expected the sparkbolt data');
    }
    const sim = createHarness();
    addDefender(sim, sparkbolt, 0, 0, 2);
    addEnemy(sim, 0, 5);

    expect(projectileTicks(runDefenders(sim, 10))).toEqual([0]);
  });

  it('5.2: a ★3 double bolt burst stops when it loses its target', () => {
    const sparkbolt = defenderById['sparkbolt_gremlin'];
    if (sparkbolt === undefined) {
      throw new Error('expected the sparkbolt data');
    }
    const sim = createHarness();
    const state = sim.state as SimState;
    const defender = addDefender(sim, sparkbolt, 0, 0, 3);
    addEnemy(sim, 0, 5);
    state.tick = 0;
    updateDefenders(state, []);
    expect(defender.burstShotsRemaining).toBe(1);
    state.enemies.splice(0, state.enemies.length);

    state.tick = ticksFromSeconds(0.15);
    updateDefenders(state, []);

    expect(defender.burstShotsRemaining).toBe(0);
    expect(defender.nextAttackTick).toBe(ticksFromSeconds(0.15));
  });

  it('5.2: Iron Granny ★3 reflects 20 % of the melee damage she takes', () => {
    const granny = defenderById['iron_granny'];
    if (granny === undefined) {
      throw new Error('expected the iron granny data');
    }
    const sim = createHarness();
    const state = sim.state as SimState;
    const defender = addDefender(sim, granny, 0, 0, 3);
    const enemy = addEnemy(sim, 0, 0.8);

    updateEnemies(state, []);

    const biteDamage = 50; // Gloomling bite (spec 6.1)
    expect(defender.hp).toBe(granny.hp - biteDamage);
    expect(enemy.hp).toBe(200 - Math.round(biteDamage * 0.2));

    const star2Sim = createHarness();
    addDefender(star2Sim, granny, 0, 0, 2);
    const star2Enemy = addEnemy(star2Sim, 0, 0.8);
    updateEnemies(star2Sim.state as SimState, []);
    expect(star2Enemy.hp).toBe(200);
  });
});

/** The first orbSpawned event of an event list, if any. */
function orbSpawnedEvent(
  events: readonly SimEvent[],
): Extract<SimEvent, { type: 'orbSpawned' }> | undefined {
  return events.find((event) => event.type === 'orbSpawned');
}

// Spec 5.2: the five M2 defender ★3 bonuses, tested with synthetic M2 data (data lands in #46).
describe('M2 ★3 bonuses (spec 5.2)', () => {
  const splashUp = registerDefenderDef(
    makeDefenderDef({
      id: 'test_boomcap_star3',
      pattern: 'splash',
      damage: 40,
      damageType: 'blast',
      attackIntervalS: 2.8,
      splashRadius: 0.8,
      star3Bonus: 'splash_radius_up',
      star3Params: { splashRadius: 1.2 },
    }),
  );
  const slowUp = registerDefenderDef(
    makeDefenderDef({
      id: 'test_snowpup_star3',
      pattern: 'straight',
      damage: 20,
      damageType: 'pierce',
      attackIntervalS: 1.4,
      statusOnHit: { status: 'slow', durationS: 3, value: 1 },
      star3Bonus: 'slow_duration_up',
      star3Params: { slowDurationS: 5 },
    }),
  );
  const piercing = registerDefenderDef(
    makeDefenderDef({
      id: 'test_rune_archer_star3',
      pattern: 'straight',
      damage: 30,
      damageType: 'arcane',
      attackIntervalS: 1.5,
      star3Bonus: 'piercing_arrow',
      star3Params: { extraHits: 1 },
    }),
  );
  const pyroFox = registerDefenderDef(
    makeDefenderDef({
      id: 'test_pyro_fox_star3',
      pattern: 'lob',
      damage: 25,
      damageType: 'blast',
      attackIntervalS: 2,
      range: 6,
      element: 'fire',
      statusOnHit: { status: 'burn', durationS: 3, value: 1 },
      star3Bonus: 'fire_patch',
      star3Params: { firePatchRadiusTiles: 0.5, firePatchDurationS: 2 },
    }),
  );

  it('5.2: boomcap_brewer splash_radius_up raises the splash radius to 1.2', () => {
    const star3Sim = createHarness();
    const star3Defender = addDefender(star3Sim, splashUp, 2, 1, 3);
    addEnemy(star3Sim, 2, 5);
    const near = addEnemy(star3Sim, 2, 6);
    const outside = addEnemy(star3Sim, 2, 6.5);
    attackWithSplash(star3Sim.state as SimState, star3Defender, splashUp, []);
    runProjectilesToEnd(star3Sim);

    // ★3 Blast damage is 40 × 2.5 = 100; the splash secondary is 50 % (spec 3.6, 4.2, 4.3).
    expect(near.hp).toBe(200 - 50); // inside the ★3 radius 1.2
    expect(outside.hp).toBe(200); // outside 1.2

    const star2Sim = createHarness();
    const star2Defender = addDefender(star2Sim, splashUp, 2, 1, 2);
    addEnemy(star2Sim, 2, 5);
    const star2Near = addEnemy(star2Sim, 2, 6);
    attackWithSplash(star2Sim.state as SimState, star2Defender, splashUp, []);
    runProjectilesToEnd(star2Sim);

    expect(star2Near.hp).toBe(200); // outside the base radius 0.8
  });

  it('5.2: snowpup_yeti slow_duration_up makes Slow last 5 s', () => {
    const sim = createHarness();
    const defender = addDefender(sim, slowUp, 2, 1, 3);
    addEnemy(sim, 2, 5);

    attackWithStraight(sim.state as SimState, defender, slowUp, []);

    expect(sim.state.projectiles[0]?.statusDurationS).toBe(5);

    const star2Sim = createHarness();
    const star2Defender = addDefender(star2Sim, slowUp, 2, 1, 2);
    addEnemy(star2Sim, 2, 5);
    attackWithStraight(star2Sim.state as SimState, star2Defender, slowUp, []);
    expect(star2Sim.state.projectiles[0]?.statusDurationS).toBe(3);
  });

  it('5.2: rune_archer piercing_arrow passes through the first enemy and hits a second', () => {
    const sim = createHarness();
    const state = sim.state as SimState;
    const defender = addDefender(sim, piercing, 2, 1, 3);
    const first = addEnemy(sim, 2, 3);
    const second = addEnemy(sim, 2, 5);

    attackWithStraight(state, defender, piercing, []);
    expect(state.projectiles[0]?.piercesRemaining).toBe(1);
    const events = runProjectilesToEnd(sim);

    expect(first.hp).toBeLessThan(200);
    expect(second.hp).toBeLessThan(200);
    expect(events.filter((event) => event.type === 'hit')).toHaveLength(2);

    const star2Sim = createHarness();
    const star2State = star2Sim.state as SimState;
    const star2Defender = addDefender(star2Sim, piercing, 2, 1, 2);
    const star2First = addEnemy(star2Sim, 2, 3);
    const star2Second = addEnemy(star2Sim, 2, 5);
    attackWithStraight(star2State, star2Defender, piercing, []);
    runProjectilesToEnd(star2Sim);

    expect(star2First.hp).toBeLessThan(200);
    expect(star2Second.hp).toBe(200);
  });

  it('5.2: pyro_fox fire_patch leaves a 0.5 tile, 2 s Burn patch at the impact', () => {
    const sim = createHarness();
    const state = sim.state as SimState;
    const defender = addDefender(sim, pyroFox, 2, 1, 3);
    const target = addEnemy(sim, 2, 5);
    const outside = addEnemy(sim, 2, 5.6);

    attackWithLob(state, defender, pyroFox, []);
    expect(state.projectiles[0]?.firePatch).toEqual({
      radiusTiles: 0.5,
      durationTicks: ticksFromSeconds(2),
    });
    const landTick = state.projectiles[0]?.landTick ?? 0;
    runProjectilesAt(sim, landTick);

    const patch = state.firePatches[0];
    expect(patch?.radiusTiles).toBe(0.5);
    expect(patch?.expiresAtTick).toBe(landTick + ticksFromSeconds(2));

    state.tick = landTick;
    updateFirePatches(state, []);
    expect(target.statuses.some((status) => status.kind === 'burn')).toBe(true);
    expect(outside.statuses.some((status) => status.kind === 'burn')).toBe(false);

    state.tick = (patch?.expiresAtTick ?? 0) + 1;
    updateFirePatches(state, []);
    expect(state.firePatches).toEqual([]);

    const star2Sim = createHarness();
    const star2Defender = addDefender(star2Sim, pyroFox, 2, 1, 2);
    addEnemy(star2Sim, 2, 5);
    attackWithLob(star2Sim.state as SimState, star2Defender, pyroFox, []);
    expect(star2Sim.state.projectiles[0]?.firePatch).toBeNull();
  });

  it('5.2: frost_witch range_up extends the beam range from 4 to 6 tiles', () => {
    const witch = registerDefenderDef(
      makeDefenderDef({
        id: 'test_frost_witch_star3',
        pattern: 'beam',
        damage: 30,
        damageType: 'arcane',
        attackIntervalS: 2,
        range: 4,
        star3Bonus: 'range_up',
        star3Params: { range: 6 },
      }),
    );
    const sim = createHarness();
    const state = sim.state as SimState;
    const star3Defender = addDefender(sim, witch, 3, 0, 3);
    const farEnemy = addEnemy(sim, 3, 5.5); // tile centre 0.5 + range 4 = 4.5, range 6 = 6.5
    expect(attackWithBeam(state, star3Defender, witch, [])).toBe(true);
    expect(farEnemy.hp).toBeLessThan(200);

    const star2Sim = createHarness();
    const star2Defender = addDefender(star2Sim, witch, 3, 0, 2);
    const farStar2 = addEnemy(star2Sim, 3, 5.5);
    expect(attackWithBeam(star2Sim.state as SimState, star2Defender, witch, [])).toBe(false);
    expect(farStar2.hp).toBe(200);
  });
});
