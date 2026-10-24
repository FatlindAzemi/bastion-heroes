import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import { createRng } from '../../src/sim/rng';
import type { DefenderState, LoadoutEntry, OrbState, Sim, SimEvent } from '../../src/sim/types';
import { createTestLevel, type TestLevelOptions } from './testLevel';

const GLOWSHROOM = 'glowshroom_monk';
const SPARKBOLT = 'sparkbolt_gremlin';

const FIRST_DROP_TICK = ticksFromSeconds(rules.essence.firstSkyDropDelayS);
const DROP_INTERVAL_TICKS = ticksFromSeconds(rules.essence.skyDropIntervalS);
const FALL_TICKS = ticksFromSeconds(rules.essence.skyDropFallTimeS);
const LIFETIME_TICKS = ticksFromSeconds(rules.essence.orbLifetimeS);
const AUTO_COLLECT_TICKS = ticksFromSeconds(rules.essence.autoCollectDelayS);

/** Creates a sim; sky drops are off unless the test asks for them. */
function createTestSim(options: TestLevelOptions = {}, loadout: LoadoutEntry[] = []): Sim {
  return createSim(
    createTestLevel({ skyDrops: false, firstWaveDelay: 60, ...options }),
    loadout,
    10001,
  );
}

/** Steps exactly `ticks` ticks and returns all events of those ticks. */
function advance(sim: Sim, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let index = 0; index < ticks; index += 1) {
    events.push(...sim.step());
  }
  return events;
}

/** Steps until the given tick is reached; the next `step()` then runs that tick's phases. */
function advanceToTick(sim: Sim, tick: number): SimEvent[] {
  return advance(sim, tick - sim.state.tick);
}

/** Spawns and returns the first sky drop of a sky-drop level (spec 3.3). */
function spawnFirstSkyDrop(sim: Sim): OrbState {
  advanceToTick(sim, FIRST_DROP_TICK);
  advance(sim, 1);
  const orb = sim.state.orbs[0];
  if (orb === undefined) {
    throw new Error('expected a sky drop');
  }
  return orb;
}

/** Places one Glowshroom Monk at lane 1, column 2 and returns it (spec 5.2). */
function placeProducer(): { sim: Sim; defender: DefenderState } {
  const sim = createTestSim({ startEssence: 999, skyDrops: false }, [
    { defenderId: GLOWSHROOM, level: 1 },
  ]);
  sim.enqueue({ type: 'place', defenderId: GLOWSHROOM, lane: 1, col: 2 });
  sim.step();
  const defender = sim.state.defenders[0];
  if (defender === undefined) {
    throw new Error('expected the producer');
  }
  return { sim, defender };
}

// Spec 3.3: Essence, sky drops, orbs, collection, auto-collect and expiry.
describe('sky drops and orb lifecycle', () => {
  it('3.3: the first sky drop spawns 4.0 s after level start', () => {
    const sim = createTestSim({ skyDrops: true });

    expect(FIRST_DROP_TICK).toBe(120);
    advanceToTick(sim, FIRST_DROP_TICK);
    expect(sim.state.orbs).toEqual([]);

    const events = advance(sim, 1);
    expect(events.filter((event) => event.type === 'orbSpawned')).toHaveLength(1);
    expect(sim.state.orbs).toHaveLength(1);
    expect(sim.state.orbs[0]?.spawnTick).toBe(FIRST_DROP_TICK);
    expect(sim.state.orbs[0]?.value).toBe(rules.essence.skyDropAmount);
  });

  it('3.3: sky drops repeat every 8.0 s', () => {
    const sim = createTestSim({ skyDrops: true });
    const first = spawnFirstSkyDrop(sim);

    advanceToTick(sim, FIRST_DROP_TICK + DROP_INTERVAL_TICKS);
    const events = advance(sim, 1);

    expect(events.filter((event) => event.type === 'orbSpawned')).toHaveLength(1);
    expect(sim.state.orbs.map((orb) => orb.spawnTick)).toEqual([
      first.spawnTick,
      first.spawnTick + DROP_INTERVAL_TICKS,
    ]);
  });

  it('3.3: an orb falls for 1.0 s and expires 8.0 s after landing', () => {
    const sim = createTestSim({ skyDrops: true });
    const orb = spawnFirstSkyDrop(sim);

    expect(orb.landTick).toBe(orb.spawnTick + FALL_TICKS);
    expect(orb.expiresAtTick).toBe(orb.landTick + LIFETIME_TICKS);

    advanceToTick(sim, orb.expiresAtTick);
    expect(sim.state.orbs.map((current) => current.id)).toContain(orb.id);

    const events = advance(sim, 1);
    expect(events).toContainEqual({ type: 'orbExpired', id: orb.id });
    expect(sim.state.orbs.map((current) => current.id)).not.toContain(orb.id);
  });

  it('3.3: collecting an orb adds its value immediately and removes it', () => {
    const sim = createTestSim({ skyDrops: true, startEssence: 100 });
    const orb = spawnFirstSkyDrop(sim);
    const essenceBefore = sim.state.essence;

    sim.enqueue({ type: 'collectOrb', orbId: orb.id });
    const events = sim.step();

    expect(events).toContainEqual({ type: 'orbCollected', id: orb.id });
    expect(sim.state.essence).toBe(essenceBefore + orb.value);
    expect(orb.value).toBe(rules.essence.skyDropAmount);
    expect(sim.state.orbs.map((current) => current.id)).not.toContain(orb.id);
  });

  it('3.3: collecting never pushes Essence above the 9,990 maximum', () => {
    const sim = createTestSim({
      skyDrops: true,
      startEssence: rules.essence.maxEssence - 10,
    });
    const orb = spawnFirstSkyDrop(sim);

    sim.enqueue({ type: 'collectOrb', orbId: orb.id });
    sim.step();

    expect(sim.state.essence).toBe(rules.essence.maxEssence);
  });

  it('3.3: tapping an orb that is already gone changes nothing', () => {
    const sim = createTestSim({ skyDrops: true, startEssence: 100 });
    const orb = spawnFirstSkyDrop(sim);

    sim.enqueue({ type: 'collectOrb', orbId: orb.id });
    sim.enqueue({ type: 'collectOrb', orbId: orb.id });
    const events = sim.step();

    expect(events.filter((event) => event.type === 'orbCollected')).toHaveLength(1);
    expect(sim.state.essence).toBe(100 + orb.value);
  });

  it('3.3: night levels spawn no sky drops', () => {
    const sim = createTestSim({ skyDrops: false });

    const events = advance(sim, ticksFromSeconds(30));

    expect(events.filter((event) => event.type === 'orbSpawned')).toHaveLength(0);
    expect(sim.state.orbs).toEqual([]);
  });

  it('3.3: the drop tile comes from the seeded rng and uses active lanes only', () => {
    const sim = createTestSim({ skyDrops: true, activeLanes: [0, 2, 4] });
    const orb = spawnFirstSkyDrop(sim);

    // Documented order: the rng picks the lane first, then the column.
    const expectedRng = createRng(10001);
    const expectedLane = [0, 2, 4][Math.floor(expectedRng.next() * 3)];
    const expectedColumn = Math.floor(expectedRng.next() * rules.grid.columnCount);
    expect(orb.lane).toBe(expectedLane);
    expect(orb.x).toBe(expectedColumn + 0.5);

    const replay = createTestSim({ skyDrops: true, activeLanes: [0, 2, 4] });
    expect(spawnFirstSkyDrop(replay)).toEqual(orb);
  });

  it('3.3: auto-collect picks up landed orbs 1.0 s after landing', () => {
    const sim = createTestSim({ skyDrops: true, startEssence: 100 });
    sim.enqueue({ type: 'setAutoCollect', on: true });
    const orb = spawnFirstSkyDrop(sim);

    advanceToTick(sim, orb.landTick);
    expect(sim.state.orbs.map((current) => current.id)).toContain(orb.id);

    advanceToTick(sim, orb.landTick + AUTO_COLLECT_TICKS);
    expect(sim.state.orbs.map((current) => current.id)).toContain(orb.id);

    const events = advance(sim, 1);
    expect(events).toContainEqual({ type: 'orbCollected', id: orb.id });
    expect(sim.state.essence).toBe(100 + orb.value);
  });

  it('3.3: auto-collect is off by default, so landed orbs wait for a tap', () => {
    const sim = createTestSim({ skyDrops: true });
    const orb = spawnFirstSkyDrop(sim);

    advanceToTick(sim, orb.landTick + AUTO_COLLECT_TICKS + 10);

    expect(sim.state.orbs.map((current) => current.id)).toContain(orb.id);
    expect(sim.state.essence).toBe(150);
  });
});

// Spec 5.2 and 3.3: producer defenders drop Essence orbs on their own tile.
describe('producer orbs', () => {
  it('5.2: glowshroom_monk drops its first orb 7.0 s after placement', () => {
    const { sim, defender } = placeProducer();
    const firstOrbTick = ticksFromSeconds(5);
    expect(defender.nextOrbTick).toBe(firstOrbTick);

    advanceToTick(sim, firstOrbTick);
    expect(sim.state.orbs).toEqual([]);

    const events = advance(sim, 1);
    expect(events.filter((event) => event.type === 'orbSpawned')).toHaveLength(1);
    expect(sim.state.orbs[0]).toMatchObject({
      lane: 1,
      x: 2.5,
      value: 70,
      spawnTick: firstOrbTick,
      landTick: firstOrbTick + FALL_TICKS,
      expiresAtTick: firstOrbTick + FALL_TICKS + LIFETIME_TICKS,
    });
  });

  it('5.2: glowshroom_monk drops one orb every 24 s after the first', () => {
    const { sim, defender } = placeProducer();
    const firstOrbTick = defender.nextOrbTick;
    if (firstOrbTick === null) {
      throw new Error('expected a producer orb timer');
    }
    advanceToTick(sim, firstOrbTick);
    advance(sim, 1);

    const nextOrbTick = firstOrbTick + ticksFromSeconds(14);
    expect(defender.nextOrbTick).toBe(nextOrbTick);

    advanceToTick(sim, nextOrbTick);
    const events = advance(sim, 1);
    expect(events.filter((event) => event.type === 'orbSpawned')).toHaveLength(1);
    expect(sim.state.orbs.map((orb) => orb.spawnTick)).toEqual([nextOrbTick]);
    expect(sim.state.orbs[0]).toMatchObject({ lane: 1, x: 2.5, value: 70 });
  });

  it('3.4: producers only drop orbs after their 0.5 s drop', () => {
    const { sim, defender } = placeProducer();
    defender.nextOrbTick = 5;

    advanceToTick(sim, 5);
    const inactiveEvents = advance(sim, 1);
    expect(inactiveEvents.filter((event) => event.type === 'orbSpawned')).toHaveLength(0);
    expect(sim.state.orbs).toEqual([]);

    advanceToTick(sim, 15);
    const activeEvents = advance(sim, 1);
    expect(activeEvents.filter((event) => event.type === 'orbSpawned')).toHaveLength(1);
    expect(sim.state.orbs[0]?.spawnTick).toBe(15);
  });

  it('11.3: orb ids come from the same counter as defenders', () => {
    const sim = createTestSim({ skyDrops: true }, [{ defenderId: SPARKBOLT, level: 1 }]);
    const orb = spawnFirstSkyDrop(sim);
    expect(orb.id).toBe(1);

    sim.enqueue({ type: 'place', defenderId: SPARKBOLT, lane: 0, col: 0 });
    const events = sim.step();

    expect(events).toContainEqual({
      type: 'defenderPlaced',
      id: 2,
      defenderId: SPARKBOLT,
      lane: 0,
      col: 0,
      stars: 1,
    });
  });
});
