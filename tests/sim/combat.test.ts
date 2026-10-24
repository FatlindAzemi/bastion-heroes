import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data';
import { findTarget } from '../../src/sim/combat/targeting';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import type { EnemyState, LoadoutEntry, Sim, SimEvent, SimState } from '../../src/sim/types';
import { createTestLevel } from './testLevel';

const SPARKBOLT = 'sparkbolt_gremlin';
const IRON_GRANNY = 'iron_granny';
const GLOWSHROOM = 'glowshroom_monk';

const LOADOUT: LoadoutEntry[] = [
  { defenderId: SPARKBOLT, level: 1 },
  { defenderId: IRON_GRANNY, level: 1 },
  { defenderId: GLOWSHROOM, level: 1 },
];

interface RecordedEvent {
  tick: number;
  event: SimEvent;
}

type EventOf<Type extends SimEvent['type']> = {
  tick: number;
  event: Extract<SimEvent, { type: Type }>;
};

/** Records only the events of one type, with the tick that emitted them. */
function eventsOfType<Type extends SimEvent['type']>(
  recorded: RecordedEvent[],
  type: Type,
): EventOf<Type>[] {
  return recorded.filter((entry): entry is EventOf<Type> => entry.event.type === type);
}

/** Creates a combat sim with sky drops and wave spawns off so only combat uses ids. */
function createCombatSim(): Sim {
  return createSim(
    createTestLevel({
      skyDrops: false,
      startEssence: 999,
      firstWaveDelay: 60,
      waves: [{ spawns: [] }],
    }),
    LOADOUT.map((entry) => ({ ...entry })),
    10001,
  );
}

/** Places a defender, making its card ready first (card cooldowns are covered by #18). */
function placeDefender(sim: Sim, defenderId: string, lane: number, col: number): void {
  const cardIndex = LOADOUT.findIndex((entry) => entry.defenderId === defenderId);
  sim.state.cardCooldownEndTicks[cardIndex] = 0;
  sim.enqueue({ type: 'place', defenderId, lane, col });
  sim.step();
}

/** Adds an enemy exactly at `x` (wave spawning is covered by #20). */
function spawnEnemy(sim: Sim, lane: number, x: number, hp = 200): EnemyState {
  // The state is exposed read-only to game code; tests write through the mutable SimState.
  const state = sim.state as SimState;
  const id = state.nextId;
  state.nextId += 1;
  const enemy: EnemyState = {
    id,
    enemyId: 'gloomling',
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
  state.enemies.push(enemy);
  return enemy;
}

/** Steps until `tick` is reached; the next `step()` then runs that tick's phases. */
function advanceToTick(sim: Sim, tick: number): void {
  while (sim.state.tick < tick) {
    sim.step();
  }
}

/** Steps for `ticks` ticks and records every event with its tick. */
function record(sim: Sim, ticks: number): RecordedEvent[] {
  const recorded: RecordedEvent[] = [];
  for (let index = 0; index < ticks; index += 1) {
    const tick = sim.state.tick;
    for (const event of sim.step()) {
      recorded.push({ tick, event });
    }
  }
  return recorded;
}

/** Builds an enemy for the pure targeting tests. */
function makeEnemy(id: number, x: number, lane = 0): EnemyState {
  return {
    id,
    enemyId: 'gloomling',
    lane,
    x,
    hp: 200,
    maxHp: 200,
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
}

// Spec 4.3: the straight attack pattern.
describe('straight pattern', () => {
  it('4.3: a straight defender fires at an enemy in range after its 0.5 s drop', () => {
    const sim = createCombatSim();
    placeDefender(sim, SPARKBOLT, 0, 0);
    spawnEnemy(sim, 0, 5);

    advanceToTick(sim, 15);
    expect(sim.state.projectiles).toEqual([]);

    const events = sim.step();
    expect(events.filter((event) => event.type === 'attack')).toHaveLength(1);
    expect(events).toContainEqual({
      type: 'projectileSpawned',
      id: 3,
      kind: 'straight',
      x: 0.5,
      lane: 0,
    });
    expect(sim.state.projectiles).toHaveLength(1);
  });

  it('4.3: the straight projectile moves right at 6 tiles per second and hits the first enemy', () => {
    const sim = createCombatSim();
    placeDefender(sim, SPARKBOLT, 0, 0);
    const enemy = spawnEnemy(sim, 0, 1.5);

    advanceToTick(sim, 15);
    sim.step(); // fires at tick 15; phase 5 already moved the projectile to x = 0.7
    expect(sim.state.projectiles[0]?.x).toBeCloseTo(0.7);
    expect(rules.combat.straightProjectileSpeedTilesPerS / rules.tick.tickRate).toBeCloseTo(0.2);

    const recorded = record(sim, 10);
    const hits = eventsOfType(recorded, 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.event).toEqual({
      type: 'hit',
      targetId: enemy.id,
      amount: 106,
      damageType: 'pierce',
      crit: false,
    });
    expect(enemy.hp).toBe(94);
    expect(eventsOfType(recorded, 'projectileEnded')).toHaveLength(1);
    expect(sim.state.projectiles).toEqual([]);
  });

  it('4.3: projectiles end when they leave the lane without a hit', () => {
    const sim = createCombatSim();
    placeDefender(sim, SPARKBOLT, 0, 0);
    spawnEnemy(sim, 0, 5);

    advanceToTick(sim, 15);
    sim.step();
    sim.state.enemies.length = 0; // the enemy vanishes before the projectile arrives

    const recorded = record(sim, 60);
    expect(eventsOfType(recorded, 'hit')).toHaveLength(0);
    expect(eventsOfType(recorded, 'projectileEnded')).toHaveLength(1);
    expect(sim.state.projectiles).toEqual([]);
  });

  it('5.2: a straight defender fires once per attackIntervalS', () => {
    const sim = createCombatSim();
    placeDefender(sim, SPARKBOLT, 0, 0);
    spawnEnemy(sim, 0, 8, 10000);

    const recorded = record(sim, 120);
    const fireTicks = eventsOfType(recorded, 'projectileSpawned').map((entry) => entry.tick);

    expect(ticksFromSeconds(1.4)).toBe(42);
    expect(fireTicks.slice(0, 2)).toEqual([15, 57]);
  });

  it('4.3: a projectile does not hit enemies behind the defender that fired it', () => {
    const sim = createCombatSim();
    placeDefender(sim, SPARKBOLT, 0, 3); // tile centre x = 3.5
    const behindEnemy = spawnEnemy(sim, 0, 2); // already walked past the tile
    const aheadEnemy = spawnEnemy(sim, 0, 6);

    advanceToTick(sim, 15);
    const recorded = record(sim, 60);
    const hitTargets = eventsOfType(recorded, 'hit').map((entry) => entry.event.targetId);

    expect(hitTargets).toContain(aheadEnemy.id);
    expect(hitTargets).not.toContain(behindEnemy.id);
    expect(behindEnemy.hp).toBe(200);
  });

  it('4.3: projectiles only hit enemies in their own lane', () => {
    const sim = createCombatSim();
    placeDefender(sim, SPARKBOLT, 0, 0);
    spawnEnemy(sim, 0, 8, 10000); // keeps the defender firing
    const otherLaneEnemy = spawnEnemy(sim, 1, 1.5);

    advanceToTick(sim, 15);
    const recorded = record(sim, 100);
    const hitTargets = eventsOfType(recorded, 'hit').map((entry) => entry.event.targetId);

    expect(hitTargets.length).toBeGreaterThan(0);
    expect(hitTargets).not.toContain(otherLaneEnemy.id);
    expect(otherLaneEnemy.hp).toBe(200);
  });
});

// Spec 4.4: target selection.
describe('targeting', () => {
  it('4.4: enemies behind or on the attacker tile are not targeted', () => {
    const fromX = 3.5;
    expect(findTarget([makeEnemy(1, 3.19)], { lane: 0, fromX })).toBeUndefined();
    expect(findTarget([makeEnemy(1, 3.21)], { lane: 0, fromX })?.id).toBe(1);
  });

  it('4.4: the enemy with the smallest x is targeted and ties go to the first spawned', () => {
    const enemies = [makeEnemy(5, 6), makeEnemy(2, 4), makeEnemy(7, 4)];
    expect(findTarget(enemies, { lane: 0, fromX: 0.5 })?.id).toBe(2);
  });

  it('4.4: only enemies inside the range are targeted', () => {
    expect(findTarget([makeEnemy(1, 5)], { lane: 0, fromX: 1, rangeTiles: 3 })).toBeUndefined();
    expect(findTarget([makeEnemy(1, 3.9)], { lane: 0, fromX: 1, rangeTiles: 3 })?.id).toBe(1);
  });

  it('4.4: an omitted range means the whole lane ahead', () => {
    expect(findTarget([makeEnemy(1, 9.5)], { lane: 0, fromX: 0.5 })?.id).toBe(1);
  });

  it('4.4: only enemies in the attacker lane are targeted', () => {
    expect(findTarget([makeEnemy(1, 5.5, 1)], { lane: 0, fromX: 0.5 })).toBeUndefined();
    expect(findTarget([makeEnemy(1, 5.5, 2)], { lane: 2, fromX: 0.5 })?.id).toBe(1);
  });
});

// Spec 3.8 and 4.7: blocking, biting, walls and death.
describe('blocking and biting', () => {
  it('3.8: an enemy walks until a defender blocks it within 0.55 units, then stops', () => {
    const sim = createCombatSim();
    placeDefender(sim, IRON_GRANNY, 0, 3); // tile centre x = 3.5, active at tick 15
    advanceToTick(sim, 15);
    const grannyId = sim.state.defenders[0]?.id;
    const enemy = spawnEnemy(sim, 0, 4.3);

    const walkingEvents = record(sim, 5);
    expect(walkingEvents.filter((entry) => entry.event.type === 'attack')).toHaveLength(0);
    expect(enemy.x).toBeLessThan(4.3);

    while (enemy.blockedByDefenderId === null) {
      sim.step();
    }
    expect(enemy.blockedByDefenderId).toBe(grannyId);
    expect(enemy.x - 3.5).toBeLessThanOrEqual(rules.blocking.blockDistance);

    const xWhenBlocked = enemy.x;
    sim.step();
    expect(enemy.x).toBe(xWhenBlocked);
  });

  it('4.7: a blocked enemy bites every biteIntervalS for biteDamage', () => {
    const sim = createCombatSim();
    placeDefender(sim, IRON_GRANNY, 0, 3);
    advanceToTick(sim, 15);
    const grannyId = sim.state.defenders[0]?.id;
    spawnEnemy(sim, 0, 4.05); // already within the 0.55 blocking distance

    const recorded = record(sim, 16); // ticks 15 and 30
    const bites = eventsOfType(recorded, 'attack');

    expect(ticksFromSeconds(0.5)).toBe(15);
    expect(bites.map((entry) => entry.tick)).toEqual([15, 30]);
    expect(bites[0]?.event).toMatchObject({ type: 'attack', targetId: grannyId });
    expect(sim.state.defenders[0]?.hp).toBe(10000 - 50 * 2);
  });

  it('5.2: a wall blocks enemies but never attacks', () => {
    const sim = createCombatSim();
    placeDefender(sim, IRON_GRANNY, 0, 3);
    advanceToTick(sim, 15);
    spawnEnemy(sim, 0, 4.05);

    const recorded = record(sim, 20);
    const wallId = sim.state.defenders[0]?.id;
    const wallAttacks = eventsOfType(recorded, 'attack').filter(
      (entry) => entry.event.sourceId === wallId,
    );

    expect(wallAttacks).toHaveLength(0);
    expect(eventsOfType(recorded, 'projectileSpawned')).toHaveLength(0);
    expect(sim.state.enemies[0]?.blockedByDefenderId).toBe(wallId);
  });

  it('3.8: when the blocking defender dies the enemy walks on the next tick', () => {
    const sim = createCombatSim();
    placeDefender(sim, IRON_GRANNY, 0, 3);
    advanceToTick(sim, 15);
    const granny = sim.state.defenders[0];
    if (granny === undefined) {
      throw new Error('expected the wall to be placed');
    }
    granny.hp = 50; // the next bite kills it
    const enemy = spawnEnemy(sim, 0, 4.05);

    const events = sim.step();
    expect(events).toContainEqual({ type: 'defenderRemoved', id: granny.id, reason: 'eaten' });
    expect(sim.state.defenders).toEqual([]);
    const xAtDeath = enemy.x;

    sim.step();
    expect(enemy.x).toBeLessThan(xAtDeath);
  });

  it('3.4: a defender that is still dropping neither attacks nor blocks', () => {
    const sim = createCombatSim();
    placeDefender(sim, IRON_GRANNY, 0, 3); // inactive until tick 15
    const enemy = spawnEnemy(sim, 0, 4.2);

    const recorded = record(sim, 13);
    expect(eventsOfType(recorded, 'attack')).toHaveLength(0);
    expect(enemy.x).toBeLessThan(4.2); // it walked on because the wall was not active yet
  });
});

// Spec 3.8 and 4.7: enemies die at 0 hp and are removed.
describe('deaths', () => {
  it('4.2: a hit applies the type multiplier and a dead enemy is removed with enemyDied', () => {
    const sim = createCombatSim();
    placeDefender(sim, SPARKBOLT, 0, 0);
    const enemy = spawnEnemy(sim, 0, 1.5, 25);

    const recorded = record(sim, 60);

    expect(eventsOfType(recorded, 'hit').map((entry) => entry.event.amount)).toEqual([106]);
    expect(eventsOfType(recorded, 'enemyDied')).toHaveLength(1);
    expect(eventsOfType(recorded, 'enemyDied')[0]?.event.id).toBe(enemy.id);
    expect(sim.state.enemies).toEqual([]);
    expect(sim.state.nextId).toBeGreaterThan(enemy.id);
  });
});
