import { describe, expect, it } from 'vitest';
import { createDuelSim } from '../../../src/sim/duel';
import type { DuelSim, Side } from '../../../src/sim/duel';
import {
  OVERDRIVE_END_TICK,
  addRaider,
  apply,
  createStartedSim,
  eventsOfType,
  rejectReasons,
  stepTicks,
  stepUntilTick,
} from './duelTestKit';

function otherSide(side: Side): Side {
  return side === 'south' ? 'north' : 'south';
}

/**
 * Opens a lane of the bastion `attacker` attacks and puts a raider of `attacker`
 * on its base line: the next tick damages that gate (spec 18.7).
 */
function addGateHit(sim: DuelSim, attacker: Side, enemyId: string, lane: number): void {
  const trap = sim.state.sides[otherSide(attacker)].traps[lane];
  if (trap !== undefined) {
    trap.used = true;
  }
  addRaider(sim, attacker, enemyId, lane, attacker === 'south' ? 9 : 0);
}

/** A sim on the first tick of sudden death with both gates at full health. */
function createSuddenDeathSim(): DuelSim {
  const sim = createStartedSim();
  stepUntilTick(sim, OVERDRIVE_END_TICK);
  expect(sim.state.phase).toBe('suddenDeath');
  return sim;
}

describe('end by gate (spec 18.2)', () => {
  it.each<[Side]>([['south'], ['north']])(
    'the match ends immediately when the %s gate reaches 0 health: the other player wins',
    (loser) => {
      const sim = createStartedSim();
      const winner = otherSide(loser);
      sim.state.sides[loser].gateHealth = 1;
      addGateHit(sim, winner, 'gloomling', 0);
      const endTick = sim.state.tick + 1;
      const events = sim.step();

      expect(sim.state.sides[loser].gateHealth).toBe(0);
      expect(eventsOfType(events, 'duelEnded')).toEqual([
        { type: 'duelEnded', winner, reason: 'gate' },
      ]);
      expect(sim.state.result).toEqual({ winner, reason: 'gate' });
      expect(sim.state.phase).toBe('regular');
      expect(stepTicks(sim, 5)).toEqual([]);
      expect(sim.state.tick).toBe(endTick);
    },
  );

  it('does not end while the damaged gate has health left', () => {
    const sim = createStartedSim();
    addGateHit(sim, 'north', 'gloom_ogre', 0);
    const events = sim.step();
    expect(sim.state.sides.south.gateHealth).toBe(5);
    expect(eventsOfType(events, 'duelEnded')).toEqual([]);
    expect(sim.state.result).toBeNull();
  });

  it('is a draw when both gates reach 0 health on the same tick', () => {
    const sim = createStartedSim();
    sim.state.sides.south.gateHealth = 1;
    sim.state.sides.north.gateHealth = 1;
    addGateHit(sim, 'north', 'gloomling', 0);
    addGateHit(sim, 'south', 'gloomling', 1);
    expect(sim.step()).toContainEqual({ type: 'duelEnded', winner: 'draw', reason: 'gate' });
  });

  it('gate damage on the last tick of overdrive decides the match by time', () => {
    const sim = createStartedSim();
    stepUntilTick(sim, OVERDRIVE_END_TICK - 1);
    addGateHit(sim, 'south', 'gloomling', 0);
    const events = sim.step();
    expect(eventsOfType(events, 'duelEnded')).toEqual([
      { type: 'duelEnded', winner: 'south', reason: 'time' },
    ]);
  });
});

describe('sudden death (spec 18.2)', () => {
  it.each<[Side]>([['south'], ['north']])(
    'the first gate damage ends the match: %s damages the gate and wins',
    (attacker) => {
      const sim = createSuddenDeathSim();
      addGateHit(sim, attacker, 'gloomling', 2);
      const events = sim.step();
      expect(sim.state.sides[otherSide(attacker)].gateHealth).toBe(7);
      expect(eventsOfType(events, 'duelEnded')).toEqual([
        { type: 'duelEnded', winner: attacker, reason: 'gate' },
      ]);
      expect(sim.state.result).toEqual({ winner: attacker, reason: 'gate' });
    },
  );

  it('a trap that fires in sudden death does not end the match', () => {
    const sim = createSuddenDeathSim();
    addRaider(sim, 'north', 'gloomling', 0, 0);
    const events = sim.step();
    expect(eventsOfType(events, 'trapFired')).toHaveLength(1);
    expect(eventsOfType(events, 'duelEnded')).toEqual([]);
    expect(sim.state.result).toBeNull();
  });

  it('the healthier gate wins when both gates take damage on the same tick', () => {
    const sim = createSuddenDeathSim();
    addGateHit(sim, 'north', 'gloom_ogre', 0);
    addGateHit(sim, 'south', 'gloomling', 1);
    // South's gate lost 3, north's gate lost 1.
    expect(sim.step()).toContainEqual({ type: 'duelEnded', winner: 'north', reason: 'gate' });
  });

  it('is a draw when both gates take the same damage on the same tick', () => {
    const sim = createSuddenDeathSim();
    addGateHit(sim, 'north', 'gloomling', 0);
    addGateHit(sim, 'south', 'gloomling', 1);
    expect(sim.step()).toContainEqual({ type: 'duelEnded', winner: 'draw', reason: 'gate' });
  });
});

describe('surrender (spec 18.2)', () => {
  it.each<[Side]>([['south'], ['north']])('a %s player who surrenders loses', (loser) => {
    const sim = createStartedSim();
    const endTick = sim.state.tick + 1;
    const events = apply(sim, { type: 'surrender', side: loser });
    const winner = otherSide(loser);
    expect(events).toEqual([{ type: 'duelEnded', winner, reason: 'surrender' }]);
    expect(sim.state.result).toEqual({ winner, reason: 'surrender' });
    expect(stepTicks(sim, 5)).toEqual([]);
    expect(sim.state.tick).toBe(endTick);
  });

  it('ends the match before the later commands and the rest of the tick', () => {
    const sim = createStartedSim();
    const tick = sim.state.tick;
    sim.state.sides.north.gateHealth = 1;
    addGateHit(sim, 'south', 'gloomling', 0);
    sim.enqueue(
      { type: 'playDefender', side: 'north', cardId: 'sparkbolt_gremlin', lane: 0, col: 8 },
      tick,
    );
    sim.enqueue({ type: 'surrender', side: 'south' }, tick);
    const events = sim.step();
    expect(events).toEqual([{ type: 'duelEnded', winner: 'north', reason: 'surrender' }]);
    expect(sim.state.defenders).toEqual([]);
    expect(sim.state.sides.north.gateHealth).toBe(1);
  });

  it('is not accepted during the countdown', () => {
    const sim = createDuelSim(1);
    const events = apply(sim, { type: 'surrender', side: 'south' });
    expect(rejectReasons(events)).toEqual(['matchNotRunning']);
    expect(sim.state.result).toBeNull();
  });
});
