import { describe, expect, it } from 'vitest';

import { duelRules } from '../../../../src/data';
import { createDuelSim, hashDuelState } from '../../../../src/sim/duel';
import type { DuelSim } from '../../../../src/sim/duel';
import {
  createLocalDuelMatch,
  runDuelReplay,
  type DuelRecordedHash,
  type DuelReplay,
  type DuelReplayCommand,
} from '../../../../src/sim/duelMatch';
import { OTHER_DECK, STARTER_DECK } from '../../duelMatch/duelMatchTestKit';
import gateJson from './hard_vs_easy_gate.json';
import idleJson from './idle_to_time.json';
import surrenderJson from './normal_vs_hard_surrender.json';
import { DUEL_SCENARIOS, recordScenario, type GoldenDuelReplay } from './scenarios';

const HASH_INTERVAL = duelRules.sync.hashIntervalTicks;

/** The three committed golden Duel replays (spec 16.7) and the end each one must reach. */
const goldens: { name: string; golden: GoldenDuelReplay; reason: string }[] = [
  { name: 'idle', golden: idleJson as unknown as GoldenDuelReplay, reason: 'time' },
  { name: 'gate', golden: gateJson as unknown as GoldenDuelReplay, reason: 'gate' },
  {
    name: 'surrender',
    golden: surrenderJson as unknown as GoldenDuelReplay,
    reason: 'surrender',
  },
];

/** The golden with the most commands; used for the sim-level determinism checks. */
const GATE_GOLDEN = gateJson as unknown as GoldenDuelReplay;

/**
 * Steps a bare Duel sim to the end of the match like a lockstep client (spec 19.4):
 * `deliver` hands the sim the commands before each tick. Returns the hash after
 * every tick.
 */
function runSim(
  seed: number,
  deliver: (sim: DuelSim) => void,
): { sim: DuelSim; hashes: DuelRecordedHash[] } {
  const sim = createDuelSim(seed);
  const hashes: DuelRecordedHash[] = [];
  while (sim.state.result === null) {
    deliver(sim);
    sim.step();
    hashes.push({ tick: sim.state.tick, hash: hashDuelState(sim.state) });
  }
  return { sim, hashes };
}

/** Enqueues every command at once, before the first tick. */
function deliverAllAtStart(commands: readonly DuelReplayCommand[]): (sim: DuelSim) => void {
  let delivered = false;
  return (sim) => {
    if (!delivered) {
      commands.forEach((entry) => sim.enqueue(entry.cmd, entry.tick));
      delivered = true;
    }
  };
}

/** Enqueues commands in batches of 3 ticks, like the server's `ticks` message (spec 19.4). */
function deliverInBatches(commands: readonly DuelReplayCommand[]): (sim: DuelSim) => void {
  const batchTicks = 3;
  return (sim) => {
    if (sim.state.tick % batchTicks !== 0) {
      return;
    }
    const end = sim.state.tick + batchTicks;
    commands
      .filter((entry) => entry.tick >= sim.state.tick && entry.tick < end)
      .forEach((entry) => sim.enqueue(entry.cmd, entry.tick));
  };
}

/** Only the hashes of every 30th tick and of the final tick (spec 19.4). */
function syncHashes(hashes: readonly DuelRecordedHash[]): DuelRecordedHash[] {
  const finalTick = hashes.at(-1)?.tick;
  return hashes.filter((entry) => entry.tick % HASH_INTERVAL === 0 || entry.tick === finalTick);
}

// Spec 11.6 and 16.7: golden Duel replays give the same state hashes on every run.
describe('golden Duel replays', () => {
  it('19.4: the hash interval is 30 ticks', () => {
    expect(HASH_INTERVAL).toBe(30);
  });

  for (const { name, golden, reason } of goldens) {
    it(`11.6/16.7: the ${name} golden replay reproduces its hashes, result and hands`, () => {
      const first = runDuelReplay(golden);
      const second = runDuelReplay(golden);

      expect(second).toEqual(first);
      expect(first).toEqual(golden.expected);
      expect(first.result.reason).toBe(reason);
    });

    it(`19.4: the ${name} golden replay has a hash every 30 ticks and one at the end`, () => {
      const { hashes, finalTick } = golden.expected;
      const expectedTicks = Array.from(
        { length: Math.floor(finalTick / HASH_INTERVAL) },
        (_, index) => (index + 1) * HASH_INTERVAL,
      );
      if (finalTick % HASH_INTERVAL !== 0) {
        expectedTicks.push(finalTick);
      }

      expect(hashes.map((entry) => entry.tick)).toEqual(expectedTicks);
      expect(hashes.every((entry) => /^[0-9a-f]{8}$/.test(entry.hash))).toBe(true);
      expect(golden.description.length).toBeGreaterThan(0);
    });
  }

  it('16.7: the goldens cover every command type and every kind of match end', () => {
    const commandTypes = new Set(
      goldens.flatMap(({ golden }) => golden.commands.map((entry) => entry.cmd.type)),
    );

    expect([...commandTypes].sort()).toEqual(['playDefender', 'playRaider', 'surrender']);
    expect(goldens.map(({ golden }) => golden.expected.result.reason).sort()).toEqual([
      'gate',
      'surrender',
      'time',
    ]);
  });
});

// Spec 16.7 and 19.4: two sims fed the same confirmed commands never differ.
describe('Duel determinism of two sims', () => {
  it('19.4: two sims fed the same commands have equal hashes on every tick and at the end', () => {
    const first = runSim(GATE_GOLDEN.seed, deliverAllAtStart(GATE_GOLDEN.commands));
    const second = runSim(GATE_GOLDEN.seed, deliverInBatches(GATE_GOLDEN.commands));

    expect(second.hashes).toEqual(first.hashes);
    expect(second.sim.state.result).toEqual(first.sim.state.result);
  });

  it('19.4: the bare sim hashes every 30 ticks equal the hashes of the replay through the host', () => {
    const { hashes } = runSim(GATE_GOLDEN.seed, deliverAllAtStart(GATE_GOLDEN.commands));

    expect(syncHashes(hashes)).toEqual(GATE_GOLDEN.expected.hashes);
  });

  it('19.3: the hash does not depend on decks or private seeds', () => {
    const first = createLocalDuelMatch({
      seed: 9,
      players: {
        south: { deck: STARTER_DECK, privateSeed: 1 },
        north: { deck: STARTER_DECK, privateSeed: 2 },
      },
    });
    const second = createLocalDuelMatch({
      seed: 9,
      players: {
        south: { deck: OTHER_DECK, privateSeed: 3 },
        north: { deck: OTHER_DECK, privateSeed: 4 },
      },
    });
    for (let tick = 0; tick < 200; tick += 1) {
      first.step();
      second.step();
    }

    expect(hashDuelState(second.state)).toBe(hashDuelState(first.state));
  });

  it('11.6: a different sim seed gives a different hash', () => {
    expect(hashDuelState(createDuelSim(1).state)).not.toBe(hashDuelState(createDuelSim(2).state));
  });
});

// Spec 19.9: a recorded match re-runs headless to the same end.
describe('Duel replay recording', () => {
  for (const scenario of DUEL_SCENARIOS) {
    it(`19.9: the recorded ${scenario.fileName} match replays to the live final hash`, () => {
      const recorded = recordScenario(scenario);
      const replayed = runDuelReplay(recorded.replay());
      const live = recorded.match.state;

      expect(replayed.finalTick).toBe(live.tick);
      expect(replayed.hashes.at(-1)?.hash).toBe(hashDuelState(live));
      expect(replayed.result).toEqual(live.result);
      expect(replayed.hands.south).toEqual(recorded.match.handOf('south'));
      expect(replayed.hands.north).toEqual(recorded.match.handOf('north'));
    });
  }

  it('19.9: a replay stores the seed, both decks and private seeds, and no bot data', () => {
    expect(Object.keys(GATE_GOLDEN).sort()).toEqual(
      ['commands', 'description', 'expected', 'players', 'seed'].sort(),
    );
    expect(Object.keys(GATE_GOLDEN.players.south).sort()).toEqual(['deck', 'privateSeed']);
  });
});

// Spec 11.6: the runner rejects broken replays instead of silently diverging.
describe('Duel replay validation', () => {
  const players: DuelReplay['players'] = GATE_GOLDEN.players;

  it('11.6: commands that are not ordered by tick are rejected', () => {
    const surrender = { type: 'surrender', side: 'north' } as const;
    const replay: DuelReplay = {
      seed: 1,
      players,
      commands: [
        { tick: 200, cmd: surrender },
        { tick: 100, cmd: surrender },
      ],
    };

    expect(() => runDuelReplay(replay)).toThrow(/ordered by their tick/);
  });

  it('19.3: a play of a card that is not in the hand breaks the replay', () => {
    const first = GATE_GOLDEN.commands[0];
    if (first === undefined || first.cmd.type === 'surrender') {
      throw new Error('expected a golden card play');
    }
    const cardNotInDeck = OTHER_DECK.find((cardId) => !STARTER_DECK.includes(cardId)) ?? '';
    const replay: DuelReplay = {
      seed: GATE_GOLDEN.seed,
      players,
      commands: [{ tick: first.tick, cmd: { ...first.cmd, cardId: cardNotInDeck } }],
    };

    expect(() => runDuelReplay(replay)).toThrow(/refused: cardNotInHand/);
  });

  it('18.2: a command after the end of the match breaks the replay', () => {
    const surrender = { type: 'surrender', side: 'north' } as const;
    const replay: DuelReplay = {
      seed: 1,
      players,
      commands: [{ tick: idleGoldenEnd() + 10, cmd: surrender }],
    };

    expect(() => runDuelReplay(replay)).toThrow(/after the end of the match/);
  });
});

/** The final tick of the idle golden: the longest possible match (spec 18.2). */
function idleGoldenEnd(): number {
  return (idleJson as unknown as GoldenDuelReplay).expected.finalTick;
}
