import { opposingSide } from '../combat/side';
import type { DuelCommand, DuelEvent, DuelResult, DuelState, Side } from './types';

type SurrenderCommand = Extract<DuelCommand, { type: 'surrender' }>;

/** Ends the match: later `step()` calls change nothing (spec 18.2). */
export function endDuel(state: DuelState, result: DuelResult, events: DuelEvent[]): void {
  if (state.result !== null) {
    return;
  }
  state.result = result;
  events.push({ type: 'duelEnded', winner: result.winner, reason: result.reason });
}

/** Applies a `surrender` command: the player who surrenders loses at once (spec 18.2). */
export function surrender(state: DuelState, command: SurrenderCommand, events: DuelEvent[]): void {
  endDuel(state, { winner: opposingSide(command.side), reason: 'surrender' }, events);
}

/** The side whose gate has more health, or null when both are equal (spec 18.2). */
export function sideWithHealthierGate(state: Readonly<DuelState>): Side | null {
  const south = state.sides.south.gateHealth;
  const north = state.sides.north.gateHealth;
  if (south === north) {
    return null;
  }
  return south > north ? 'south' : 'north';
}

/** True when a gate has no health left (spec 18.2). */
function hasBrokenGate(state: Readonly<DuelState>): boolean {
  return state.sides.south.gateHealth <= 0 || state.sides.north.gateHealth <= 0;
}

/** True when a gate took damage on this tick of sudden death (spec 18.2). */
function tookGateDamageInSuddenDeath(
  state: Readonly<DuelState>,
  events: readonly DuelEvent[],
): boolean {
  return state.phase === 'suddenDeath' && events.some((event) => event.type === 'gateDamaged');
}

/**
 * First half of tick step 9 (spec 19.11): the end by gate (spec 18.2). The match
 * ends when a gate reaches 0 health, and in sudden death on the first gate damage.
 * The player with the healthier gate wins; gates that are equal after the same
 * tick give a draw. `events` are the events of this tick so far.
 */
export function updateMatchEnd(state: DuelState, events: DuelEvent[]): void {
  if (!hasBrokenGate(state) && !tookGateDamageInSuddenDeath(state, events)) {
    return;
  }
  endDuel(state, { winner: sideWithHealthierGate(state) ?? 'draw', reason: 'gate' }, events);
}
