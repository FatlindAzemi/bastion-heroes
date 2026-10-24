import { describe, expect, it } from 'vitest';

import { createSim } from '../../src/sim/createSim';
import type { LevelDef, LoadoutEntry, Sim } from '../../src/sim/types';

// Minimal level definition fixture until the Zod LevelDef schema lands in issue #17.
const testLevel: LevelDef = { id: 'test_level', startEssence: 150 };
const testLoadout: LoadoutEntry[] = [{ defenderId: 'sparkbolt_gremlin', level: 1 }];

function createTestSim(seed = 10001): Sim {
  return createSim(testLevel, testLoadout, seed);
}

// Spec 11.3: createSim and the fixed tick skeleton of the simulation contract.
describe('createSim', () => {
  it('11.3: starts at tick 0 with empty entity lists and the id counter at 1', () => {
    const sim = createTestSim();

    expect(sim.state.tick).toBe(0);
    expect(sim.state.defenders).toEqual([]);
    expect(sim.state.enemies).toEqual([]);
    expect(sim.state.projectiles).toEqual([]);
    expect(sim.state.orbs).toEqual([]);
    expect(sim.state.nextId).toBe(1);
  });

  it('11.3: exposes the level id, the seed and the loadout of the run', () => {
    const sim = createTestSim(10001);

    expect(sim.state.levelId).toBe('test_level');
    expect(sim.state.seed).toBe(10001);
    expect(sim.state.loadout).toEqual(testLoadout);
    expect(sim.state.rng.state).toBe(10001);
  });

  it('3.3: starts with the level starting Essence and with auto-collect off', () => {
    const sim = createSim({ id: 'other_level', startEssence: 200 }, [], 1);

    expect(sim.state.essence).toBe(200);
    expect(sim.state.autoCollect).toBe(false);
  });

  it('11.3: step advances exactly one tick and returns the events of that tick', () => {
    const sim = createTestSim();

    expect(sim.step()).toEqual([]);
    expect(sim.state.tick).toBe(1);

    expect(sim.step()).toEqual([]);
    expect(sim.state.tick).toBe(2);
  });

  it('11.3: queued commands are applied in order at the start of the next tick', () => {
    const sim = createTestSim();

    sim.enqueue({ type: 'setAutoCollect', on: true });
    sim.enqueue({ type: 'setAutoCollect', on: false });
    sim.enqueue({ type: 'setAutoCollect', on: true });

    // Commands wait for the next tick instead of being applied immediately.
    expect(sim.state.autoCollect).toBe(false);

    sim.step();
    expect(sim.state.autoCollect).toBe(true);

    sim.enqueue({ type: 'setAutoCollect', on: false });
    sim.step();
    expect(sim.state.autoCollect).toBe(false);
  });

  it('11.3: commands queued during a tick are applied on the next tick', () => {
    const sim = createTestSim();

    for (let tick = 0; tick < 30; tick += 1) {
      sim.step();
    }
    sim.enqueue({ type: 'setAutoCollect', on: true });

    expect(sim.state.tick).toBe(30);
    expect(sim.state.autoCollect).toBe(false);

    sim.step();
    expect(sim.state.tick).toBe(31);
    expect(sim.state.autoCollect).toBe(true);
  });

  it('11.6: the same level, seed and inputs produce the same state', () => {
    const first = createTestSim(42);
    const second = createTestSim(42);

    for (let tick = 0; tick < 30; tick += 1) {
      const command = { type: 'setAutoCollect', on: tick % 2 === 0 } as const;
      first.enqueue(command);
      second.enqueue(command);
      first.step();
      second.step();
    }

    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
  });
});
