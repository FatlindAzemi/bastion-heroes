import { describe, expect, it } from 'vitest';

import { runDuelBotMatch } from '../../../src/sim/duelBot';
import type { DuelBotLevel, DuelBotMatchOptions } from '../../../src/sim/duelBot';
import { OTHER_DECK, STARTER_DECK } from '../duelMatch/duelMatchTestKit';

const LEVELS: readonly DuelBotLevel[] = ['easy', 'normal', 'hard'];

/** Match `index` of a series: the first level plays south in even matches, north in odd ones. */
function seriesMatch(
  first: DuelBotLevel,
  second: DuelBotLevel,
  index: number,
  decks: readonly [readonly string[], readonly string[]] = [STARTER_DECK, STARTER_DECK],
): DuelBotMatchOptions {
  const a = { deck: decks[0], privateSeed: 1000 + index, level: first, botSeed: 2000 + index };
  const b = { deck: decks[1], privateSeed: 3000 + index, level: second, botSeed: 4000 + index };
  const players = index % 2 === 0 ? { south: a, north: b } : { south: b, north: a };
  return { seed: index + 1, players };
}

describe('headless bot matches (spec 18.10)', () => {
  const pairings = LEVELS.flatMap((first) => LEVELS.map((second) => [first, second] as const));

  it.each(pairings)('%s vs %s: no bot ever sends an illegal command', (first, second) => {
    for (let index = 0; index < 4; index += 1) {
      const decks = index < 2 ? undefined : ([STARTER_DECK, OTHER_DECK] as const);
      const report = runDuelBotMatch(seriesMatch(first, second, index, decks));
      expect(report.rejectedPlays).toEqual({ south: 0, north: 0 });
    }
  });

  it('hard beats easy in at least 90 % of 200 matches', { timeout: 120_000 }, () => {
    let hardWins = 0;
    for (let index = 0; index < 200; index += 1) {
      const report = runDuelBotMatch(seriesMatch('hard', 'easy', index));
      const hardSide = index % 2 === 0 ? 'south' : 'north';
      hardWins += report.result.winner === hardSide ? 1 : 0;
      expect(report.rejectedPlays).toEqual({ south: 0, north: 0 });
    }
    console.info(`hard vs easy: hard won ${hardWins} of 200 matches`);
    expect(hardWins).toBeGreaterThanOrEqual(180);
  });
});
