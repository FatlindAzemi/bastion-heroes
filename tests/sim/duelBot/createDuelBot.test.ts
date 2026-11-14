import { describe, expect, it } from 'vitest';

import { duelBots } from '../../../src/data';
import { createDuelBot, playDuelBotTurn, runDuelBotMatch } from '../../../src/sim/duelBot';
import type { DuelBotLevel } from '../../../src/sim/duelBot';
import { createLocalDuelMatch } from '../../../src/sim/duelMatch';
import { OTHER_DECK, STARTER_DECK, createMatch } from '../duelMatch/duelMatchTestKit';
import { REGULAR_START_TICK, ticks } from '../duel/duelTestKit';

const LEVELS: readonly DuelBotLevel[] = ['easy', 'normal', 'hard'];

/**
 * Ticks on which a south bot of the level played a card during the first 10 s
 * of regular time. Also checks that a decision never touches the sim's generator.
 */
function playTicks(level: DuelBotLevel): number[] {
  const match = createMatch();
  const bot = createDuelBot({ level, side: 'south', seed: 5 });
  const played: number[] = [];
  while (match.state.tick < REGULAR_START_TICK + ticks(10)) {
    const rngBefore = match.state.rng.state;
    const play = bot.decide(match.state, match.handOf('south'));
    expect(match.state.rng.state).toBe(rngBefore);
    if (play !== null) {
      played.push(match.state.tick);
      match.play('south', play);
    }
    match.step();
  }
  return played;
}

describe('duel bots (spec 18.10)', () => {
  it('stores the decision intervals of spec 18.10', () => {
    expect(duelBots.easy.decisionIntervalS).toBe(3);
    expect(duelBots.normal.decisionIntervalS).toBe(1.5);
    expect(duelBots.hard.decisionIntervalS).toBe(0.75);
  });

  it.each(LEVELS)('%s never plays in the countdown', (level) => {
    const match = createMatch();
    const bot = createDuelBot({ level, side: 'north', seed: 1 });
    for (let tick = 0; tick < REGULAR_START_TICK; tick += 1) {
      expect(bot.decide(match.state, match.handOf('north'))).toBeNull();
      match.step();
    }
  });

  it('easy plays on the first tick of regular time and then every 3.0 s at most', () => {
    const played = playTicks('easy');
    expect(played[0]).toBe(REGULAR_START_TICK);
    for (const tick of played) {
      expect((tick - REGULAR_START_TICK) % ticks(duelBots.easy.decisionIntervalS)).toBe(0);
    }
  });

  it('hard decides on the 0.75 s grid (22.5 ticks, rounded per decision)', () => {
    for (const tick of playTicks('hard')) {
      const seconds = (tick - REGULAR_START_TICK) / ticks(1);
      const decision = Math.round(seconds / duelBots.hard.decisionIntervalS);
      expect(tick).toBe(REGULAR_START_TICK + ticks(decision * duelBots.hard.decisionIntervalS));
    }
  });

  it('acts on a local match through the host like a human player', () => {
    const match = createMatch();
    const bot = createDuelBot({ level: 'easy', side: 'south', seed: 3 });
    while (match.state.tick < REGULAR_START_TICK) {
      match.step();
    }
    const handBefore = match.handOf('south').hand;
    expect(playDuelBotTurn(bot, match)).toBeNull();
    match.step();
    expect(match.handOf('south').hand).not.toEqual(handBefore);
  });

  it('is deterministic for the same seeds', () => {
    const options = {
      seed: 7,
      players: {
        south: { deck: STARTER_DECK, privateSeed: 1, level: 'hard', botSeed: 2 },
        north: { deck: OTHER_DECK, privateSeed: 3, level: 'normal', botSeed: 4 },
      },
    } as const;
    expect(runDuelBotMatch(options)).toEqual(runDuelBotMatch(options));
  });

  it('does not depend on the opponent hand or deck order', () => {
    // Same public start, same own hand: the first decision may not change with the opponent's private seed.
    const firstPlay = (northSeed: number): unknown => {
      const match = createLocalDuelMatch({
        seed: 1,
        players: {
          south: { deck: STARTER_DECK, privateSeed: 9 },
          north: { deck: STARTER_DECK, privateSeed: northSeed },
        },
      });
      const bot = createDuelBot({ level: 'hard', side: 'south', seed: 1 });
      while (match.state.tick < REGULAR_START_TICK) {
        match.step();
      }
      return bot.decide(match.state, match.handOf('south'));
    };
    expect(firstPlay(100)).toEqual(firstPlay(200));
  });
});
