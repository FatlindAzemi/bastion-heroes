import { duelRules } from '../../data';
import { ticksFromSeconds } from '../time';
import { changeIncomeInterval, incomeIntervalTicksOf, startIncome } from './essence';
import type { DuelEvent, DuelPhase, DuelResult, DuelState, Side } from './types';

/** Length of a phase in ticks (spec 18.2: 3 s, 2:00, 1:00, up to 1:00). */
export function phaseLengthTicks(phase: DuelPhase): number {
  const { countdownS, regularTimeS, overdriveTimeS, suddenDeathMaxS } = duelRules.match;
  const lengthS = {
    countdown: countdownS,
    regular: regularTimeS,
    overdrive: overdriveTimeS,
    suddenDeath: suddenDeathMaxS,
  }[phase];
  return ticksFromSeconds(lengthS);
}

/** The phase timer fields of a new match: the countdown, with no income yet (spec 18.2). */
export function initialPhaseState(): Pick<
  DuelState,
  'phase' | 'phaseEndTick' | 'incomeIntervalTicks' | 'nextIncomeTick'
> {
  return {
    phase: 'countdown',
    phaseEndTick: phaseLengthTicks('countdown'),
    incomeIntervalTicks: incomeIntervalTicksOf('countdown'),
    nextIncomeTick: null,
  };
}

/** True while commands are accepted: from the end of the countdown on (spec 18.2). */
export function acceptsCommands(state: Readonly<DuelState>): boolean {
  return state.phase !== 'countdown';
}

/** Ends the match: later `step()` calls change nothing (spec 18.2). */
export function endDuel(state: DuelState, result: DuelResult, events: DuelEvent[]): void {
  if (state.result !== null) {
    return;
  }
  state.result = result;
  events.push({ type: 'duelEnded', winner: result.winner, reason: result.reason });
}

/** Enters a phase that starts at `startTick` and emits `phaseChanged` (spec 18.2). */
function enterPhase(
  state: DuelState,
  phase: DuelPhase,
  startTick: number,
  events: DuelEvent[],
): void {
  state.phase = phase;
  state.phaseEndTick = startTick + phaseLengthTicks(phase);
  events.push({ type: 'phaseChanged', phase });
}

/** The side whose gate has more health, or null when both are equal (spec 18.2). */
function sideWithHealthierGate(state: Readonly<DuelState>): Side | null {
  const south = state.sides.south.gateHealth;
  const north = state.sides.north.gateHealth;
  if (south === north) {
    return null;
  }
  return south > north ? 'south' : 'north';
}

/** At 3:00 the healthier gate wins; equal gates start sudden death (spec 18.2). */
function resolveEndOfOverdrive(state: DuelState, startTick: number, events: DuelEvent[]): void {
  const winner = sideWithHealthierGate(state);
  if (winner !== null) {
    endDuel(state, { winner, reason: 'time' }, events);
    return;
  }
  // Income stays doubled in sudden death, so the income timer is left alone (spec 18.2).
  enterPhase(state, 'suddenDeath', startTick, events);
}

/**
 * Tick step 9 (spec 19.11): phase changes driven by the match clock (spec 18.2).
 * A phase that ends with this tick is replaced before the next tick starts, so
 * commands scheduled for the first tick of regular time are accepted. Ends by a
 * broken gate, by gate damage in sudden death and by surrender belong to #125.
 */
export function updatePhase(state: DuelState, events: DuelEvent[]): void {
  const nextTick = state.tick + 1;
  if (state.result !== null || nextTick < state.phaseEndTick) {
    return;
  }
  switch (state.phase) {
    case 'countdown':
      enterPhase(state, 'regular', nextTick, events);
      startIncome(state, nextTick);
      break;
    case 'regular':
      enterPhase(state, 'overdrive', nextTick, events);
      changeIncomeInterval(state, nextTick);
      break;
    case 'overdrive':
      resolveEndOfOverdrive(state, nextTick, events);
      break;
    case 'suddenDeath':
      // No gate took damage in sudden death: the match is a draw (spec 18.2).
      endDuel(state, { winner: 'draw', reason: 'time' }, events);
      break;
  }
}
