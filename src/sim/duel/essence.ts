import { defenderById, duelRules } from '../../data';
import type { DuelCardDef } from '../../data';
import { isDefenderActive } from '../placement';
import { rescaleTimer } from '../stars';
import { ticksFromSeconds } from '../time';
import { DUEL_SIDES } from './sides';
import type { DuelEvent, DuelPhase, DuelState, Side } from './types';

/** The `producer` part of a Duel card block (spec 18.8). */
export type DuelProducerDef = NonNullable<DuelCardDef['producer']>;

/**
 * Essence of one income point. Spec 18.3 states the income as "1 Essence every
 * 2.4 s": the balance number is the interval in `duelRules`, the point is the unit.
 */
const ESSENCE_PER_INCOME_POINT = 1;

/** Ticks between two income points in a phase (spec 18.3: 2.4 s, then 1.2 s). */
export function incomeIntervalTicksOf(phase: DuelPhase): number {
  const intervalS =
    phase === 'overdrive' || phase === 'suddenDeath'
      ? duelRules.essence.overdriveIncomeIntervalS
      : duelRules.essence.regularIncomeIntervalS;
  return ticksFromSeconds(intervalS);
}

/** Ticks between two pulses of a Duel producer at its star level (spec 18.8). */
export function duelProducerIntervalTicks(producer: DuelProducerDef, stars: 1 | 2 | 3): number {
  return Math.max(1, ticksFromSeconds(producer.intervalSByStar[stars - 1] ?? 0));
}

/** Sets a side's Essence and emits `essenceChanged` when the value changed (spec 19.11). */
function setEssence(state: DuelState, side: Side, essence: number, events: DuelEvent[]): void {
  if (state.sides[side].essence === essence) {
    return;
  }
  state.sides[side].essence = essence;
  events.push({ type: 'essenceChanged', side, essence });
}

/** Adds Essence to a side; everything above the maximum is lost (spec 18.3). */
export function addEssence(
  state: DuelState,
  side: Side,
  amount: number,
  events: DuelEvent[],
): void {
  const essence = Math.min(duelRules.essence.maxEssence, state.sides[side].essence + amount);
  setEssence(state, side, essence, events);
}

/** Takes the cost of a played card from a side; the caller checked that it can pay (spec 18.4). */
export function spendEssence(
  state: DuelState,
  side: Side,
  amount: number,
  events: DuelEvent[],
): void {
  setEssence(state, side, state.sides[side].essence - amount, events);
}

/** Starts the timed income when regular time begins: the first point comes one interval later (spec 18.3). */
export function startIncome(state: DuelState, startTick: number): void {
  state.incomeIntervalTicks = incomeIntervalTicksOf(state.phase);
  state.nextIncomeTick = startTick + state.incomeIntervalTicks;
}

/**
 * Switches the timed income to the interval of the current phase (spec 18.3).
 * The progress to the next point is kept: the HUD bar does not jump.
 */
export function changeIncomeInterval(state: DuelState, startTick: number): void {
  const intervalTicks = incomeIntervalTicksOf(state.phase);
  if (state.nextIncomeTick !== null) {
    state.nextIncomeTick = rescaleTimer(
      state.nextIncomeTick,
      startTick,
      state.incomeIntervalTicks,
      intervalTicks,
    );
  }
  state.incomeIntervalTicks = intervalTicks;
}

/** Gives both players one Essence each time the income timer is due (spec 18.3). */
function updateTimedIncome(state: DuelState, events: DuelEvent[]): void {
  while (state.nextIncomeTick !== null && state.tick >= state.nextIncomeTick) {
    for (const side of DUEL_SIDES) {
      addEssence(state, side, ESSENCE_PER_INCOME_POINT, events);
    }
    state.nextIncomeTick += state.incomeIntervalTicks;
  }
}

/**
 * Producers add their Essence directly to the owner's counter, in id order; there
 * are no orbs in the Duel (spec 18.3, 18.8). Each pulse emits `essenceProduced`
 * for the "+1" popup, also when the point is lost at the maximum.
 */
function updateProducerIncome(state: DuelState, events: DuelEvent[]): void {
  const defenders = [...state.defenders].sort((first, second) => first.id - second.id);
  for (const defender of defenders) {
    const producer = defenderById[defender.defenderId]?.duel?.producer;
    if (producer === undefined || defender.nextOrbTick === null) {
      continue;
    }
    if (state.tick < defender.nextOrbTick || !isDefenderActive(defender, state.tick)) {
      continue;
    }
    const { side, id } = defender;
    events.push({ type: 'essenceProduced', side, sourceId: id, amount: producer.essence });
    addEssence(state, side, producer.essence, events);
    defender.nextOrbTick += duelProducerIntervalTicks(producer, defender.stars);
  }
}

/** Tick step 2 (spec 19.11): timed Essence income, then producer income. */
export function updateDuelEssence(state: DuelState, events: DuelEvent[]): void {
  updateTimedIncome(state, events);
  updateProducerIncome(state, events);
}
