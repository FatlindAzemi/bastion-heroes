import { baseLineXOf, forwardOf, isAheadOf, opposingSide } from '../combat/side';
import type { DuelCommand, DuelEvent, DuelRaiderState, DuelState } from './types';

type SurrenderCommand = Extract<DuelCommand, { type: 'surrender' }>;

/**
 * Applies a `surrender` command (spec 18.2). Seam for #125: until the end
 * conditions exist the command is rejected and changes nothing.
 */
export function surrender(_state: DuelState, command: SurrenderCommand, events: DuelEvent[]): void {
  events.push({ type: 'commandRejected', side: command.side, reason: 'notImplemented', command });
}

/** True when the raider stands on or past the base line of the bastion it attacks (spec 18.1, 18.7). */
function hasReachedEnemyBaseLine(raider: DuelRaiderState): boolean {
  const enemyBaseLineX = baseLineXOf(opposingSide(raider.side));
  return !isAheadOf(enemyBaseLineX, raider.x, forwardOf(raider.side));
}

/**
 * The raiders of both sides that reached the enemy base line (spec 18.7), sorted
 * by id: south raiders at x >= 9.0, north raiders at x <= 0.0. Flying raiders count too.
 */
export function raidersReachingBaseLine(state: Readonly<DuelState>): DuelRaiderState[] {
  return state.enemies
    .filter((raider) => hasReachedEnemyBaseLine(raider))
    .sort((first, second) => first.id - second.id);
}

/**
 * PLACEHOLDER for #125: a raider that reached the enemy base line just leaves
 * the lane. It fires no Last Stand Trap and does no gate damage yet (spec 18.7).
 * #125 replaces this function with the trap and gate rules.
 */
export function removeRaidersAtBaseLineWithoutEffect(state: DuelState, events: DuelEvent[]): void {
  for (const raider of raidersReachingBaseLine(state)) {
    state.enemies.splice(state.enemies.indexOf(raider), 1);
    const { side, id, enemyId, lane } = raider;
    events.push({ type: 'raiderReachedBase', side, id, enemyId, lane });
  }
}

/**
 * Tick step 8 (spec 19.11): Last Stand Traps and gate damage (spec 18.7). Seam
 * for #125: raiders at the base line are only removed. A gate that reaches 0
 * health ends the match through `endDuel` in phases.ts.
 */
export function updateTrapsAndGates(state: DuelState, events: DuelEvent[]): void {
  // #125: traps roll, raiders at the base line damage the gate, sudden death ends on gate damage.
  removeRaidersAtBaseLineWithoutEffect(state, events);
}
