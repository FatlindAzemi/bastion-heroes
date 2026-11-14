import { createLocalDuelMatch } from '../../../src/sim/duelMatch';
import type { LocalDuelMatch } from '../../../src/sim/duelMatch';
import type { DuelEvent } from '../../../src/sim/duel';
import { REGULAR_START_TICK } from '../duel/duelTestKit';

/** The 8 Arena 1 cards: the legal starter deck of spec 20.2 (4 defenders, 4 raiders). */
export const STARTER_DECK: readonly string[] = [
  'sparkbolt_gremlin',
  'glowshroom_monk',
  'iron_granny',
  'boomcap_brewer',
  'gloomling',
  'pothead',
  'shade_wisp',
  'bat_swarm',
];

/** A second legal deck with other cards than the starter deck where possible. */
export const OTHER_DECK: readonly string[] = [
  'pyro_fox',
  'rune_archer',
  'frost_witch',
  'snowpup_yeti',
  'gloom_ogre',
  'gloom_priest',
  'shieldbearer',
  'gloomling',
];

/** Steps the match `count` ticks and returns every event. */
export function stepMatch(match: LocalDuelMatch, count: number): DuelEvent[] {
  const events: DuelEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push(...match.step());
  }
  return events;
}

/** A local match of two starter decks. */
export function createMatch(southSeed = 11, northSeed = 22, seed = 1): LocalDuelMatch {
  return createLocalDuelMatch({
    seed,
    players: {
      south: { deck: STARTER_DECK, privateSeed: southSeed },
      north: { deck: STARTER_DECK, privateSeed: northSeed },
    },
  });
}

/** A local match whose countdown is over: the next tick is the first tick of regular time. */
export function createStartedMatch(southSeed = 11, northSeed = 22): LocalDuelMatch {
  const match = createMatch(southSeed, northSeed);
  stepMatch(match, REGULAR_START_TICK);
  return match;
}

/** The card at `index` of a list; throws when there is none. */
export function cardAt(cards: readonly string[], index: number): string {
  const cardId = cards.at(index);
  if (cardId === undefined) {
    throw new Error(`No card at index ${index}.`);
  }
  return cardId;
}
