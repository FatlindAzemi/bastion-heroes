import { describe, expect, it } from 'vitest';
import { duelRules, enemyById } from '../../../src/data';
import { createDuelSim } from '../../../src/sim/duel';
import type { DuelSim, Side } from '../../../src/sim/duel';
import {
  TICKS_PER_SECOND,
  addRaider,
  createStartedSim,
  defenderAt,
  eventsOfType,
  playDefender,
  setEssence,
  stepTicks,
} from './duelTestKit';

const TRAP_STEP = duelRules.gate.trapSpeedTilesPerS / TICKS_PER_SECOND;
/** Ticks a roller needs for the 9 tiles between the base lines, the fire tick included. */
const TRAP_ROLL_TICKS = Math.ceil(9 / TRAP_STEP);

function otherSide(side: Side): Side {
  return side === 'south' ? 'north' : 'south';
}

/** World x of a side's own base line (spec 18.1). */
function baseLineX(side: Side): number {
  return side === 'south' ? 0 : 9;
}

/** The Last Stand Trap of a side in a lane. */
function trapOf(sim: DuelSim, side: Side, lane: number): { used: boolean; rollerX: number | null } {
  const trap = sim.state.sides[side].traps[lane];
  if (trap === undefined) {
    throw new Error(`no trap in lane ${lane}`);
  }
  return trap;
}

/** Marks a trap as used, so the lane is open. */
function useTrap(sim: DuelSim, side: Side, lane: number): void {
  trapOf(sim, side, lane).used = true;
}

/** Puts a raider of `attacker` on the base line of the bastion it attacks. */
function addRaiderAtEnemyBaseLine(sim: DuelSim, attacker: Side, enemyId: string, lane: number) {
  return addRaider(sim, attacker, enemyId, lane, baseLineX(otherSide(attacker)));
}

describe('gates (spec 18.7)', () => {
  it('each bastion has one gate with 8 health', () => {
    const sim = createDuelSim(1);
    expect(duelRules.gate.gateHealth).toBe(8);
    expect(sim.state.sides.south.gateHealth).toBe(8);
    expect(sim.state.sides.north.gateHealth).toBe(8);
  });

  it.each<[Side, string]>([
    ['north', 'gloomling'],
    ['north', 'gloom_ogre'],
    ['south', 'gloomling'],
    ['south', 'gloom_ogre'],
  ])(
    'a %s %s that reaches the base line of a used lane is removed and damages the gate',
    (attacker, enemyId) => {
      const sim = createStartedSim();
      const defender = otherSide(attacker);
      const gateDamage = enemyById[enemyId]?.duel?.gateDamage ?? 0;
      useTrap(sim, defender, 2);
      const raider = addRaiderAtEnemyBaseLine(sim, attacker, enemyId, 2);
      const events = sim.step();

      expect(gateDamage).toBeGreaterThan(0);
      expect(sim.state.enemies).not.toContain(raider);
      expect(sim.state.sides[defender].gateHealth).toBe(8 - gateDamage);
      expect(sim.state.sides[attacker].gateHealth).toBe(8);
      expect(eventsOfType(events, 'raiderReachedBase')).toEqual([
        { type: 'raiderReachedBase', side: attacker, id: raider.id, enemyId, lane: 2 },
      ]);
      expect(eventsOfType(events, 'gateDamaged')).toEqual([
        { type: 'gateDamaged', side: defender, amount: gateDamage, health: 8 - gateDamage },
      ]);
      expect(eventsOfType(events, 'trapFired')).toEqual([]);
      expect(eventsOfType(events, 'enemyDied')).toEqual([]);
    },
  );

  it('a gate never drops below 0 health', () => {
    const sim = createStartedSim();
    useTrap(sim, 'south', 0);
    sim.state.sides.south.gateHealth = 2;
    addRaiderAtEnemyBaseLine(sim, 'north', 'gloom_ogre', 0);
    const events = sim.step();
    expect(sim.state.sides.south.gateHealth).toBe(0);
    expect(eventsOfType(events, 'gateDamaged')).toEqual([
      { type: 'gateDamaged', side: 'south', amount: 3, health: 0 },
    ]);
  });
});

describe('Last Stand Traps (spec 18.7)', () => {
  it('each player has one unused trap per lane', () => {
    const sim = createDuelSim(1);
    for (const side of ['south', 'north'] as const) {
      expect(sim.state.sides[side].traps).toEqual(
        Array.from({ length: 5 }, () => ({ used: false, rollerX: null })),
      );
    }
  });

  it.each<[Side]>([['north'], ['south']])(
    'a %s raider at the base line of an unused lane fires the trap and dies',
    (attacker) => {
      const sim = createStartedSim();
      const defender = otherSide(attacker);
      const raider = addRaiderAtEnemyBaseLine(sim, attacker, 'gloomling', 3);
      const events = sim.step();

      expect(eventsOfType(events, 'trapFired')).toEqual([
        { type: 'trapFired', side: defender, lane: 3 },
      ]);
      expect(eventsOfType(events, 'enemyDied')).toEqual([
        { type: 'enemyDied', id: raider.id, side: attacker },
      ]);
      expect(sim.state.enemies).toEqual([]);
      expect(eventsOfType(events, 'gateDamaged')).toEqual([]);
      expect(eventsOfType(events, 'raiderReachedBase')).toEqual([]);
      expect(sim.state.sides[defender].gateHealth).toBe(8);
      // Only that player's trap in that lane is used.
      const usedTraps = (['south', 'north'] as const).flatMap((side) =>
        sim.state.sides[side].traps.flatMap((trap, lane) => (trap.used ? [`${side} ${lane}`] : [])),
      );
      expect(usedTraps).toEqual([`${defender} 3`]);
    },
  );

  it.each<[Side, 1 | -1]>([
    ['south', 1],
    ['north', -1],
  ])(
    'the %s trap rolls forward from the base line across the lane at 8 tiles per second',
    (owner, forward) => {
      const sim = createStartedSim();
      addRaiderAtEnemyBaseLine(sim, otherSide(owner), 'gloomling', 1);
      sim.step();
      const trap = trapOf(sim, owner, 1);
      expect(duelRules.gate.trapSpeedTilesPerS).toBe(8);
      expect(trap.rollerX).toBeCloseTo(baseLineX(owner) + forward * TRAP_STEP, 10);

      stepTicks(sim, TICKS_PER_SECOND - 1);
      expect(trap.rollerX).toBeCloseTo(baseLineX(owner) + forward * 8, 10);

      // The roller stops at the other base line, the end of the lane.
      stepTicks(sim, TRAP_ROLL_TICKS - TICKS_PER_SECOND - 1);
      expect(trap.rollerX).not.toBeNull();
      sim.step();
      expect(trap.rollerX).toBeNull();
    },
  );

  it('kills every enemy raider it touches, whatever its armor, shield or flying state', () => {
    const sim = createStartedSim();
    const trigger = addRaiderAtEnemyBaseLine(sim, 'north', 'gloomling', 0);
    const victims = [
      addRaider(sim, 'north', 'pothead', 0, 2),
      addRaider(sim, 'north', 'shieldbearer', 0, 4),
      addRaider(sim, 'north', 'bat_swarm', 0, 6),
      addRaider(sim, 'north', 'gloom_ogre', 0, 8.5),
    ];
    const otherLane = addRaider(sim, 'north', 'gloomling', 1, 5);
    const events = stepTicks(sim, TRAP_ROLL_TICKS);

    const deadIds = eventsOfType(events, 'enemyDied').map((event) => event.id);
    expect(deadIds).toEqual([trigger.id, ...victims.map((raider) => raider.id)]);
    expect(eventsOfType(events, 'enemyDied').every((event) => event.side === 'north')).toBe(true);
    expect(sim.state.enemies).toEqual([otherLane]);
    expect(sim.state.sides.south.gateHealth).toBe(8);
  });

  it('kills all raiders that reach the base line on the tick the trap fires', () => {
    const sim = createStartedSim();
    addRaiderAtEnemyBaseLine(sim, 'north', 'gloomling', 4);
    addRaiderAtEnemyBaseLine(sim, 'north', 'gloom_ogre', 4);
    const events = sim.step();
    expect(eventsOfType(events, 'trapFired')).toHaveLength(1);
    expect(eventsOfType(events, 'enemyDied')).toHaveLength(2);
    expect(sim.state.sides.south.gateHealth).toBe(8);
  });

  it('does not touch own units or enemy defenders', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 10);
    setEssence(sim, 'north', 10);
    playDefender(sim, 'south', 'iron_granny', 2, 1);
    playDefender(sim, 'north', 'iron_granny', 2, 7);
    const ownDefender = defenderAt(sim, 2, 1);
    const enemyDefender = defenderAt(sim, 2, 7);
    const ownRaider = addRaider(sim, 'south', 'gloomling', 2, 4);
    addRaiderAtEnemyBaseLine(sim, 'north', 'gloomling', 2);

    const events = stepTicks(sim, TRAP_ROLL_TICKS);
    expect(trapOf(sim, 'south', 2)).toEqual({ used: true, rollerX: null });
    expect(eventsOfType(events, 'enemyDied')).toHaveLength(1);
    expect(eventsOfType(events, 'defenderRemoved')).toEqual([]);
    expect(sim.state.enemies).toEqual([ownRaider]);
    expect(ownRaider.hp).toBe(ownRaider.maxHp);
    expect(ownDefender.hp).toBe(ownDefender.maxHp);
    expect(enemyDefender.hp).toBe(enemyDefender.maxHp);
  });

  it('is used for the rest of the match: the next raider in that lane damages the gate', () => {
    const sim = createStartedSim();
    addRaiderAtEnemyBaseLine(sim, 'north', 'gloomling', 0);
    sim.step();
    // The roller is still rolling away; the trap already counts as used.
    expect(trapOf(sim, 'south', 0).used).toBe(true);
    addRaiderAtEnemyBaseLine(sim, 'north', 'gloomling', 0);
    const whileRolling = sim.step();
    expect(eventsOfType(whileRolling, 'trapFired')).toEqual([]);
    expect(sim.state.sides.south.gateHealth).toBe(7);

    stepTicks(sim, TRAP_ROLL_TICKS);
    // A used trap stays readable in the state: the renderer shows it as a broken roller.
    expect(trapOf(sim, 'south', 0)).toEqual({ used: true, rollerX: null });
    addRaiderAtEnemyBaseLine(sim, 'north', 'gloomling', 0);
    const later = sim.step();
    expect(eventsOfType(later, 'trapFired')).toEqual([]);
    expect(sim.state.sides.south.gateHealth).toBe(6);
  });
});
