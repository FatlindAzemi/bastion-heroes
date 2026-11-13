import { describe, expect, it } from 'vitest';

import { duelRules } from '../../../src/data';
import { acceptsCommands, createDuelSim, phaseLengthTicks } from '../../../src/sim/duel';
import {
  OVERDRIVE_END_TICK,
  OVERDRIVE_START_TICK,
  REGULAR_START_TICK,
  SUDDEN_DEATH_END_TICK,
  apply,
  createStartedSim,
  eventsOfType,
  playDefender,
  rejectReasons,
  stepTicks,
  stepUntilTick,
  ticks,
} from './duelTestKit';

describe('Duel match flow (spec 18.2)', () => {
  it('starts with a 3 s countdown', () => {
    const sim = createDuelSim(1);
    expect(sim.state.phase).toBe('countdown');
    expect(sim.state.phaseEndTick).toBe(90);
    expect(phaseLengthTicks('countdown')).toBe(ticks(3));

    const events = stepUntilTick(sim, REGULAR_START_TICK - 1);
    expect(eventsOfType(events, 'phaseChanged')).toEqual([]);
    expect(sim.state.phase).toBe('countdown');
    expect(sim.step()).toContainEqual({ type: 'phaseChanged', phase: 'regular' });
    expect(sim.state.tick).toBe(REGULAR_START_TICK);
    expect(sim.state.phase).toBe('regular');
  });

  it('accepts no commands during the countdown', () => {
    const sim = createDuelSim(1);
    expect(acceptsCommands(sim.state)).toBe(false);
    const events = playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    expect(rejectReasons(events)).toEqual(['matchNotRunning']);
    expect(sim.state.defenders).toEqual([]);
    expect(sim.state.sides.south.essence).toBe(duelRules.essence.startingEssence);
  });

  it('accepts a command on the first tick of regular time', () => {
    const sim = createDuelSim(1);
    sim.enqueue(
      { type: 'playDefender', side: 'south', cardId: 'sparkbolt_gremlin', lane: 0, col: 0 },
      REGULAR_START_TICK,
    );
    const events = stepUntilTick(sim, REGULAR_START_TICK + 1);
    expect(rejectReasons(events)).toEqual([]);
    expect(sim.state.defenders).toHaveLength(1);
  });

  it('gives no Essence income during the countdown', () => {
    const sim = createDuelSim(1);
    const events = stepUntilTick(sim, REGULAR_START_TICK);
    expect(eventsOfType(events, 'essenceChanged')).toEqual([]);
    expect(sim.state.nextIncomeTick).toBe(REGULAR_START_TICK + ticks(2.4));
  });

  it('runs regular time from 0:00 to 2:00, then overdrive from 2:00 to 3:00', () => {
    const sim = createStartedSim();
    expect(sim.state.phaseEndTick).toBe(OVERDRIVE_START_TICK);
    expect(OVERDRIVE_START_TICK - REGULAR_START_TICK).toBe(ticks(120));

    const regularEvents = stepUntilTick(sim, OVERDRIVE_START_TICK - 1);
    expect(eventsOfType(regularEvents, 'phaseChanged')).toEqual([]);
    expect(sim.step()).toContainEqual({ type: 'phaseChanged', phase: 'overdrive' });
    expect(sim.state.phase).toBe('overdrive');
    expect(sim.state.phaseEndTick).toBe(OVERDRIVE_END_TICK);
    expect(OVERDRIVE_END_TICK - OVERDRIVE_START_TICK).toBe(ticks(60));
  });

  it('doubles the Essence income in overdrive', () => {
    const sim = createStartedSim();
    expect(sim.state.incomeIntervalTicks).toBe(ticks(2.4));
    stepUntilTick(sim, OVERDRIVE_START_TICK);
    expect(sim.state.incomeIntervalTicks).toBe(ticks(1.2));
  });

  it('starts sudden death at 3:00 when both gates have equal health', () => {
    const sim = createStartedSim();
    stepUntilTick(sim, OVERDRIVE_END_TICK - 1);
    const events = sim.step();
    expect(events).toContainEqual({ type: 'phaseChanged', phase: 'suddenDeath' });
    expect(eventsOfType(events, 'duelEnded')).toEqual([]);
    expect(sim.state.phase).toBe('suddenDeath');
    expect(sim.state.result).toBeNull();
    expect(sim.state.phaseEndTick).toBe(SUDDEN_DEATH_END_TICK);
  });

  it('keeps the income doubled in sudden death', () => {
    const sim = createStartedSim();
    stepUntilTick(sim, OVERDRIVE_END_TICK + 1);
    expect(sim.state.incomeIntervalTicks).toBe(ticks(1.2));
    sim.state.sides.south.essence = 0;
    stepTicks(sim, ticks(1.2) * 3);
    expect(sim.state.sides.south.essence).toBe(3);
  });

  it.each([
    { south: 8, north: 5, winner: 'south' },
    { south: 2, north: 3, winner: 'north' },
  ] as const)(
    'at 3:00 the gate with more health wins ($south vs $north: $winner)',
    ({ south, north, winner }) => {
      const sim = createStartedSim();
      stepUntilTick(sim, OVERDRIVE_END_TICK - 1);
      sim.state.sides.south.gateHealth = south;
      sim.state.sides.north.gateHealth = north;
      const events = sim.step();
      expect(events).toContainEqual({ type: 'duelEnded', winner, reason: 'time' });
      expect(eventsOfType(events, 'phaseChanged')).toEqual([]);
      expect(sim.state.result).toEqual({ winner, reason: 'time' });
      expect(sim.state.phase).toBe('overdrive');
    },
  );

  it('is a draw when no gate takes damage in the 1:00 of sudden death', () => {
    const sim = createStartedSim();
    expect(SUDDEN_DEATH_END_TICK - OVERDRIVE_END_TICK).toBe(ticks(60));
    const events = stepUntilTick(sim, SUDDEN_DEATH_END_TICK - 1);
    expect(eventsOfType(events, 'duelEnded')).toEqual([]);
    expect(sim.step()).toContainEqual({ type: 'duelEnded', winner: 'draw', reason: 'time' });
    expect(sim.state.result).toEqual({ winner: 'draw', reason: 'time' });
  });

  it('changes nothing after the match ended', () => {
    const sim = createStartedSim();
    stepUntilTick(sim, SUDDEN_DEATH_END_TICK);
    const endTick = sim.state.tick;
    sim.enqueue(
      { type: 'playDefender', side: 'south', cardId: 'sparkbolt_gremlin', lane: 0, col: 0 },
      endTick,
    );
    expect(stepTicks(sim, 5)).toEqual([]);
    expect(sim.state.tick).toBe(endTick);
    expect(sim.state.defenders).toEqual([]);
  });

  it('has no pause and no speed command', () => {
    const sim = createStartedSim();
    const before = sim.state.tick;
    sim.step();
    // One step is always exactly one tick; the command union has no pause or speed member.
    expect(sim.state.tick).toBe(before + 1);
  });

  it('routes surrender and playRaider to the seams of #125 and #124', () => {
    const sim = createStartedSim();
    expect(rejectReasons(apply(sim, { type: 'surrender', side: 'south' }))).toEqual([
      'notImplemented',
    ]);
    expect(
      rejectReasons(
        apply(sim, { type: 'playRaider', side: 'north', cardId: 'gloomling', lane: 2 }),
      ),
    ).toEqual(['notImplemented']);
    expect(sim.state.result).toBeNull();
    expect(sim.state.enemies).toEqual([]);
  });
});
