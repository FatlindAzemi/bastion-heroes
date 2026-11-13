import { describe, expect, it } from 'vitest';

import { duelRules } from '../../../src/data';
import {
  createDuelSim,
  duelProducerIntervalTicks,
  incomeIntervalTicksOf,
} from '../../../src/sim/duel';
import {
  OVERDRIVE_START_TICK,
  REGULAR_START_TICK,
  createStartedSim,
  defenderAt,
  eventsOfType,
  playDefender,
  setEssence,
  stepTicks,
  stepUntilTick,
  ticks,
} from './duelTestKit';

describe('Essence in the Duel (spec 18.3)', () => {
  it('starts both players with 5 Essence', () => {
    const sim = createDuelSim(1);
    expect(sim.state.sides.south.essence).toBe(5);
    expect(sim.state.sides.north.essence).toBe(5);
  });

  it('gives both players 1 Essence every 2.4 s in regular time', () => {
    const sim = createStartedSim();
    expect(incomeIntervalTicksOf('regular')).toBe(72);

    stepUntilTick(sim, REGULAR_START_TICK + 72);
    expect(sim.state.sides.south.essence).toBe(5);
    const events = sim.step();
    expect(events).toEqual([
      { type: 'essenceChanged', side: 'south', essence: 6 },
      { type: 'essenceChanged', side: 'north', essence: 6 },
    ]);

    stepUntilTick(sim, REGULAR_START_TICK + 72 * 3 + 1);
    expect(sim.state.sides.south.essence).toBe(8);
    expect(sim.state.sides.north.essence).toBe(8);
  });

  it('gives 1 Essence every 1.2 s in overdrive and sudden death', () => {
    expect(incomeIntervalTicksOf('overdrive')).toBe(36);
    expect(incomeIntervalTicksOf('suddenDeath')).toBe(36);

    const sim = createStartedSim();
    stepUntilTick(sim, OVERDRIVE_START_TICK + 1);
    setEssence(sim, 'south', 0);
    setEssence(sim, 'north', 0);
    stepTicks(sim, 36 * 4);
    expect(sim.state.sides.south.essence).toBe(4);
    expect(sim.state.sides.north.essence).toBe(4);
  });

  it('never goes above the maximum of 10: Essence above it is lost', () => {
    const sim = createStartedSim();
    const events = stepTicks(sim, 72 * 8);
    expect(sim.state.sides.south.essence).toBe(10);
    expect(
      eventsOfType(events, 'essenceChanged').filter((event) => event.side === 'south'),
    ).toHaveLength(5);

    // The timer keeps running at the cap: a point spent later is not paid back early.
    setEssence(sim, 'south', 9);
    stepUntilTick(sim, sim.state.nextIncomeTick ?? 0);
    expect(sim.state.sides.south.essence).toBe(9);
    sim.step();
    expect(sim.state.sides.south.essence).toBe(duelRules.essence.maxEssence);
  });

  it('keeps Essence a whole number and exposes the progress to the next point', () => {
    const sim = createStartedSim();
    for (let index = 0; index < 400; index += 1) {
      sim.step();
      expect(Number.isInteger(sim.state.sides.south.essence)).toBe(true);
      const nextIncomeTick = sim.state.nextIncomeTick ?? 0;
      const ticksLeft = nextIncomeTick - sim.state.tick;
      expect(ticksLeft).toBeGreaterThanOrEqual(0);
      expect(ticksLeft).toBeLessThanOrEqual(sim.state.incomeIntervalTicks);
    }
  });

  it('has no sky drops and no orbs', () => {
    const sim = createStartedSim();
    const events = stepTicks(sim, ticks(30));
    expect('orbs' in sim.state).toBe(false);
    expect(events.every((event) => event.type === 'essenceChanged')).toBe(true);
  });
});

describe('Producer income in the Duel (spec 18.3, 18.8)', () => {
  it('adds +1 Essence directly to the owner every 10 s, first after 5 s', () => {
    const sim = createStartedSim();
    playDefender(sim, 'north', 'glowshroom_monk', 2, 8);
    const placedTick = sim.state.tick - 1;
    const monk = defenderAt(sim, 2, 8);
    expect(monk.nextOrbTick).toBe(placedTick + ticks(5));

    const events = stepUntilTick(sim, placedTick + ticks(5) + ticks(10) + 1);
    const produced = eventsOfType(events, 'essenceProduced');
    expect(produced).toEqual([
      { type: 'essenceProduced', side: 'north', sourceId: monk.id, amount: 1 },
      { type: 'essenceProduced', side: 'north', sourceId: monk.id, amount: 1 },
    ]);
    // 5 start - 3 cost + 2 produced + 6 timed points in those 15 s.
    const timedPoints = Math.floor((sim.state.tick - 1 - REGULAR_START_TICK) / 72);
    expect(sim.state.sides.north.essence).toBe(5 - 3 + 2 + timedPoints);
    expect(sim.state.sides.south.essence).toBe(Math.min(10, 5 + timedPoints));
  });

  it('produces every 7 s at ★2 and every 5 s at ★3', () => {
    const monk = {
      essence: 1,
      firstDelayS: 5,
      intervalSByStar: [10, 7, 5] as [number, number, number],
    };
    expect(duelProducerIntervalTicks(monk, 1)).toBe(ticks(10));
    expect(duelProducerIntervalTicks(monk, 2)).toBe(ticks(7));
    expect(duelProducerIntervalTicks(monk, 3)).toBe(ticks(5));

    const sim = createStartedSim();
    setEssence(sim, 'south', 10);
    playDefender(sim, 'south', 'glowshroom_monk', 0, 0);
    playDefender(sim, 'south', 'glowshroom_monk', 0, 0);
    playDefender(sim, 'south', 'glowshroom_monk', 0, 0);
    expect(defenderAt(sim, 0, 0).stars).toBe(3);
    const produced = eventsOfType(stepTicks(sim, ticks(5) + ticks(5) * 3), 'essenceProduced');
    expect(produced).toHaveLength(4);
  });

  it('shows the "+1" popup but loses the point at the maximum', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'glowshroom_monk', 0, 0);
    const monk = defenderAt(sim, 0, 0);
    stepUntilTick(sim, monk.nextOrbTick ?? 0);
    setEssence(sim, 'south', 10);
    const events = sim.step();
    expect(eventsOfType(events, 'essenceProduced')).toHaveLength(1);
    expect(
      eventsOfType(events, 'essenceChanged').filter((event) => event.side === 'south'),
    ).toEqual([]);
    expect(sim.state.sides.south.essence).toBe(10);
  });
});
