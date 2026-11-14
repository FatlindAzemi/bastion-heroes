import { duelRules, enemyById, rules } from '../../../src/data';
import { spawnEnemy } from '../../../src/sim/enemies/spawn';
import { createDuelSim } from '../../../src/sim/duel';
import type {
  DuelCommand,
  DuelDefenderState,
  DuelEvent,
  DuelRaiderState,
  DuelRejectReason,
  DuelSim,
  Side,
} from '../../../src/sim/duel';

/** Ticks per second of the sim (spec 3.2). */
export const TICKS_PER_SECOND = rules.tick.tickRate;

/** Whole ticks of a duration in seconds (spec 3.2). */
export function ticks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** First tick of regular time: the tick after the 3 s countdown (spec 18.2). */
export const REGULAR_START_TICK = ticks(duelRules.match.countdownS);

/** First tick of overdrive (spec 18.2: 2:00). */
export const OVERDRIVE_START_TICK = REGULAR_START_TICK + ticks(duelRules.match.regularTimeS);

/** Tick of 3:00, the end of overdrive (spec 18.2). */
export const OVERDRIVE_END_TICK = OVERDRIVE_START_TICK + ticks(duelRules.match.overdriveTimeS);

/** Tick at which sudden death runs out (spec 18.2). */
export const SUDDEN_DEATH_END_TICK = OVERDRIVE_END_TICK + ticks(duelRules.match.suddenDeathMaxS);

/** Steps the sim `count` ticks and returns every event. */
export function stepTicks(sim: DuelSim, count: number): DuelEvent[] {
  const events: DuelEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push(...sim.step());
  }
  return events;
}

/** Steps the sim until `state.tick` equals `tick` and returns every event. */
export function stepUntilTick(sim: DuelSim, tick: number): DuelEvent[] {
  return stepTicks(sim, tick - sim.state.tick);
}

/** A sim whose countdown is over: the next tick is the first tick of regular time. */
export function createStartedSim(seed = 1): DuelSim {
  const sim = createDuelSim(seed);
  stepUntilTick(sim, REGULAR_START_TICK);
  return sim;
}

/** Schedules a command for the next tick, steps that tick and returns its events. */
export function apply(sim: DuelSim, command: DuelCommand): DuelEvent[] {
  sim.enqueue(command, sim.state.tick);
  return sim.step();
}

/** Plays a defender card on the next tick and returns the events of that tick. */
export function playDefender(
  sim: DuelSim,
  side: Side,
  cardId: string,
  lane: number,
  col: number,
): DuelEvent[] {
  return apply(sim, { type: 'playDefender', side, cardId, lane, col });
}

/** Gives a side Essence directly, so a test can afford its setup. */
export function setEssence(sim: DuelSim, side: Side, essence: number): void {
  sim.state.sides[side].essence = essence;
}

/** The defender on a tile; throws when the tile is empty. */
export function defenderAt(sim: DuelSim, lane: number, col: number): DuelDefenderState {
  const defender = sim.state.defenders.find((unit) => unit.lane === lane && unit.col === col);
  if (defender === undefined) {
    throw new Error(`no defender at lane ${lane}, column ${col}`);
  }
  return defender;
}

/** Plays a raider card on the next tick and returns the events of that tick. */
export function playRaider(sim: DuelSim, side: Side, cardId: string, lane: number): DuelEvent[] {
  return apply(sim, { type: 'playRaider', side, cardId, lane });
}

/** The active raiders of a side, in id order. */
export function raidersOf(sim: DuelSim, side: Side): DuelRaiderState[] {
  return sim.state.enemies
    .filter((raider) => raider.side === side)
    .sort((first, second) => first.id - second.id);
}

/** Puts an active raider of a side on the board directly, without the summon delay. */
export function addRaider(
  sim: DuelSim,
  side: Side,
  enemyId: string,
  lane: number,
  x: number,
): DuelRaiderState {
  const raider = spawnEnemy(sim.state, enemyId, lane, x, 0, [], side);
  if (raider === undefined) {
    throw new Error(`unknown raider ${enemyId}`);
  }
  return raider as DuelRaiderState;
}

/** World-x distance a raider walks in one tick: its speed at the Duel multiplier (spec 18.6). */
export function raiderStepTiles(enemyId: string): number {
  const speed = enemyById[enemyId]?.speed ?? 0;
  return (speed * duelRules.raiders.speedMultiplier) / TICKS_PER_SECOND;
}

/** The reasons of every rejected command in a list of events. */
export function rejectReasons(events: readonly DuelEvent[]): DuelRejectReason[] {
  return events.flatMap((event) => (event.type === 'commandRejected' ? [event.reason] : []));
}

/** Every event of one type. */
export function eventsOfType<Type extends DuelEvent['type']>(
  events: readonly DuelEvent[],
  type: Type,
): Extract<DuelEvent, { type: Type }>[] {
  return events.filter((event): event is Extract<DuelEvent, { type: Type }> => event.type === type);
}
