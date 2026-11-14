import { describe, expect, it } from 'vitest';
import { duelRules, enemyById } from '../../../src/data';
import type { DuelRaiderState, DuelSim, Side } from '../../../src/sim/duel';
import {
  addRaider,
  createStartedSim,
  defenderAt,
  eventsOfType,
  playDefender,
  playRaider,
  raiderStepTiles,
  raidersOf,
  stepTicks,
  ticks,
} from './duelTestKit';

const GLOOMLING_STEP = raiderStepTiles('gloomling');
const GLOOMLING_DAMAGE = enemyById['gloomling']?.biteDamage ?? 0;
const GLOOMLING_INTERVAL_TICKS = ticks(enemyById['gloomling']?.biteIntervalS ?? 0);
const BLOCK_DISTANCE = duelRules.raiders.raiderBlockDistance;

/** Steps until the raider is blocked by a defender or a raider; fails after `maxTicks`. */
function stepUntilBlocked(sim: DuelSim, raider: DuelRaiderState, maxTicks = 600): void {
  for (let index = 0; index < maxTicks; index += 1) {
    if (raider.blockedByDefenderId !== null || (raider.blockedByEnemyId ?? null) !== null) {
      return;
    }
    sim.step();
  }
  throw new Error('the raider was never blocked');
}

describe('raider movement (spec 18.6, 18.1)', () => {
  it('walks forward at speed x 1.5: south towards +x, north towards -x', () => {
    const sim = createStartedSim();
    const south = addRaider(sim, 'south', 'gloomling', 0, 2);
    const north = addRaider(sim, 'north', 'gloomling', 1, 7);
    stepTicks(sim, 30);
    const speed = enemyById['gloomling']?.speed ?? 0;
    expect(duelRules.raiders.speedMultiplier).toBe(1.5);
    expect(south.x).toBeCloseTo(2 + speed * 1.5, 10);
    expect(north.x).toBeCloseTo(7 - speed * 1.5, 10);
  });

  it.each<[Side, number, number]>([
    ['south', 8.99, 1],
    ['north', 0.01, 3],
  ])('a %s raider that reaches the enemy base line leaves the lane', (side, x, lane) => {
    const sim = createStartedSim();
    const raider = addRaider(sim, side, 'gloomling', lane, x);
    const events = stepTicks(sim, 3);
    expect(eventsOfType(events, 'raiderReachedBase')).toEqual([
      { type: 'raiderReachedBase', side, id: raider.id, enemyId: 'gloomling', lane },
    ]);
    expect(eventsOfType(events, 'enemyDied')).toEqual([]);
    expect(sim.state.enemies).toEqual([]);
    // Gates and traps arrive with #125: nothing else happens yet.
    expect(sim.state.sides.south.gateHealth).toBe(duelRules.gate.gateHealth);
    expect(sim.state.sides.north.gateHealth).toBe(duelRules.gate.gateHealth);
  });
});

describe('raiders against defenders (spec 18.6, 3.8, 4.7)', () => {
  it.each<[Side, Side, number, number]>([
    ['north', 'south', 3, 4.3],
    ['south', 'north', 5, 4.7],
  ])('a %s raider is blocked by a ground defender of %s and eats it', (side, owner, col, x) => {
    const sim = createStartedSim();
    playDefender(sim, owner, 'iron_granny', 0, col);
    stepTicks(sim, ticks(0.5));
    const granny = defenderAt(sim, 0, col);
    const raider = addRaider(sim, side, 'gloomling', 0, x);

    stepUntilBlocked(sim, raider);
    expect(raider.blockedByDefenderId).toBe(granny.id);
    const distance = Math.abs(raider.x - (col + 0.5));
    expect(distance).toBeLessThanOrEqual(0.55);
    expect(distance).toBeGreaterThan(0.55 - 2 * GLOOMLING_STEP);

    // It bit once when it got blocked, then bites every attack interval.
    expect(granny.hp).toBe(granny.maxHp - GLOOMLING_DAMAGE);
    const stoppedX = raider.x;
    const events = stepTicks(sim, 2 * GLOOMLING_INTERVAL_TICKS);
    expect(raider.x).toBe(stoppedX);
    expect(granny.hp).toBe(granny.maxHp - 3 * GLOOMLING_DAMAGE);
    expect(eventsOfType(events, 'attack')).toEqual([
      { type: 'attack', side, sourceId: raider.id, targetId: granny.id },
      { type: 'attack', side, sourceId: raider.id, targetId: granny.id },
    ]);
  });

  it('continues walking on the tick after the blocking defender died', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'iron_granny', 0, 3);
    stepTicks(sim, ticks(0.5));
    const granny = defenderAt(sim, 0, 3);
    const raider = addRaider(sim, 'north', 'gloomling', 0, 4.0);
    granny.hp = GLOOMLING_DAMAGE;

    const events = sim.step();
    expect(eventsOfType(events, 'defenderRemoved')).toEqual([
      { type: 'defenderRemoved', side: 'south', id: granny.id, reason: 'eaten' },
    ]);
    sim.step();
    expect(raider.blockedByDefenderId).toBeNull();
    expect(raider.x).toBeCloseTo(4.0 - GLOOMLING_STEP, 10);
  });

  it('is not blocked by a defender of its own side', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'iron_granny', 0, 3);
    stepTicks(sim, ticks(0.5));
    const raider = addRaider(sim, 'south', 'gloomling', 0, 3.2);
    stepTicks(sim, 60);
    expect(raider.blockedByDefenderId).toBeNull();
    expect(raider.x).toBeCloseTo(3.2 + 60 * GLOOMLING_STEP, 10);
    expect(defenderAt(sim, 0, 3).hp).toBe(defenderAt(sim, 0, 3).maxHp);
  });

  it('defenders of both sides hit the walking raiders of the other side', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    playDefender(sim, 'north', 'sparkbolt_gremlin', 4, 8);
    playRaider(sim, 'north', 'pothead', 0);
    playRaider(sim, 'south', 'pothead', 4);
    const events = stepTicks(sim, 300);

    const [southRaider] = raidersOf(sim, 'south');
    const [northRaider] = raidersOf(sim, 'north');
    const hits = eventsOfType(events, 'hit');
    expect(hits.filter((hit) => hit.targetId === northRaider?.id).length).toBeGreaterThan(0);
    expect(hits.filter((hit) => hit.targetId === southRaider?.id).length).toBeGreaterThan(0);
    // Both defenders are equally far from the spawn point they shoot at: equal damage.
    expect(southRaider?.hp).toBe(northRaider?.hp);
    expect(southRaider?.hp).toBeLessThan(southRaider?.maxHp ?? 0);
    expect(
      hits.every((hit) => hit.side === (hit.targetId === southRaider?.id ? 'south' : 'north')),
    ).toBe(true);
  });

  it('a Shieldbearer raider takes straight shots on its shield first, on both sides', () => {
    const sim = createStartedSim();
    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 6);
    playDefender(sim, 'south', 'sparkbolt_gremlin', 1, 2);
    const south = addRaider(sim, 'south', 'shieldbearer', 0, 3);
    const north = addRaider(sim, 'north', 'shieldbearer', 1, 6);
    stepTicks(sim, 150);
    for (const raider of [south, north]) {
      expect(raider.shieldHp).toBeLessThan(enemyById['shieldbearer']?.shieldHp ?? 0);
      expect(raider.hp).toBe(raider.maxHp);
    }
  });
});

describe('raider against raider (spec 18.6)', () => {
  it('two enemy ground raiders within 0.55 block each other and fight', () => {
    const sim = createStartedSim();
    const south = addRaider(sim, 'south', 'gloomling', 2, 4);
    const north = addRaider(sim, 'north', 'gloomling', 2, 5);
    stepUntilBlocked(sim, south);

    expect(south.blockedByEnemyId).toBe(north.id);
    expect(north.blockedByEnemyId).toBe(south.id);
    const distance = north.x - south.x;
    expect(distance).toBeLessThanOrEqual(BLOCK_DISTANCE);
    expect(distance).toBeGreaterThan(BLOCK_DISTANCE - 2 * GLOOMLING_STEP);
    // Both hit when they met, then with their attack damage every attack interval.
    expect([south.hp, north.hp]).toEqual([
      south.maxHp - GLOOMLING_DAMAGE,
      north.maxHp - GLOOMLING_DAMAGE,
    ]);
    const positions = [south.x, north.x];
    const events = stepTicks(sim, GLOOMLING_INTERVAL_TICKS);
    expect([south.x, north.x]).toEqual(positions);
    expect(eventsOfType(events, 'attack')).toEqual([
      { type: 'attack', side: 'south', sourceId: south.id, targetId: north.id },
      { type: 'attack', side: 'north', sourceId: north.id, targetId: south.id },
    ]);
    expect(south.hp).toBe(south.maxHp - 2 * GLOOMLING_DAMAGE);
  });

  it('they fight until one dies; the survivor walks on', () => {
    const sim = createStartedSim();
    const south = addRaider(sim, 'south', 'gloomling', 2, 4.3);
    const north = addRaider(sim, 'north', 'gloomling', 2, 4.7);
    south.hp = 2 * GLOOMLING_DAMAGE;

    const events = stepTicks(sim, GLOOMLING_INTERVAL_TICKS + 1);
    expect(eventsOfType(events, 'enemyDied')).toEqual([
      { type: 'enemyDied', side: 'south', id: south.id },
    ]);
    expect(north.hp).toBe(north.maxHp - 2 * GLOOMLING_DAMAGE);
    const x = north.x;
    sim.step();
    expect(north.blockedByEnemyId).toBeNull();
    expect(north.x).toBeCloseTo(x - GLOOMLING_STEP, 10);
  });

  it('hits land together: two equal raiders die on the same tick', () => {
    const sim = createStartedSim();
    const south = addRaider(sim, 'south', 'gloomling', 2, 4.3);
    const north = addRaider(sim, 'north', 'gloomling', 2, 4.7);
    south.hp = GLOOMLING_DAMAGE;
    north.hp = GLOOMLING_DAMAGE;
    const events = sim.step();
    expect(eventsOfType(events, 'enemyDied')).toHaveLength(2);
    expect(sim.state.enemies).toEqual([]);
  });

  it('raiders of the same side do not block each other', () => {
    const sim = createStartedSim();
    const first = addRaider(sim, 'south', 'gloomling', 2, 4);
    const second = addRaider(sim, 'south', 'gloom_priest', 2, 4.1);
    const events = stepTicks(sim, 30);
    expect(first.x).toBeCloseTo(4 + 30 * GLOOMLING_STEP, 10);
    expect(second.blockedByEnemyId ?? null).toBeNull();
    expect(eventsOfType(events, 'attack')).toEqual([]);
  });

  it('raiders in different lanes do not block each other', () => {
    const sim = createStartedSim();
    const south = addRaider(sim, 'south', 'gloomling', 1, 4.3);
    addRaider(sim, 'north', 'gloomling', 2, 4.7);
    const events = stepTicks(sim, 10);
    expect(south.x).toBeCloseTo(4.3 + 10 * GLOOMLING_STEP, 10);
    expect(eventsOfType(events, 'attack')).toEqual([]);
  });

  it('fights an enemy raider in reach before it eats a defender', () => {
    const sim = createStartedSim();
    playDefender(sim, 'north', 'iron_granny', 0, 5);
    stepTicks(sim, ticks(0.5));
    const south = addRaider(sim, 'south', 'gloomling', 0, 5.0);
    const north = addRaider(sim, 'north', 'gloomling', 0, 5.3);
    sim.step();
    expect(south.blockedByEnemyId).toBe(north.id);
    expect(south.blockedByDefenderId).toBeNull();
    expect(defenderAt(sim, 0, 5).hp).toBe(defenderAt(sim, 0, 5).maxHp);
  });

  it('raider attacks ignore the 4.1 table: full damage against Armored and Spectral', () => {
    const sim = createStartedSim();
    const pothead = addRaider(sim, 'north', 'pothead', 0, 4.7);
    addRaider(sim, 'south', 'gloomling', 0, 4.3);
    const wisp = addRaider(sim, 'north', 'shade_wisp', 1, 4.7);
    addRaider(sim, 'south', 'gloomling', 1, 4.3);
    sim.step();
    expect(duelRules.raiders.attackDamageMultiplier).toBe(1);
    expect(pothead.hp).toBe(pothead.maxHp - GLOOMLING_DAMAGE);
    expect(wisp.hp).toBe(wisp.maxHp - GLOOMLING_DAMAGE);
  });
});

describe('flying raiders (spec 18.6)', () => {
  it('a Bat Swarm is never blocked and never fights', () => {
    const sim = createStartedSim();
    playDefender(sim, 'north', 'iron_granny', 0, 5);
    stepTicks(sim, ticks(0.5));
    const bat = addRaider(sim, 'south', 'bat_swarm', 0, 5.2);
    const ground = addRaider(sim, 'north', 'gloomling', 0, 5.4);
    const events = stepTicks(sim, 100);

    expect(bat.x).toBeCloseTo(5.2 + 100 * raiderStepTiles('bat_swarm'), 10);
    expect(bat.blockedByDefenderId).toBeNull();
    expect(bat.blockedByEnemyId ?? null).toBeNull();
    // The ground raider walks on under the bats.
    expect(ground.x).toBeCloseTo(5.4 - 100 * GLOOMLING_STEP, 10);
    expect(eventsOfType(events, 'attack')).toEqual([]);
    expect(bat.hp).toBe(bat.maxHp);
  });
});

describe('section 6 specials in the Duel (spec 18.6, 6.2)', () => {
  it.each<Side>(['south', 'north'])('a %s Gloom Priest heals only own raiders', (side) => {
    const sim = createStartedSim();
    const other: Side = side === 'south' ? 'north' : 'south';
    const priest = addRaider(sim, side, 'gloom_priest', 2, 4.5);
    const own = addRaider(sim, side, 'gloomling', 2, 4.5);
    const enemy = addRaider(sim, other, 'gloomling', 1, 4.5);
    priest.hp = 100;
    own.hp = 1000;
    enemy.hp = 1000;
    stepTicks(sim, ticks(enemyById['gloom_priest']?.healIntervalS ?? 0) + 1);
    expect(own.hp).toBe(1000 + (enemyById['gloom_priest']?.healAmount ?? 0));
    expect(enemy.hp).toBe(1000);
    expect(priest.hp).toBe(100);
  });

  it.each<[Side, number, number]>([
    ['south', 3, 6],
    ['north', 6, 3],
  ])('a %s Gloom Ogre throws its Gloomling 3 tiles forward', (side, ogreX, landingX) => {
    const sim = createStartedSim();
    const ogre = addRaider(sim, side, 'gloom_ogre', 0, ogreX);
    ogre.hp = ogre.maxHp * (enemyById['gloom_ogre']?.throwAtHealthRatio ?? 0);
    const events = sim.step();

    expect(duelRules.raiders.ogreThrowDistanceTiles).toBe(3);
    const [spawned] = eventsOfType(events, 'enemySpawned');
    expect(spawned).toEqual({
      type: 'enemySpawned',
      side,
      id: expect.any(Number),
      enemyId: 'gloomling',
      lane: 0,
    });
    const thrown = sim.state.enemies.find((raider) => raider.id === spawned?.id);
    expect(thrown).toMatchObject({ side, lane: 0, x: landingX });
    // It throws once, and the Gloomling walks forward from the next tick on.
    const later = stepTicks(sim, 10);
    expect(eventsOfType(later, 'enemySpawned')).toEqual([]);
    const forward = side === 'south' ? 1 : -1;
    expect(thrown?.x).toBeCloseTo(landingX + forward * 10 * GLOOMLING_STEP, 10);
  });

  it('a Pot-Head raider loses its pot at the break health in a raider fight', () => {
    const sim = createStartedSim();
    const pothead = addRaider(sim, 'north', 'pothead', 0, 4.7);
    addRaider(sim, 'south', 'gloomling', 0, 4.3);
    pothead.hp = (enemyById['pothead']?.armorBreakHp ?? 0) + GLOOMLING_DAMAGE;
    sim.step();
    expect(pothead.armorBroken).toBe(false);
    sim.step();
    expect(pothead.armorBroken).toBe(true);
  });

  it('a raider attack hits the body of a Shieldbearer, not its shield', () => {
    const sim = createStartedSim();
    const shieldbearer = addRaider(sim, 'north', 'shieldbearer', 0, 4.7);
    addRaider(sim, 'south', 'gloomling', 0, 4.3);
    sim.step();
    expect(shieldbearer.hp).toBe(shieldbearer.maxHp - GLOOMLING_DAMAGE);
    expect(shieldbearer.shieldHp).toBe(enemyById['shieldbearer']?.shieldHp);
  });

  it('Burrower and Shadow Hound have no data yet: their cards are rejected (#138)', () => {
    const sim = createStartedSim();
    for (const cardId of ['burrower', 'shadow_hound']) {
      expect(enemyById[cardId]).toBeUndefined();
      expect(eventsOfType(playRaider(sim, 'south', cardId, 0), 'commandRejected')).toHaveLength(1);
    }
  });
});
