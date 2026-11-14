import { describe, expect, it } from 'vitest';
import { createDuelSim } from '../../../src/sim/duel';
import type { DuelCommand, DuelSim, DuelState, Side } from '../../../src/sim/duel';
import { REGULAR_START_TICK, ticks } from './duelTestKit';

/** A command with the tick it is scheduled for. */
interface ScheduledCommand {
  tick: number;
  command: DuelCommand;
}

const LAST_LANE = 4;
const LAST_COLUMN = 8;

function otherSide(side: Side): Side {
  return side === 'south' ? 'north' : 'south';
}

/** Mirrors a command (spec 18.1): the other side, lane 4 - lane, column 8 - column. */
function mirrorCommand(command: DuelCommand): DuelCommand {
  const side = otherSide(command.side);
  switch (command.type) {
    case 'playDefender':
      return { ...command, side, lane: LAST_LANE - command.lane, col: LAST_COLUMN - command.col };
    case 'playRaider':
      return { ...command, side, lane: LAST_LANE - command.lane };
    case 'surrender':
      return { ...command, side };
  }
}

/** World x rounded so that the rounding error of 9 - x does not show. */
function roundX(x: number): string {
  return x.toFixed(6);
}

/**
 * The parts of a state that do not depend on unit ids, as sorted text rows. With
 * `mirrored` every unit is mirrored back (spec 18.1: x becomes 9 - x, lane becomes
 * 4 - lane, the side is swapped), so a mirrored match gives the same rows.
 */
function describeState(state: Readonly<DuelState>, mirrored: boolean): string[] {
  const side = (value: Side): Side => (mirrored ? otherSide(value) : value);
  const lane = (value: number): number => (mirrored ? LAST_LANE - value : value);
  const x = (value: number): string => roundX(mirrored ? 9 - value : value);
  const rows = [
    ...state.defenders.map((unit) => [
      'defender',
      side(unit.side),
      unit.defenderId,
      lane(unit.lane),
      x(unit.col + 0.5),
      unit.hp,
    ]),
    ...state.enemies.map((unit) => [
      'raider',
      side(unit.side),
      unit.enemyId,
      lane(unit.lane),
      x(unit.x),
      unit.hp,
      unit.shieldHp,
    ]),
    ...state.summons.map((unit) => [
      'summon',
      side(unit.side),
      unit.enemyId,
      lane(unit.lane),
      unit.appearTick,
      unit.activeAtTick,
    ]),
    ...state.projectiles.map((unit) => ['projectile', unit.kind, lane(unit.lane), x(unit.x)]),
    ['essence', side('south'), state.sides.south.essence],
    ['essence', side('north'), state.sides.north.essence],
  ];
  return rows.map((row) => row.join(' ')).sort();
}

/** An uneven match: each side builds a different defense and sends different raiders. */
function script(): ScheduledCommand[] {
  const at = (seconds: number): number => REGULAR_START_TICK + ticks(seconds);
  return [
    {
      tick: at(0),
      command: {
        type: 'playDefender',
        side: 'south',
        cardId: 'sparkbolt_gremlin',
        lane: 0,
        col: 2,
      },
    },
    { tick: at(0), command: { type: 'playRaider', side: 'north', cardId: 'gloomling', lane: 0 } },
    { tick: at(0.5), command: { type: 'playRaider', side: 'south', cardId: 'pothead', lane: 0 } },
    {
      tick: at(1),
      command: { type: 'playDefender', side: 'north', cardId: 'iron_granny', lane: 1, col: 6 },
    },
    { tick: at(6), command: { type: 'playRaider', side: 'south', cardId: 'gloomling', lane: 1 } },
    { tick: at(8), command: { type: 'playRaider', side: 'north', cardId: 'bat_swarm', lane: 3 } },
    {
      tick: at(13),
      command: { type: 'playRaider', side: 'north', cardId: 'gloom_priest', lane: 0 },
    },
    {
      tick: at(13),
      command: { type: 'playRaider', side: 'south', cardId: 'shieldbearer', lane: 3 },
    },
    {
      tick: at(20),
      command: {
        type: 'playDefender',
        side: 'north',
        cardId: 'sparkbolt_gremlin',
        lane: 3,
        col: 7,
      },
    },
    { tick: at(21), command: { type: 'playRaider', side: 'south', cardId: 'shade_wisp', lane: 4 } },
    { tick: at(30), command: { type: 'playRaider', side: 'north', cardId: 'pothead', lane: 4 } },
  ];
}

function createScriptedSim(commands: readonly ScheduledCommand[]): DuelSim {
  const sim = createDuelSim(7);
  for (const { tick, command } of commands) {
    sim.enqueue(command, tick);
  }
  return sim;
}

describe('mirror symmetry of the Duel (spec 18.1)', () => {
  it('a mirrored command list gives a mirrored state', () => {
    const original = createScriptedSim(script());
    const mirrored = createScriptedSim(
      script().map(({ tick, command }) => ({ tick, command: mirrorCommand(command) })),
    );
    const endTick = REGULAR_START_TICK + ticks(100);
    const seen = { commandRejected: 0, enemyDied: 0, raiderReachedBase: 0, defenderRemoved: 0 };
    while (original.state.tick < endTick) {
      for (const event of original.step()) {
        if (event.type in seen) {
          seen[event.type as keyof typeof seen] += 1;
        }
      }
      mirrored.step();
      if (original.state.tick % 30 === 0) {
        expect(describeState(mirrored.state, true), `tick ${original.state.tick}`).toEqual(
          describeState(original.state, false),
        );
      }
    }
    // The script is legal and the match was eventful.
    expect(seen.commandRejected).toBe(0);
    expect(seen.enemyDied).toBeGreaterThan(0);
    expect(seen.raiderReachedBase).toBeGreaterThan(0);
  });
});
