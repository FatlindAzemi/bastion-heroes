import { describe, expect, it } from 'vitest';

import { defenderById, defenders, duelRules, rules } from '../../../src/data';
import { findBlockingDefender } from '../../../src/sim/combat/enemyActions';
import {
  DUEL_CARD_LEVEL,
  duelDefenderCard,
  duelDefenderMaxHp,
  isAtCardLimit,
} from '../../../src/sim/duel';
import {
  addRaider,
  createStartedSim,
  defenderAt,
  eventsOfType,
  playDefender,
  rejectReasons,
  setEssence,
  stepTicks,
  ticks,
} from './duelTestKit';

/** Card level multiplier of the Duel Standard: L = 1.40 (spec 18.6). */
const DUEL_LEVEL_MULTIPLIER = 1.4;

describe('Card cost in the Duel (spec 18.4)', () => {
  it('takes the Duel cost of the card, not the campaign cost', () => {
    const sim = createStartedSim();
    const events = playDefender(sim, 'south', 'boomcap_brewer', 0, 0);
    expect(events).toContainEqual({ type: 'essenceChanged', side: 'south', essence: 1 });
    expect(sim.state.sides.south.essence).toBe(5 - 4);
    expect(sim.state.sides.north.essence).toBe(5);
  });

  it('rejects a card the player cannot pay ("Not enough Essence")', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 3);
    expect(rejectReasons(playDefender(sim, 'south', 'boomcap_brewer', 0, 0))).toEqual([
      'notEnoughEssence',
    ]);
    expect(sim.state.sides.south.essence).toBe(3);
    expect(sim.state.defenders).toEqual([]);
  });

  it('has no cooldowns: the same card can be played again at once', () => {
    const sim = createStartedSim();
    const command = { type: 'playDefender', side: 'south', cardId: 'sparkbolt_gremlin' } as const;
    sim.enqueue({ ...command, lane: 0, col: 0 }, sim.state.tick);
    sim.enqueue({ ...command, lane: 1, col: 0 }, sim.state.tick);
    expect(rejectReasons(sim.step())).toEqual([]);
    expect(sim.state.defenders).toHaveLength(2);
    expect(sim.state.sides.south.essence).toBe(1);
  });

  it('does not know hands or decks: every Duel defender card is accepted for both sides', () => {
    expect('hands' in createStartedSim().state).toBe(false);
    for (const defender of defenders.filter((def) => def.duel?.kind === 'defender')) {
      const sim = createStartedSim();
      setEssence(sim, 'south', 10);
      setEssence(sim, 'north', 10);
      expect(rejectReasons(playDefender(sim, 'south', defender.id, 0, 0))).toEqual([]);
      expect(rejectReasons(playDefender(sim, 'north', defender.id, 0, 8))).toEqual([]);
    }
  });

  it('rejects ids that are not Duel defender cards', () => {
    const sim = createStartedSim();
    expect(rejectReasons(playDefender(sim, 'south', 'gloomling', 0, 0))).toEqual(['invalidCard']);
    expect(rejectReasons(playDefender(sim, 'south', 'no_such_card', 0, 0))).toEqual([
      'invalidCard',
    ]);
    expect(duelDefenderCard('gloomling')).toBeUndefined();
  });
});

describe('Playing defenders (spec 18.5)', () => {
  it('places a defender on an empty tile in the own columns', () => {
    const sim = createStartedSim();
    const events = playDefender(sim, 'north', 'sparkbolt_gremlin', 4, 6);
    const defender = defenderAt(sim, 4, 6);
    expect(events).toContainEqual({
      type: 'defenderPlaced',
      side: 'north',
      id: defender.id,
      defenderId: 'sparkbolt_gremlin',
      lane: 4,
      col: 6,
      stars: 1,
    });
    expect(defender).toMatchObject({ side: 'north', stars: 1 });
  });

  it('rejects a tile in the enemy columns ("Not your side")', () => {
    const sim = createStartedSim();
    expect(rejectReasons(playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 5))).toEqual([
      'notYourSide',
    ]);
    expect(rejectReasons(playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 3))).toEqual([
      'notYourSide',
    ]);
    expect(sim.state.defenders).toEqual([]);
  });

  it('rejects a tile that holds a different defender ("Tile occupied")', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 10);
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    const events = playDefender(sim, 'south', 'iron_granny', 0, 0);
    expect(rejectReasons(events)).toEqual(['tileOccupied']);
    expect(sim.state.sides.south.essence).toBe(8);
    expect(defenderAt(sim, 0, 0)).toMatchObject({ defenderId: 'sparkbolt_gremlin', stars: 1 });
  });

  it('a rejected command changes nothing and names the side, the reason and the command', () => {
    const sim = createStartedSim();
    const before = JSON.stringify({ ...sim.state, tick: 0 });
    const command = {
      type: 'playDefender',
      side: 'north',
      cardId: 'frost_witch',
      lane: 2,
      col: 2,
    } as const;
    sim.enqueue(command, sim.state.tick);
    expect(sim.step()).toEqual([
      { type: 'commandRejected', side: 'north', reason: 'notYourSide', command },
    ]);
    expect(JSON.stringify({ ...sim.state, tick: 0 })).toBe(before);
  });

  it('becomes active after 0.5 s: it cannot attack during the drop', () => {
    const sim = createStartedSim();
    addRaider(sim, 'north', 'gloomling', 0, 6.5);
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    const placedTick = sim.state.tick - 1;
    const defender = defenderAt(sim, 0, 0);
    expect(defender.activeAtTick).toBe(placedTick + ticks(0.5));

    const dropEvents = stepTicks(sim, ticks(0.5) - 1);
    expect(eventsOfType(dropEvents, 'attack')).toEqual([]);
    expect(eventsOfType(sim.step(), 'attack')).toEqual([
      { type: 'attack', side: 'south', sourceId: defender.id, targetId: expect.any(Number) },
    ]);
  });

  it('enemy raiders standing on the tile do not block placement', () => {
    const sim = createStartedSim();
    addRaider(sim, 'north', 'gloomling', 1, 2.5);
    expect(rejectReasons(playDefender(sim, 'south', 'sparkbolt_gremlin', 1, 2))).toEqual([]);
    expect(defenderAt(sim, 1, 2).side).toBe('south');
  });

  it('has no shovel: no command removes a defender', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    const events = stepTicks(sim, 300);
    expect(eventsOfType(events, 'defenderRemoved')).toEqual([]);
    expect(sim.state.defenders).toHaveLength(1);
  });
});

describe('Merge in the Duel (spec 18.5, 3.6)', () => {
  it('raises the star level by 1 when the same defender is played on its tile', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    const id = defenderAt(sim, 0, 0).id;
    const events = playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    expect(events).toContainEqual({ type: 'defenderMerged', side: 'south', id, stars: 2 });
    expect(sim.state.defenders).toHaveLength(1);
    expect(defenderAt(sim, 0, 0)).toMatchObject({ id, stars: 2 });
  });

  it('costs the full Duel cost like a normal placement', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    expect(sim.state.sides.south.essence).toBe(5 - 2 - 2);
  });

  it('rejects a merge the player cannot pay', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'boomcap_brewer', 0, 0);
    expect(rejectReasons(playDefender(sim, 'south', 'boomcap_brewer', 0, 0))).toEqual([
      'notEnoughEssence',
    ]);
    expect(defenderAt(sim, 0, 0).stars).toBe(1);
  });

  it('heals the defender to its new full health: x 1.6 at ★2 and x 2.5 at ★3', () => {
    const sim = createStartedSim();
    setEssence(sim, 'north', 10);
    const baseHp = defenderById['sparkbolt_gremlin']?.hp ?? 0;
    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 8);
    const defender = defenderAt(sim, 0, 8);
    defender.hp = 1;

    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 8);
    expect(defender.maxHp).toBe(Math.round(baseHp * DUEL_LEVEL_MULTIPLIER * 1.6));
    expect(defender.hp).toBe(defender.maxHp);

    defender.hp = 1;
    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 8);
    expect(defender.stars).toBe(3);
    expect(defender.maxHp).toBe(Math.round(baseHp * DUEL_LEVEL_MULTIPLIER * 2.5));
    expect(defender.hp).toBe(defender.maxHp);
  });

  it('stops at ★3: a fourth copy on the tile is rejected ("Tile occupied")', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 10);
    for (let copy = 0; copy < 3; copy += 1) {
      playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    }
    expect(rejectReasons(playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0))).toEqual([
      'tileOccupied',
    ]);
    expect(defenderAt(sim, 0, 0).stars).toBe(rules.merge.maxStars);
    expect(sim.state.sides.south.essence).toBe(10 - 3 * 2);
  });

  it('multiplies the damage of a merged defender by 1.6', () => {
    const hitAmounts = [1, 2].map((copies) => {
      const sim = createStartedSim();
      for (let copy = 0; copy < copies; copy += 1) {
        playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
      }
      addRaider(sim, 'north', 'gloomling', 0, 3.5);
      return eventsOfType(stepTicks(sim, 60), 'hit')[0]?.amount ?? 0;
    });
    // Pierce against the Gloomling's light armor: T from the 4.1 table.
    const preArmor =
      (defenderById['sparkbolt_gremlin']?.damage ?? 0) *
      DUEL_LEVEL_MULTIPLIER *
      rules.combat.damageMultipliers.pierce.light;
    expect(hitAmounts[0]).toBe(Math.round(preArmor));
    expect(hitAmounts[1]).toBe(Math.round(preArmor * 1.6));
  });

  it('keeps the progress of a producer timer at the faster interval', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 10);
    playDefender(sim, 'south', 'glowshroom_monk', 0, 0);
    const monk = defenderAt(sim, 0, 0);
    // First pulse after 5 s, then the ★1 interval of 10 s is half over.
    stepTicks(sim, ticks(5) + ticks(5));
    const mergeTick = sim.state.tick;
    playDefender(sim, 'south', 'glowshroom_monk', 0, 0);
    // Half of the ★2 interval of 7 s is left.
    expect(monk.nextOrbTick).toBe(mergeTick + Math.round((ticks(5) - 1) * (ticks(7) / ticks(10))));
  });
});

describe('Defenders in the Duel (spec 18.6)', () => {
  it('plays every card at card level 6 (Duel Standard, L = 1.40)', () => {
    expect(DUEL_CARD_LEVEL).toBe(6);
    expect(duelRules.standard.cardLevel).toBe(6);
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 8);
    const baseHp = defenderById['sparkbolt_gremlin']?.hp ?? 0;
    for (const defender of sim.state.defenders) {
      expect(defender.cardLevel).toBe(6);
      expect(defender.maxHp).toBe(Math.round(baseHp * DUEL_LEVEL_MULTIPLIER));
    }
  });

  it('uses the Duel health of 18.8 where a card changes it (Iron Granny: 2400)', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'iron_granny', 0, 3);
    expect(defenderAt(sim, 0, 3).maxHp).toBe(Math.round(2400 * DUEL_LEVEL_MULTIPLIER));
  });

  it('only targets and hits enemy raiders, never own raiders', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    playDefender(sim, 'north', 'sparkbolt_gremlin', 1, 8);
    const ownSouth = addRaider(sim, 'south', 'gloomling', 0, 3.5);
    const ownNorth = addRaider(sim, 'north', 'gloomling', 1, 5.5);
    const quiet = stepTicks(sim, 120);
    expect(eventsOfType(quiet, 'attack')).toEqual([]);
    expect(ownSouth.hp).toBe(ownSouth.maxHp);
    expect(ownNorth.hp).toBe(ownNorth.maxHp);

    const enemyOfSouth = addRaider(sim, 'north', 'gloomling', 0, 6.5);
    const enemyOfNorth = addRaider(sim, 'south', 'gloomling', 1, 2.5);
    const fight = stepTicks(sim, 120);
    const targetIds = new Set(eventsOfType(fight, 'attack').map((event) => event.targetId));
    expect(targetIds).toEqual(new Set([enemyOfSouth.id, enemyOfNorth.id]));
    expect(enemyOfSouth.hp).toBeLessThan(enemyOfSouth.maxHp);
    expect(enemyOfNorth.hp).toBeLessThan(enemyOfNorth.maxHp);
    // Shots fly through own raiders that stand in the way.
    expect(ownSouth.hp).toBe(ownSouth.maxHp);
    expect(ownNorth.hp).toBe(ownNorth.maxHp);
  });

  it('never targets or hits an enemy defender', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 2, 3);
    playDefender(sim, 'north', 'sparkbolt_gremlin', 2, 5);
    const events = stepTicks(sim, 300);
    expect(eventsOfType(events, 'attack')).toEqual([]);
    for (const defender of sim.state.defenders) {
      expect(defender.hp).toBe(defender.maxHp);
    }
  });

  it('only blocks enemy raiders, never own raiders', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'iron_granny', 2, 3);
    stepTicks(sim, ticks(0.5));
    const granny = defenderAt(sim, 2, 3);
    const enemyRaider = addRaider(sim, 'north', 'gloomling', 2, 3.9);
    const ownRaider = addRaider(sim, 'south', 'gloomling', 2, 3.1);
    expect(findBlockingDefender(sim.state, enemyRaider)?.id).toBe(granny.id);
    expect(findBlockingDefender(sim.state, ownRaider)).toBeUndefined();
  });

  it('removes a dead raider and reports its side', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    const raider = addRaider(sim, 'north', 'gloomling', 0, 6.5);
    raider.hp = 1;
    const events = stepTicks(sim, 120);
    expect(events).toContainEqual({ type: 'enemyDied', side: 'north', id: raider.id });
    expect(sim.state.enemies).toEqual([]);
  });
});

describe('Card limits (spec 18.8: "Max 1 per player")', () => {
  it('counts only the own copies of the card; a card without a limit is never limited', () => {
    const sim = createStartedSim();
    const gremlin = duelDefenderCard('sparkbolt_gremlin');
    if (gremlin === undefined) {
      throw new Error('sparkbolt_gremlin is a Duel defender');
    }
    const limited = { ...gremlin, duel: { ...gremlin.duel, maxPerPlayer: 1 } };
    expect(duelDefenderMaxHp(gremlin, 1)).toBe(Math.round(gremlin.def.hp * DUEL_LEVEL_MULTIPLIER));

    expect(isAtCardLimit(sim.state.defenders, 'south', limited)).toBe(false);
    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 8);
    expect(isAtCardLimit(sim.state.defenders, 'south', limited)).toBe(false);
    expect(isAtCardLimit(sim.state.defenders, 'north', limited)).toBe(true);
    expect(isAtCardLimit(sim.state.defenders, 'north', gremlin)).toBe(false);
  });
});
