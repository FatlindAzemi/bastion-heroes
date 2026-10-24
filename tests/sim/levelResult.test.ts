import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data';
import { createSim } from '../../src/sim/createSim';
import { ticksFromSeconds } from '../../src/sim/placement';
import type { EnemyState, Sim, SimEvent, SimState } from '../../src/sim/types';
import { createTestLevel, type TestLevelOptions } from './testLevel';

const IRON_GRANNY = 'iron_granny';

interface RecordedEvent {
  tick: number;
  event: SimEvent;
}

/** Steps until `tick` is reached; the next step runs that tick's phases. */
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

/** Creates a sim whose single final wave has no spawns, so it wins when it starts. */
function createWinningSim(options: TestLevelOptions = {}): Sim {
  return createSim(
    createTestLevel({
      skyDrops: false,
      firstWaveDelay: 1,
      waves: [{ flag: 'final', duration: 0, spawnGap: 1, spawns: [] }],
      ...options,
    }),
    [],
    10001,
  );
}

/** Adds an enemy exactly at `x` (wave spawning is covered by #20). */
function spawnEnemy(sim: Sim, lane: number, x: number, hp = 200): EnemyState {
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
  };
  state.enemies.push(enemy);
  return enemy;
}

/** Runs steps until the level is not 'playing' any more (or the cap is reached). */
function advanceUntilLevelEnds(sim: Sim, maxTicks = 2500): RecordedEvent[] {
  const recorded: RecordedEvent[] = [];
  for (let tick = 0; tick < maxTicks && sim.state.status === 'playing'; tick += 1) {
    const stepTick = sim.state.tick;
    for (const event of sim.step()) {
      recorded.push({ tick: stepTick, event });
    }
  }
  return recorded;
}

// Spec 3.10: winning a level.
describe('win condition', () => {
  it('3.10: the level is won when every wave has spawned and no enemy is alive', () => {
    const sim = createWinningSim();
    advanceToTick(sim, ticksFromSeconds(1));

    const events = sim.step();

    expect(events).toContainEqual({ type: 'waveStarted', index: 0, kind: 'final' });
    expect(events).toContainEqual({ type: 'levelWon', stars: 3 });
    expect(sim.state.status).toBe('won');
    expect(sim.state.stars).toBe(3);
  });

  it('3.10: the level is not won while the final wave still has enemies to spawn', () => {
    const sim = createSim(
      createTestLevel({
        skyDrops: false,
        firstWaveDelay: 1,
        waves: [
          {
            flag: 'final',
            duration: 0,
            spawnGap: 1,
            spawns: [{ enemy: 'gloomling', count: 2, lanes: [0] }],
          },
        ],
      }),
      [],
      10001,
    );

    advanceToTick(sim, ticksFromSeconds(1));
    sim.step(); // starts the wave and spawns the first enemy
    expect(sim.state.wave.pendingSpawns).toHaveLength(1);
    expect(sim.state.wave.allWavesSpawned).toBe(true);
    expect(sim.state.status).toBe('playing');

    const recorded = record(sim, 60); // the second enemy spawns at +3 s
    expect(recorded.filter((entry) => entry.event.type === 'levelWon')).toHaveLength(0);
    expect(sim.state.wave.pendingSpawns).toHaveLength(0);
    expect(sim.state.enemies).toHaveLength(2);
    expect(sim.state.status).toBe('playing');
  });

  it('3.9/3.10: a trap save can still win the level, worth 1 star', () => {
    const sim = createSim(
      createTestLevel({
        skyDrops: false,
        firstWaveDelay: 1,
        waves: [
          {
            flag: 'final',
            duration: 0,
            spawnGap: 1,
            spawns: [{ enemy: 'gloomling', count: 1, lanes: [2] }],
          },
        ],
      }),
      [],
      10001,
    );

    const recorded = advanceUntilLevelEnds(sim);

    expect(recorded.some((entry) => entry.event.type === 'trapFired')).toBe(true);
    expect(recorded.map((entry) => entry.event)).toContainEqual({ type: 'levelWon', stars: 1 });
    expect(sim.state.status).toBe('won');
    expect(sim.state.stars).toBe(1);
    expect(sim.state.traps[2]?.used).toBe(true);
  });

  it('3.10: no win before the final wave has started', () => {
    const sim = createSim(
      createTestLevel({
        skyDrops: false,
        firstWaveDelay: 1,
        waves: [
          { duration: 25, spawnGap: 3, spawns: [] },
          { flag: 'final', duration: 0, spawnGap: 1, spawns: [] },
        ],
      }),
      [],
      10001,
    );

    advanceToTick(sim, ticksFromSeconds(1));
    sim.step(); // wave 0 starts with no enemies, but it is not the final wave
    expect(sim.state.wave.allWavesSpawned).toBe(false);
    expect(sim.state.status).toBe('playing');

    const early = record(sim, 89); // ticks 1..89: early clear is 3 s
    expect(early.filter((entry) => entry.event.type === 'levelWon')).toHaveLength(0);

    // Wave 1 (final) starts 3 s after wave 0 cleared and wins the level at tick 120.
    advanceToTick(sim, 120);
    expect(sim.state.status).toBe('playing');
    const events = sim.step();
    expect(events).toContainEqual({ type: 'levelWon', stars: 3 });
  });
});

// Spec 3.9: losing a level.
describe('loss condition', () => {
  it('3.9: the level is lost when an enemy crosses the loss line in a lane with a used trap', () => {
    const sim = createSim(
      createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
      [],
      10001,
    );
    sim.state.traps[0]!.used = true;
    spawnEnemy(sim, 0, -0.3);

    const events = sim.step();

    expect(events).toContainEqual({ type: 'levelLost' });
    expect(sim.state.status).toBe('lost');
    expect(sim.state.stars).toBe(0);
  });

  it('3.9: no loss while the lane trap is still available and saves the enemy', () => {
    const sim = createSim(
      createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
      [],
      10001,
    );
    spawnEnemy(sim, 0, 0.2);

    const recorded = record(sim, 60);

    expect(recorded.some((entry) => entry.event.type === 'levelLost')).toBe(false);
    expect(recorded.some((entry) => entry.event.type === 'trapFired')).toBe(true);
    expect(recorded.some((entry) => entry.event.type === 'enemyDied')).toBe(true);
    expect(sim.state.status).toBe('playing');
  });
});

// Spec 3.11: the star rating.
describe('star rating', () => {
  it('3.11: a win without a trap and without defender losses is worth 3 stars', () => {
    const sim = createWinningSim();
    advanceToTick(sim, ticksFromSeconds(1));
    const events = sim.step();

    expect(events).toContainEqual({ type: 'levelWon', stars: 3 });
    expect(sim.state.stars).toBe(3);
  });

  it('3.11: a win without a trap but with more than 2 defenders lost is worth 2 stars', () => {
    const sim = createWinningSim();
    (sim.state as SimState).defendersLost = 3;
    advanceToTick(sim, ticksFromSeconds(1));
    const events = sim.step();

    expect(events).toContainEqual({ type: 'levelWon', stars: 2 });
    expect(sim.state.stars).toBe(2);
    expect(rules.rating.threeStarMaxDefendersLost).toBe(2);
  });

  it('3.11: using any trap caps a win at 1 star', () => {
    const sim = createWinningSim();
    sim.state.traps[0]!.used = true;
    advanceToTick(sim, ticksFromSeconds(1));
    const events = sim.step();

    expect(events).toContainEqual({ type: 'levelWon', stars: 1 });
    expect(sim.state.stars).toBe(1);
  });

  it('3.11: defenders lost to enemies are counted for the rating', () => {
    const sim = createSim(
      createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
      [{ defenderId: IRON_GRANNY, level: 1 }],
      10001,
    );
    sim.state.cardCooldownEndTicks[0] = 0;
    sim.enqueue({ type: 'place', defenderId: IRON_GRANNY, lane: 0, col: 3 });
    sim.step();
    advanceToTick(sim, 15); // the wall becomes active
    const wall = sim.state.defenders[0];
    if (wall === undefined) {
      throw new Error('expected the wall');
    }
    wall.hp = 50; // one bite kills it
    spawnEnemy(sim, 0, 4.05);

    sim.step(); // bite kills the wall

    expect(sim.state.defenders).toEqual([]);
    expect(sim.state.defendersLost).toBe(1);
  });
});

// Spec 11.3 and 3.9/3.10: the end of a level is final.
describe('after the level ended', () => {
  it('11.3: commands and steps after the end are ignored and the result is kept', () => {
    const sim = createWinningSim();
    advanceUntilLevelEnds(sim);
    expect(sim.state.status).toBe('won');

    const snapshot = JSON.stringify(sim.state);
    sim.enqueue({ type: 'setAutoCollect', on: true });
    expect(sim.step()).toEqual([]);
    expect(JSON.stringify(sim.state)).toBe(snapshot);
  });

  it('11.3: the level result events are emitted exactly once', () => {
    const sim = createWinningSim();
    const recorded = advanceUntilLevelEnds(sim);

    expect(recorded.filter((entry) => entry.event.type === 'levelWon')).toHaveLength(1);
    const more = record(sim, 30);
    expect(more.filter((entry) => entry.event.type === 'levelWon')).toHaveLength(0);
    expect(sim.state.status).toBe('won');
    expect(sim.state.stars).toBe(3);
  });

  it('3.9: a lost level stays lost and emits levelLost once', () => {
    const sim = createSim(
      createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
      [],
      10001,
    );
    sim.state.traps[0]!.used = true;
    const enemy = spawnEnemy(sim, 0, -0.3);

    const first = sim.step();
    expect(first).toContainEqual({ type: 'levelLost' });

    const later = record(sim, 20);
    expect(later.filter((entry) => entry.event.type === 'levelLost')).toHaveLength(0);
    expect(sim.state.status).toBe('lost');
    // The frozen state keeps the enemy where it crossed the line.
    expect(sim.state.enemies[0]?.id).toBe(enemy.id);
    expect(sim.state.tick).toBe(1);
  });

  it('3.9/3.10: the win and loss events share the loadout and the snapshot (no state change after end)', () => {
    const sim = createWinningSim();
    advanceUntilLevelEnds(sim);
    const state = sim.state as SimState;
    expect(state.tick).toBeGreaterThan(0);
    expect(sim.state.traps).toHaveLength(rules.grid.laneCount);

    const snapshot = JSON.stringify(sim.state);
    const events = sim.step();
    expect(events).toEqual([]);
    expect(JSON.stringify(sim.state)).toBe(snapshot);
  });
});
