import { describe, expect, it } from 'vitest';

import { defenderById, rules } from '../../src/data';
import type { DefenderDef, LevelDef } from '../../src/data';
import { attackWithBeam } from '../../src/sim/behaviors/beam';
import { attackWithStraight } from '../../src/sim/behaviors/straight';
import { updateProjectiles } from '../../src/sim/combat/projectiles';
import { applyStatus, hasStatus } from '../../src/sim/combat/status';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import type {
  DefenderState,
  EnemyState,
  Sim,
  SimEvent,
  SimState,
  StatusKind,
} from '../../src/sim/types';
import { createTestLevel } from './testLevel';

const GLOOMLING = 'gloomling';

interface Harness {
  readonly sim: Sim;
  readonly level: LevelDef;
  readonly state: SimState;
}

/** Creates a sim whose waves stay far away, so the combo tests control the state. */
function createHarness(): Harness {
  const level = createTestLevel({
    skyDrops: false,
    firstWaveDelay: 600,
    waves: [{ spawns: [] }],
  });
  const sim = createSim(level, [], 10001);
  return { sim, level, state: sim.state as SimState };
}

/** Registers a fixture defender def (white-box test seam; ids are unique per test). */
function registerDefenderDef(def: DefenderDef): DefenderDef {
  (defenderById as Record<string, DefenderDef>)[def.id] = def;
  return def;
}

/** Builds a schema-shaped defender def for the combo tests. */
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
    damage: 10,
    damageType: 'pierce',
    attackIntervalS: 1.4,
    range: 9,
    element: 'none',
    star3Bonus: 'none',
    milestone: 'M2',
    ...overrides,
  };
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

/** Applies a status in the normal way (Wet is terrain-driven, so it is pushed directly). */
function addStatus(tick: number, enemy: EnemyState, kind: StatusKind): void {
  if (kind === 'wet') {
    enemy.statuses.push({
      kind: 'wet',
      expiresAtTick: tick + 10_000,
      nextTickAt: null,
      knockbackTilesPerTick: 0,
    });
    return;
  }
  applyStatus(tick, enemy, { kind }, []);
}

/** Fires one beam attack and returns the events of that attack. */
function fireBeam(
  harness: Harness,
  defenderDef: DefenderDef,
  targetCount = 1,
): { defender: DefenderState; events: SimEvent[] } {
  const defender = addDefender(harness.state, defenderDef, 0, 0);
  const events: SimEvent[] = [];
  if (targetCount > 0) {
    attackWithBeam(harness.state, defender, defenderDef, events);
  }
  return { defender, events };
}

/** A beam fixture that reaches x <= 3.5 in lane 0 (from the tile centre x = 0.5). */
function beamDef(id: string, overrides: Partial<DefenderDef> = {}): DefenderDef {
  return registerDefenderDef(
    makeDefenderDef({
      id,
      pattern: 'beam',
      element: 'fire',
      damageType: 'blast',
      damage: 0,
      range: 3,
      ...overrides,
    }),
  );
}

// Spec 4.6: Steam Burst.
describe('Steam Burst', () => {
  it('4.6: a fire hit on a Slowed enemy removes Slow, bursts 60 Blast and stuns in 1.0 tile', () => {
    const def = beamDef('test_fire_beam');
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 1000);
    const near = addEnemy(harness.state, 0, 2.9, 1000);
    const far = addEnemy(harness.state, 0, 4, 1000);
    addStatus(0, target, 'slow');

    const { events } = fireBeam(harness, def);

    expect(events).toContainEqual({ type: 'combo', combo: 'steam', x: 2, lane: 0 });
    expect(hasStatus(target, 'slow')).toBe(false);
    expect(target.hp).toBe(1000 - 1 - rules.combos.steam.burstDamage);
    expect(near.hp).toBe(1000 - 1 - rules.combos.steam.burstDamage);
    expect(far.hp).toBe(1000);
    expect(hasStatus(target, 'stun')).toBe(true);
    expect(hasStatus(near, 'stun')).toBe(true);
    expect(hasStatus(far, 'stun')).toBe(false);
    const stun = target.statuses.find((status) => status.kind === 'stun');
    expect(stun?.expiresAtTick).toBe(ticksFromSeconds(rules.combos.steam.stunDurationS));
    expect(events).toContainEqual({ type: 'statusApplied', targetId: near.id, status: 'stun' });
  });

  it('4.6: Steam Burst also removes Freeze', () => {
    const def = beamDef('test_fire_beam_freeze');
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 1000);
    addStatus(0, target, 'freeze');

    const { events } = fireBeam(harness, def);

    expect(events).toContainEqual({ type: 'combo', combo: 'steam', x: 2, lane: 0 });
    expect(hasStatus(target, 'freeze')).toBe(false);
  });

  it('4.6: Steam Burst needs a fire attack on a Slowed/Frozen enemy', () => {
    const frostDef = beamDef('test_frost_beam', { element: 'frost' });
    const fireDef = beamDef('test_fire_beam_plain');
    const slowed = createHarness();
    const slowedEnemy = addEnemy(slowed.state, 0, 2, 1000);
    addStatus(0, slowedEnemy, 'slow');
    expect(fireBeam(slowed, frostDef).events.some((event) => event.type === 'combo')).toBe(false);

    const fresh = createHarness();
    addEnemy(fresh.state, 0, 2, 1000);
    expect(fireBeam(fresh, fireDef).events.some((event) => event.type === 'combo')).toBe(false);
  });

  it('4.6: Steam Burst respects the 2.0 s per-enemy cooldown', () => {
    const def = beamDef('test_fire_beam_cooldown');
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 1000);
    addStatus(0, target, 'slow');
    expect(fireBeam(harness, def).events.some((event) => event.type === 'combo')).toBe(true);
    expect(target.comboCooldowns.steam).toBe(ticksFromSeconds(2));

    harness.state.tick = 30; // 1 s later: still cooling down
    addStatus(30, target, 'slow');
    const { defender } = { defender: harness.state.defenders[0] as DefenderState };
    const early: SimEvent[] = [];
    attackWithBeam(harness.state, defender, def, early);
    expect(early.some((event) => event.type === 'combo')).toBe(false);

    harness.state.tick = 60; // exactly 2 s: ready again
    addStatus(60, target, 'slow');
    const later: SimEvent[] = [];
    attackWithBeam(harness.state, defender, def, later);
    expect(later).toContainEqual({ type: 'combo', combo: 'steam', x: 2, lane: 0 });
  });

  it('4.6: each enemy has its own combo cooldown', () => {
    const def = beamDef('test_fire_beam_multi');
    const harness = createHarness();
    const first = addEnemy(harness.state, 0, 2, 1000);
    const second = addEnemy(harness.state, 0, 2.5, 1000);
    addStatus(0, first, 'slow');
    addStatus(0, second, 'slow');

    const { events } = fireBeam(harness, def);

    expect(events.filter((event) => event.type === 'combo')).toHaveLength(2);
    expect(first.comboCooldowns.steam).toBe(ticksFromSeconds(2));
    expect(second.comboCooldowns.steam).toBe(ticksFromSeconds(2));
  });
});

// Spec 4.6: Shatter.
describe('Shatter', () => {
  it('4.6: Pierce damage on a Frozen enemy doubles the hit and ends Freeze', () => {
    const def = registerDefenderDef(
      makeDefenderDef({
        id: 'test_pierce_straight',
        pattern: 'straight',
        damage: 20,
        damageType: 'pierce',
        range: 9,
      }),
    );
    const harness = createHarness();
    const defender = addDefender(harness.state, def, 0, 0);
    const target = addEnemy(harness.state, 0, 2, 1000);
    addStatus(0, target, 'freeze');
    const events: SimEvent[] = [];

    expect(attackWithStraight(harness.state, defender, def, events)).toBe(true);
    for (let tick = 1; tick <= 20 && events.every((event) => event.type !== 'hit'); tick += 1) {
      harness.state.tick = tick;
      updateProjectiles(harness.state, events);
    }

    expect(events).toContainEqual({ type: 'combo', combo: 'shatter', x: target.x, lane: 0 });
    expect(hasStatus(target, 'freeze')).toBe(false);
    const hit = events.find((event) => event.type === 'hit');
    // 20 Pierce vs Light (1.25) = 25, Shatter doubles it to 50.
    expect(hit).toMatchObject({ type: 'hit', amount: 50, damageType: 'pierce' });
  });

  it('4.6: Shatter needs Pierce damage on a Frozen enemy', () => {
    const blastDef = beamDef('test_shatter_blast', { element: 'none', damageType: 'blast' });
    const harness = createHarness();
    const frozen = addEnemy(harness.state, 0, 2, 1000);
    addStatus(0, frozen, 'freeze');
    expect(fireBeam(harness, blastDef).events.some((event) => event.type === 'combo')).toBe(false);
    expect(hasStatus(frozen, 'freeze')).toBe(true);

    const pierceDef = beamDef('test_shatter_pierce_plain', {
      element: 'none',
      damageType: 'pierce',
    });
    const fresh = createHarness();
    addEnemy(fresh.state, 0, 2, 1000);
    expect(fireBeam(fresh, pierceDef).events.some((event) => event.type === 'combo')).toBe(false);
  });

  it('4.6: Shatter respects the 2.0 s per-enemy cooldown', () => {
    const def = beamDef('test_shatter_cooldown', { element: 'none', damageType: 'pierce' });
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 1000);
    addStatus(0, target, 'freeze');
    const first = fireBeam(harness, def).events;
    expect(first.some((event) => event.type === 'combo')).toBe(true);

    addStatus(10, target, 'freeze');
    harness.state.tick = 10;
    const defender = harness.state.defenders[0] as DefenderState;
    const early: SimEvent[] = [];
    attackWithBeam(harness.state, defender, def, early);
    expect(early.some((event) => event.type === 'combo')).toBe(false);
    expect(hasStatus(target, 'freeze')).toBe(true);

    harness.state.tick = ticksFromSeconds(2);
    const later: SimEvent[] = [];
    attackWithBeam(harness.state, defender, def, later);
    expect(later.some((event) => event.type === 'combo')).toBe(true);
  });
});

// Spec 4.6: Toxic Spread.
describe('Toxic Spread', () => {
  it('4.6: Blast damage on a Poisoned enemy gives 1 Poison stack within 1.0 tile', () => {
    const def = beamDef('test_toxic_beam', { element: 'none', damageType: 'blast', range: 2 });
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 1000);
    const near = addEnemy(harness.state, 0, 2.9, 1000);
    const far = addEnemy(harness.state, 0, 4, 1000);
    addStatus(0, target, 'poison');

    const { events } = fireBeam(harness, def);

    expect(events).toContainEqual({ type: 'combo', combo: 'toxic', x: 2, lane: 0 });
    expect(target.statuses.filter((status) => status.kind === 'poison')).toHaveLength(2);
    expect(near.statuses.filter((status) => status.kind === 'poison')).toHaveLength(1);
    expect(far.statuses.filter((status) => status.kind === 'poison')).toHaveLength(0);
  });

  it('4.6: Toxic Spread needs Blast damage on a Poisoned enemy', () => {
    const pierceDef = beamDef('test_toxic_pierce', { damageType: 'pierce' });
    const blastDef = beamDef('test_toxic_plain', { damageType: 'blast' });
    const poisoned = createHarness();
    const poisonedEnemy = addEnemy(poisoned.state, 0, 2, 1000);
    addStatus(0, poisonedEnemy, 'poison');
    expect(fireBeam(poisoned, pierceDef).events.some((event) => event.type === 'combo')).toBe(
      false,
    );

    const fresh = createHarness();
    addEnemy(fresh.state, 0, 2, 1000);
    expect(fireBeam(fresh, blastDef).events.some((event) => event.type === 'combo')).toBe(false);
  });

  it('4.6: Toxic Spread respects the 2.0 s per-enemy cooldown', () => {
    const def = beamDef('test_toxic_cooldown', { damageType: 'blast' });
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 1000);
    addStatus(0, target, 'poison');
    const first = fireBeam(harness, def).events;
    expect(first.some((event) => event.type === 'combo')).toBe(true);
    const stacksAfterFirst = target.statuses.filter((status) => status.kind === 'poison').length;

    harness.state.tick = 30;
    const defender = harness.state.defenders[0] as DefenderState;
    const early: SimEvent[] = [];
    attackWithBeam(harness.state, defender, def, early);
    expect(early.some((event) => event.type === 'combo')).toBe(false);
    expect(target.statuses.filter((status) => status.kind === 'poison')).toHaveLength(
      stacksAfterFirst,
    );
  });
});

// Spec 4.6: Chain Shock.
describe('Chain Shock', () => {
  it('4.6: a storm attack on a Wet enemy jumps 40 Arcane to the other Wet enemies within 2.0 tiles', () => {
    const def = beamDef('test_storm_beam', {
      element: 'storm',
      damageType: 'arcane',
      damage: 0,
      range: 2,
    });
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 1000);
    const otherWet = addEnemy(harness.state, 0, 2.8, 1000);
    const dry = addEnemy(harness.state, 0, 2.4, 1000);
    const farWet = addEnemy(harness.state, 0, 4.5, 1000);
    addStatus(0, target, 'wet');
    addStatus(0, otherWet, 'wet');
    addStatus(0, farWet, 'wet');

    const { events } = fireBeam(harness, def);

    expect(events).toContainEqual({ type: 'combo', combo: 'chain', x: 2, lane: 0 });
    // 40 Arcane vs Light (0.75) = 30, on top of the 1 base damage of the beam.
    expect(otherWet.hp).toBe(1000 - 30); // jump only: outside the beam range
    expect(dry.hp).toBe(1000 - 1);
    expect(farWet.hp).toBe(1000);
    expect(target.hp).toBe(1000 - 1); // the target never takes its own jump
  });

  it('4.6: Chain Shock needs a storm attack on a Wet enemy', () => {
    const fireDef = beamDef('test_chain_fire', { element: 'fire' });
    const stormDef = beamDef('test_chain_storm_plain', { element: 'storm' });
    const wet = createHarness();
    addStatus(0, addEnemy(wet.state, 0, 2, 1000), 'wet');
    expect(fireBeam(wet, fireDef).events.some((event) => event.type === 'combo')).toBe(false);

    const dry = createHarness();
    addEnemy(dry.state, 0, 2, 1000);
    expect(fireBeam(dry, stormDef).events.some((event) => event.type === 'combo')).toBe(false);
  });

  it('4.6: Chain Shock respects the 2.0 s per-enemy cooldown', () => {
    const def = beamDef('test_chain_cooldown', { element: 'storm', damageType: 'arcane' });
    const harness = createHarness();
    const target = addEnemy(harness.state, 0, 2, 10000);
    const otherWet = addEnemy(harness.state, 0, 2.8, 10000);
    addStatus(0, target, 'wet');
    addStatus(0, otherWet, 'wet');
    expect(fireBeam(harness, def).events.some((event) => event.type === 'combo')).toBe(true);
    const hpAfterFirst = otherWet.hp;

    harness.state.tick = 30;
    const defender = harness.state.defenders[0] as DefenderState;
    const early: SimEvent[] = [];
    attackWithBeam(harness.state, defender, def, early);
    expect(early.some((event) => event.type === 'combo')).toBe(false);
    expect(otherWet.hp).toBe(hpAfterFirst - 1); // only the beam's base damage

    harness.state.tick = ticksFromSeconds(2);
    const later: SimEvent[] = [];
    attackWithBeam(harness.state, defender, def, later);
    expect(later.some((event) => event.type === 'combo')).toBe(true);
  });
});
