import { describe, expect, it } from 'vitest';

import { enemyById, rules } from '../../src/data';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import type { Sim, SimEvent } from '../../src/sim/types';
import { createTestLevel, type TestLevelOptions, type TestWave } from './testLevel';

type EnemySpawnedEvent = Extract<SimEvent, { type: 'enemySpawned' }>;
type WaveStartedEvent = Extract<SimEvent, { type: 'waveStarted' }>;
type WaveBannerEvent = Extract<SimEvent, { type: 'waveBanner' }>;

interface RecordedEvent {
  tick: number;
  event: SimEvent;
}

/** Creates a sim with sky drops off, so only wave spawns use the shared id counter. */
function createWaveSim(options: TestLevelOptions = {}, seed = 10001): Sim {
  return createSim(createTestLevel({ skyDrops: false, ...options }), [], seed);
}

/** Steps until `tick` is reached; the next `step()` then runs that tick's phases. */
function advanceToTick(sim: Sim, tick: number): void {
  while (sim.state.tick < tick) {
    sim.step();
  }
}

/** Steps for `ticks` ticks and records every event with the tick that emitted it. */
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

/** The enemySpawned events of a recording, with their ticks. */
function enemySpawns(recorded: RecordedEvent[]): { tick: number; event: EnemySpawnedEvent }[] {
  return recorded.filter(
    (entry): entry is { tick: number; event: EnemySpawnedEvent } =>
      entry.event.type === 'enemySpawned',
  );
}

/** The waveStarted events of a recording, with their ticks. */
function waveStarts(recorded: RecordedEvent[]): { tick: number; event: WaveStartedEvent }[] {
  return recorded.filter(
    (entry): entry is { tick: number; event: WaveStartedEvent } =>
      entry.event.type === 'waveStarted',
  );
}

/** The waveBanner events of a recording, with their ticks. */
function waveBanners(recorded: RecordedEvent[]): { tick: number; event: WaveBannerEvent }[] {
  return recorded.filter(
    (entry): entry is { tick: number; event: WaveBannerEvent } => entry.event.type === 'waveBanner',
  );
}

const oneEnemyWave: TestWave = {
  duration: 10,
  spawnGap: 5,
  spawns: [{ enemy: 'gloomling', count: 1, lanes: [2] }],
};

// Spec 3.10 and 7.1: wave timing, spawn lists, lane rules and banner events.
describe('waves', () => {
  it('3.10: the first wave starts after the level firstWaveDelay', () => {
    const sim = createWaveSim({ firstWaveDelay: 2, waves: [oneEnemyWave] });

    advanceToTick(sim, ticksFromSeconds(2));
    expect(sim.state.wave.index).toBe(-1);

    const events = sim.step();
    expect(events).toContainEqual({ type: 'waveStarted', index: 0, kind: 'normal' });
    expect(sim.state.wave.index).toBe(0);
  });

  it('3.10: firstWaveDelay defaults to 20 s', () => {
    const sim = createWaveSim({ waves: [oneEnemyWave] });

    expect(ticksFromSeconds(20)).toBe(600);
    advanceToTick(sim, ticksFromSeconds(20));
    expect(sim.state.wave.index).toBe(-1);

    sim.step();
    expect(sim.state.wave.index).toBe(0);
  });

  it('7.1: one enemy spawns every spawnGap of the wave', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      waves: [
        {
          duration: 10,
          spawnGap: 1,
          spawns: [{ enemy: 'gloomling', count: 3, lanes: [1] }],
        },
      ],
    });

    const spawns = enemySpawns(record(sim, 200));

    expect(spawns.map((entry) => entry.tick)).toEqual([30, 60, 90]);
    expect(spawns.map((entry) => entry.event.lane)).toEqual([1, 1, 1]);
    expect(spawns.map((entry) => entry.event.id)).toEqual([1, 2, 3]);
  });

  it('7.1: the spawn list is shuffled deterministically with the level seed', () => {
    const waves: TestWave[] = [
      {
        duration: 20,
        spawnGap: 0.1,
        spawns: [{ enemy: 'gloomling', count: 6, lanes: 'random' }],
      },
    ];
    const options: TestLevelOptions = { firstWaveDelay: 1, waves };

    const firstLanes = enemySpawns(record(createWaveSim(options), 200)).map(
      (entry) => entry.event.lane,
    );
    const secondLanes = enemySpawns(record(createWaveSim(options), 200)).map(
      (entry) => entry.event.lane,
    );
    const otherSeedLanes = enemySpawns(record(createWaveSim(options, 424242), 200)).map(
      (entry) => entry.event.lane,
    );

    expect(firstLanes).toHaveLength(6);
    expect(secondLanes).toEqual(firstLanes);
    expect(otherSeedLanes).not.toEqual(firstLanes);
  });

  it('7.1: random lanes use active lanes and never repeat a lane three times in a row', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      activeLanes: [0, 1, 2],
      waves: [
        {
          duration: 20,
          spawnGap: 0.1,
          spawns: [{ enemy: 'gloomling', count: 12, lanes: 'random' }],
        },
      ],
    });

    const lanes = enemySpawns(record(sim, 400)).map((entry) => entry.event.lane);

    expect(lanes).toHaveLength(12);
    for (const lane of lanes) {
      expect([0, 1, 2]).toContain(lane);
    }
    for (let index = 2; index < lanes.length; index += 1) {
      const previous = lanes[index - 1];
      const beforePrevious = lanes[index - 2];
      expect(lanes[index] === previous && previous === beforePrevious).toBe(false);
    }
    expect(new Set(lanes).size).toBeGreaterThan(1);
  });

  it('7.1: with a single active lane random spawns all use that lane', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      activeLanes: [2],
      waves: [
        {
          duration: 20,
          spawnGap: 0.1,
          spawns: [{ enemy: 'gloomling', count: 4, lanes: 'random' }],
        },
      ],
    });

    const lanes = enemySpawns(record(sim, 100)).map((entry) => entry.event.lane);

    expect(lanes).toEqual([2, 2, 2, 2]);
  });

  it('7.1: a fixed lane list only spawns on its lanes', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      waves: [
        {
          duration: 20,
          spawnGap: 0.1,
          spawns: [{ enemy: 'gloomling', count: 8, lanes: [1, 3] }],
        },
      ],
    });

    const lanes = enemySpawns(record(sim, 100)).map((entry) => entry.event.lane);

    expect(lanes).toHaveLength(8);
    for (const lane of lanes) {
      expect([1, 3]).toContain(lane);
    }
  });

  it('3.10: the next wave starts after the current wave duration', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      waves: [
        {
          duration: 2,
          spawnGap: 1,
          spawns: [{ enemy: 'gloomling', count: 1, lanes: [1] }],
        },
        { flag: 'final', duration: 0, spawnGap: 1, spawns: [] },
      ],
    });

    const starts = waveStarts(record(sim, 200));

    expect(starts.map((entry) => ({ tick: entry.tick, index: entry.event.index }))).toEqual([
      { tick: 30, index: 0 },
      { tick: 90, index: 1 },
    ]);
    expect(starts[1]?.event.kind).toBe('final');
  });

  it('3.10: the next wave starts 3 s after every enemy of the current wave died', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      waves: [
        {
          duration: 25,
          spawnGap: 1,
          spawns: [{ enemy: 'gloomling', count: 1, lanes: [1] }],
        },
        { flag: 'final', duration: 0, spawnGap: 1, spawns: [] },
      ],
    });
    advanceToTick(sim, 30);
    sim.step(); // starts wave 0 and spawns its enemy at tick 30
    sim.state.enemies.length = 0; // simulates the kill that issue #21 will implement
    const starts = waveStarts(record(sim, 150));

    // The enemy is gone at tick 31, so wave 1 starts 90 ticks later, long before
    // wave 0's duration would end at tick 780.
    expect(starts.map((entry) => ({ tick: entry.tick, index: entry.event.index }))).toEqual([
      { tick: 121, index: 1 },
    ]);
  });

  it('3.10: duration 0 on the final wave means no timer and the wave never advances', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      waves: [
        {
          flag: 'final',
          duration: 0,
          spawnGap: 1,
          spawns: [{ enemy: 'gloomling', count: 1, lanes: [0] }],
        },
      ],
    });

    advanceToTick(sim, 30);
    const startEvents = sim.step();

    expect(startEvents).toContainEqual({ type: 'waveStarted', index: 0, kind: 'final' });
    expect(startEvents).toContainEqual({ type: 'waveBanner', index: 0, kind: 'final' });
    expect(sim.state.wave.allWavesSpawned).toBe(true);
    expect(sim.state.wave.nextWaveTick).toBeNull();
    expect(waveStarts(record(sim, 600))).toEqual([]);
  });

  it('3.10: the big-wave banner appears 3 s before the big wave starts', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      waves: [
        {
          duration: 5,
          spawnGap: 1,
          spawns: [{ enemy: 'gloomling', count: 1, lanes: [0] }],
        },
        { flag: 'big', duration: 5, spawnGap: 1, spawns: [] },
        { flag: 'final', duration: 0, spawnGap: 1, spawns: [] },
      ],
    });

    const recorded = record(sim, 220);
    const banner = waveBanners(recorded).find((entry) => entry.event.kind === 'big');
    const bigStart = waveStarts(recorded).find((entry) => entry.event.index === 1);

    expect(banner?.tick).toBe(90); // 3 s (90 ticks) before the big wave at tick 180
    expect(banner?.event).toEqual({ type: 'waveBanner', index: 1, kind: 'big' });
    expect(bigStart?.tick).toBe(180);
    expect(bigStart?.event).toEqual({ type: 'waveStarted', index: 1, kind: 'big' });
  });

  it('7.1: a wave without duration and spawnGap uses the 25 s and 3 s defaults', () => {
    const sim = createWaveSim({
      firstWaveDelay: 1,
      waves: [{ spawns: [{ enemy: 'gloomling', count: 2, lanes: [0] }] }],
    });

    const spawns = enemySpawns(record(sim, 200));

    expect(spawns.map((entry) => entry.tick)).toEqual([30, 120]);
    expect(sim.state.wave.nextWaveTick).toBe(30 + ticksFromSeconds(25));
  });

  it('3.10: enemies spawn at the enemy spawn point with their data hp', () => {
    const sim = createWaveSim({ firstWaveDelay: 1, waves: [oneEnemyWave] });
    advanceToTick(sim, 30);
    sim.step();

    expect(sim.state.enemies[0]).toMatchObject({
      enemyId: 'gloomling',
      lane: 2,
      x: rules.grid.enemySpawnX,
      hp: 200,
      maxHp: 200,
      waveIndex: 0,
    });
    expect(enemyById['gloomling']?.hp).toBe(200);
  });
});
