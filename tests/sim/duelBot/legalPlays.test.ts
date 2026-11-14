import { describe, expect, it } from 'vitest';

import { legalPlaysOfCard, playableCards } from '../../../src/sim/duelBot/legalPlays';
import { createStartedSim, playDefender, setEssence } from '../duel/duelTestKit';
import { viewOf } from './duelBotTestKit';

/** The bot's legal plays follow the placement rules of spec 18.5, 18.6 and 18.8. */
describe('legal plays of a bot (spec 18.5)', () => {
  it('places defenders only in the own columns, on empty tiles or merges', () => {
    const sim = createStartedSim();
    setEssence(sim, 'north', 10);
    playDefender(sim, 'north', 'iron_granny', 2, 6);
    const plays = legalPlaysOfCard(viewOf(sim, 'north', ['iron_granny']), 'iron_granny');
    expect(plays).toHaveLength(5 * 4);
    expect(plays.every((play) => play.col !== undefined && play.col >= 5)).toBe(true);
    expect(plays).toContainEqual({ cardId: 'iron_granny', lane: 2, col: 6 });
  });

  it('offers no tile that holds another defender', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 10);
    playDefender(sim, 'south', 'iron_granny', 0, 0);
    const plays = legalPlaysOfCard(
      viewOf(sim, 'south', ['sparkbolt_gremlin']),
      'sparkbolt_gremlin',
    );
    expect(plays).not.toContainEqual({ cardId: 'sparkbolt_gremlin', lane: 0, col: 0 });
    expect(plays).toHaveLength(19);
  });

  it('offers all five lanes for a raider it can pay for', () => {
    const sim = createStartedSim();
    const plays = legalPlaysOfCard(viewOf(sim, 'south', ['pothead']), 'pothead');
    expect(plays.map((play) => play.lane)).toEqual([0, 1, 2, 3, 4]);
  });

  it('offers nothing it cannot pay for', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 2);
    const view = viewOf(sim, 'south', ['gloom_ogre', 'boomcap_brewer', 'pothead', 'iron_granny']);
    expect(playableCards(view)).toEqual(['pothead']);
  });
});
