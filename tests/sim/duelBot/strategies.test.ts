import { describe, expect, it } from 'vitest';

import { easyStrategy } from '../../../src/sim/duelBot/easy';
import { hardStrategy } from '../../../src/sim/duelBot/hard';
import { normalStrategy } from '../../../src/sim/duelBot/normal';
import { addRaider, createStartedSim, setEssence } from '../duel/duelTestKit';
import { FIRST_CHOICE, viewOf } from './duelBotTestKit';

/** The three bot levels of spec 18.10. */
describe('bot strategies (spec 18.10)', () => {
  it('easy plays a random legal card and waits when it cannot pay for any', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 2);
    const view = viewOf(sim, 'south', ['gloom_ogre', 'pothead', 'boomcap_brewer', 'frost_witch']);
    expect(easyStrategy(view, FIRST_CHOICE)).toEqual({ cardId: 'pothead', lane: 0 });
    setEssence(sim, 'south', 1);
    expect(easyStrategy(view, FIRST_CHOICE)).toBeNull();
  });

  it('normal counters the lane with the most enemy raider health', () => {
    const sim = createStartedSim();
    addRaider(sim, 'north', 'gloomling', 1, 6);
    addRaider(sim, 'north', 'pothead', 3, 6);
    const view = viewOf(sim, 'south', [
      'shade_wisp',
      'sparkbolt_gremlin',
      'bat_swarm',
      'gloomling',
    ]);
    // Pot-Head has more health than a Gloomling (spec 6.1): the shooter goes to lane 3, close to the gate.
    expect(normalStrategy(view, FIRST_CHOICE)).toEqual({
      cardId: 'sparkbolt_gremlin',
      lane: 3,
      col: 0,
    });
  });

  it('normal places a wall as far forward as the raiders allow', () => {
    const sim = createStartedSim();
    addRaider(sim, 'north', 'pothead', 2, 2.9);
    const view = viewOf(sim, 'south', ['iron_granny', 'pothead', 'bat_swarm', 'gloomling']);
    expect(normalStrategy(view, FIRST_CHOICE)).toEqual({ cardId: 'iron_granny', lane: 2, col: 2 });
  });

  it('hard saves Essence for a counter it cannot pay for yet', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 3);
    addRaider(sim, 'north', 'pothead', 2, 6);
    // Its counters cost 4 and 6; the Bat Swarm and the producer are no counters (spec 18.6).
    const view = viewOf(sim, 'south', [
      'boomcap_brewer',
      'bat_swarm',
      'glowshroom_monk',
      'gloom_ogre',
    ]);
    expect(hardStrategy(view, FIRST_CHOICE)).toBeNull();
    // easy and normal spend the same Essence on something else.
    expect(normalStrategy(view, FIRST_CHOICE)).not.toBeNull();
  });

  it('hard pushes its most expensive raider into a lane whose enemy trap is used', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 9);
    const trap = sim.state.sides.north.traps[4];
    if (trap === undefined) {
      throw new Error('north has a trap in lane 4');
    }
    trap.used = true;
    const view = viewOf(sim, 'south', ['pothead', 'gloom_ogre', 'shieldbearer', 'bat_swarm']);
    expect(hardStrategy(view, FIRST_CHOICE)).toEqual({ cardId: 'gloom_ogre', lane: 4 });
  });

  it('hard spends no Essence on a lane of flying raiders it holds no anti-air for', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 3);
    addRaider(sim, 'north', 'bat_swarm', 2, 6);
    const view = viewOf(sim, 'south', [
      'iron_granny',
      'gloom_ogre',
      'boomcap_brewer',
      'frost_witch',
    ]);
    expect(hardStrategy(view, FIRST_CHOICE)?.cardId).not.toBe('iron_granny');
  });
});
