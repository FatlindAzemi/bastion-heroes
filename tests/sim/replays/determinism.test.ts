import { describe, expect, it } from 'vitest';

import { levelById } from '../../../src/data';
import { createSim } from '../../../src/sim/createSim';
import { hashState } from '../../../src/sim/hash';
import type { Replay } from '../../../src/sim/types';
import economyJson from './w1_l01_economy.json';
import idleJson from './w1_l01_idle_900.json';
import resultJson from './w1_l01_result.json';
import { HASH_INTERVAL_TICKS, runReplay, type GoldenReplay } from './runner';

const SPARKBOLT = 'sparkbolt_gremlin';

/** The three committed golden replays of spec 11.6, one per scenario. */
const goldens: { name: string; golden: GoldenReplay }[] = [
  { name: 'idle', golden: idleJson as unknown as GoldenReplay },
  { name: 'economy', golden: economyJson as unknown as GoldenReplay },
  { name: 'result', golden: resultJson as unknown as GoldenReplay },
];

/** W1-L01's loadout as the fixed single Sparkbolt Gremlin card. */
function fixedLoadout(): Replay['loadout'] {
  return [{ defenderId: SPARKBOLT, level: 1 }];
}

// Spec 11.6 and 16.1: golden replays give the same state hashes on every run.
describe('golden replays for W1-L01', () => {
  it('11.6/16.1: W1-L01 and its fixed loadout come from the data registry', () => {
    const level = levelById['w1_l01'];

    expect(level).toBeDefined();
    expect(level?.fixedLoadout).toEqual([SPARKBOLT]);
    expect(fixedLoadout()).toEqual([{ defenderId: SPARKBOLT, level: 1 }]);
  });

  for (const { name, golden } of goldens) {
    it(`11.6/16.1: the ${name} golden replay reproduces its hashes, status and stars`, () => {
      const level = levelById[golden.levelId];
      expect(level).toBeDefined();
      expect(golden.loadout.map((entry) => entry.defenderId)).toEqual(level?.fixedLoadout ?? []);
      expect(golden.loadout.every((entry) => entry.level === 1)).toBe(true);

      const first = runReplay(golden, golden.endTick);
      const second = runReplay(golden, golden.endTick);

      // Running the same replay twice must give the same hashes (spec 11.6).
      expect(second).toEqual(first);
      // ... and the committed golden hashes, status and stars (spec 11.6).
      expect(first).toEqual(golden.expected);
      expect(golden.expected.hashes.at(-1)?.tick).toBe(golden.expected.finalTick);
      expect(golden.expected.finalTick).toBeLessThanOrEqual(golden.endTick);
      for (const hash of golden.expected.hashes.slice(0, -1)) {
        expect(hash.tick % HASH_INTERVAL_TICKS).toBe(0);
      }
      for (const hash of golden.expected.hashes) {
        expect(hash.hash).toMatch(/^[0-9a-f]{8}$/);
      }
    });

    it(`11.6/16.1: the ${name} golden replay ends in a stable, documented result`, () => {
      expect(golden.description.length).toBeGreaterThan(0);
      expect(['playing', 'won', 'lost']).toContain(golden.expected.status);
      expect(golden.expected.stars).toBeGreaterThanOrEqual(0);
      expect(golden.expected.stars).toBeLessThanOrEqual(3);
      expect(golden.endTick).toBeGreaterThan(0);
    });
  }

  it('11.6: the result golden replay reaches an actual level result', () => {
    const resultGolden = goldens.find((entry) => entry.name === 'result');
    expect(resultGolden?.golden.expected.status).not.toBe('playing');
  });

  it('11.6: a replay with an unknown level is rejected', () => {
    const replay: Replay = {
      levelId: 'not_a_level',
      seed: 10001,
      loadout: fixedLoadout(),
      commands: [],
    };

    expect(() => runReplay(replay, 10)).toThrow(/unknown level/);
  });

  it('11.6: a replay loadout that differs from the fixed loadout is rejected', () => {
    const replay: Replay = {
      levelId: 'w1_l01',
      seed: 10001,
      loadout: [{ defenderId: 'iron_granny', level: 1 }],
      commands: [],
    };

    expect(() => runReplay(replay, 10)).toThrow(/fixed loadout/);
  });

  it('11.6: the runner rejects commands that are not ordered by tick', () => {
    const replay: Replay = {
      levelId: 'w1_l01',
      seed: 10001,
      loadout: fixedLoadout(),
      commands: [
        { tick: 5, cmd: { type: 'setAutoCollect', on: true } },
        { tick: 1, cmd: { type: 'setAutoCollect', on: false } },
      ],
    };

    expect(() => runReplay(replay, 10)).toThrow(/ordered by their tick/);
  });

  it('11.6: two simulations of the same replay start with the same hash', () => {
    const level = levelById['w1_l01'];
    if (level === undefined) {
      throw new Error('expected W1-L01 data');
    }

    const first = createSim(level, fixedLoadout(), 10001);
    const second = createSim(level, fixedLoadout(), 10001);

    expect(hashState(first.state)).toBe(hashState(second.state));
  });
});
