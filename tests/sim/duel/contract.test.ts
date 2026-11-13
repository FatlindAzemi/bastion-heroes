import { describe, expect, it } from 'vitest';

import { createDuelSim } from '../../../src/sim/duel';
import type { DuelCommand, DuelEvent, DuelSim } from '../../../src/sim/duel';
import type { CombatState } from '../../../src/sim/types';
import {
  REGULAR_START_TICK,
  addRaider,
  createStartedSim,
  defenderAt,
  eventsOfType,
  playDefender,
  rejectReasons,
  setEssence,
  stepTicks,
} from './duelTestKit';

/** A scripted match start: both players place, merge and make mistakes. */
const SCRIPT: readonly { tick: number; command: DuelCommand }[] = [
  {
    tick: 90,
    command: { type: 'playDefender', side: 'north', cardId: 'sparkbolt_gremlin', lane: 2, col: 5 },
  },
  {
    tick: 90,
    command: { type: 'playDefender', side: 'south', cardId: 'glowshroom_monk', lane: 0, col: 0 },
  },
  {
    tick: 200,
    command: { type: 'playDefender', side: 'south', cardId: 'sparkbolt_gremlin', lane: 2, col: 3 },
  },
  {
    tick: 260,
    command: { type: 'playDefender', side: 'north', cardId: 'sparkbolt_gremlin', lane: 2, col: 5 },
  },
  {
    tick: 300,
    command: { type: 'playDefender', side: 'south', cardId: 'frost_witch', lane: 2, col: 6 },
  },
  {
    tick: 420,
    command: { type: 'playDefender', side: 'north', cardId: 'boomcap_brewer', lane: 1, col: 7 },
  },
];

/** Runs the script for 900 ticks with raiders dropped in, and returns the sim and its events. */
function runScript(seed: number): { sim: DuelSim; events: DuelEvent[] } {
  const sim = createDuelSim(seed);
  for (const { tick, command } of SCRIPT) {
    sim.enqueue(command, tick);
  }
  const events: DuelEvent[] = [];
  while (sim.state.tick < 900) {
    if (sim.state.tick === 250) {
      addRaider(sim, 'north', 'gloomling', 2, 4.5);
      addRaider(sim, 'south', 'pothead', 2, 4.4);
    }
    events.push(...sim.step());
  }
  return { sim, events };
}

describe('Duel simulation contract (spec 19.11)', () => {
  it('starts at tick 0 with an empty board and ids from one counter that starts at 1', () => {
    const sim = createDuelSim(7);
    expect(sim.state).toMatchObject({
      seed: 7,
      tick: 0,
      nextId: 1,
      phase: 'countdown',
      result: null,
    });
    expect(sim.state.defenders).toEqual([]);
    expect(sim.state.enemies).toEqual([]);

    stepTicks(sim, REGULAR_START_TICK);
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 8);
    const raider = addRaider(sim, 'north', 'gloomling', 0, 6);
    expect([defenderAt(sim, 0, 0).id, defenderAt(sim, 0, 8).id, raider.id]).toEqual([1, 2, 3]);
  });

  it('satisfies CombatState, so the shared combat code runs on it as is', () => {
    const combatState: CombatState = createDuelSim(1).state;
    expect(combatState.tick).toBe(0);
  });

  it('step() advances exactly one tick', () => {
    const sim = createDuelSim(1);
    sim.step();
    sim.step();
    expect(sim.state.tick).toBe(2);
  });

  it('applies a command at the start of the tick it was scheduled for', () => {
    const sim = createStartedSim();
    const tick = sim.state.tick + 10;
    sim.enqueue(
      { type: 'playDefender', side: 'south', cardId: 'sparkbolt_gremlin', lane: 0, col: 0 },
      tick,
    );
    expect(stepTicks(sim, 10)).toEqual([]);
    expect(sim.state.defenders).toEqual([]);
    expect(eventsOfType(sim.step(), 'defenderPlaced')).toHaveLength(1);
    expect(defenderAt(sim, 0, 0).activeAtTick).toBe(tick + 15);
  });

  it('refuses to schedule a command for a tick that is already over', () => {
    const sim = createStartedSim();
    const command: DuelCommand = { type: 'surrender', side: 'south' };
    expect(() => sim.enqueue(command, sim.state.tick - 1)).toThrow(RangeError);
    expect(() => sim.enqueue(command, sim.state.tick + 0.5)).toThrow(RangeError);
  });

  it('applies the commands of one tick south first, then in arrival order', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 10);
    const tick = sim.state.tick;
    const play = (side: 'south' | 'north', cardId: string, lane: number, col: number): void =>
      sim.enqueue({ type: 'playDefender', side, cardId, lane, col }, tick);
    play('north', 'sparkbolt_gremlin', 0, 8);
    play('south', 'iron_granny', 1, 0);
    play('north', 'sparkbolt_gremlin', 1, 8);
    play('south', 'sparkbolt_gremlin', 0, 0);

    const placed = eventsOfType(sim.step(), 'defenderPlaced');
    expect(placed.map((event) => [event.side, event.lane, event.id])).toEqual([
      ['south', 1, 1],
      ['south', 0, 2],
      ['north', 0, 3],
      ['north', 1, 4],
    ]);
  });

  it('runs Essence income after the commands of the tick', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 1);
    stepTicks(sim, 72);
    // The income point of this tick comes too late for a 2 Essence card played on the same tick.
    const events = playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    expect(rejectReasons(events)).toEqual(['notEnoughEssence']);
    expect(sim.state.sides.south.essence).toBe(2);
  });

  it('every unit event carries the side of its unit', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 2, 3);
    const gremlin = defenderAt(sim, 2, 3);
    const raider = addRaider(sim, 'north', 'gloomling', 2, 6.5);
    raider.hp = 150;
    const events = stepTicks(sim, 120);

    const sideOf = (type: DuelEvent['type']): unknown =>
      events.flatMap((event) => (event.type === type && 'side' in event ? [event.side] : []))[0];
    expect(sideOf('attack')).toBe('south');
    expect(sideOf('projectileSpawned')).toBe('south');
    expect(sideOf('projectileEnded')).toBe('south');
    expect(sideOf('hit')).toBe('north');
    expect(sideOf('enemyDied')).toBe('north');
    expect(eventsOfType(events, 'attack')[0]).toMatchObject({
      sourceId: gremlin.id,
      targetId: raider.id,
    });
    const unitEvents = events.filter((event) => event.type !== 'essenceChanged');
    expect(unitEvents.length).toBeGreaterThan(4);
    expect(unitEvents.every((event) => 'side' in event)).toBe(true);
  });

  it('a status applied by a north defender reports the side of the south raider it hit', () => {
    const sim = createStartedSim();
    playDefender(sim, 'north', 'snowpup_yeti', 4, 5);
    const raider = addRaider(sim, 'south', 'gloomling', 4, 2.5);
    const statusEvents = eventsOfType(stepTicks(sim, 120), 'statusApplied');
    expect(statusEvents[0]).toMatchObject({ side: 'south', targetId: raider.id });
  });

  it('is deterministic: the same seed and commands give the same events and state', () => {
    const first = runScript(42);
    const second = runScript(42);
    expect(first.events.length).toBeGreaterThan(20);
    expect(JSON.stringify(second.events)).toBe(JSON.stringify(first.events));
    expect(JSON.stringify(second.sim.state)).toBe(JSON.stringify(first.sim.state));
    expect(first.sim.state.defenders.map((defender) => defender.stars)).toEqual([1, 2, 1, 1]);
    expect(rejectReasons(first.events)).toEqual(['notYourSide']);
  });
});
