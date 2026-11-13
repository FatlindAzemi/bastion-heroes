import type { DuelCommand, DuelEvent, DuelState } from './types';

type SurrenderCommand = Extract<DuelCommand, { type: 'surrender' }>;

/**
 * Applies a `surrender` command (spec 18.2). Seam for #125: until the end
 * conditions exist the command is rejected and changes nothing.
 */
export function surrender(_state: DuelState, command: SurrenderCommand, events: DuelEvent[]): void {
  events.push({ type: 'commandRejected', side: command.side, reason: 'notImplemented', command });
}

/**
 * Tick step 8 (spec 19.11): Last Stand Traps and gate damage (spec 18.7). Seam
 * for #125: no raider reaches a base line yet. A gate that reaches 0 health ends
 * the match through `endDuel` in phases.ts.
 */
export function updateTrapsAndGates(state: DuelState, events: DuelEvent[]): void {
  void state;
  void events;
  // #125: traps roll, raiders at the base line damage the gate, sudden death ends on gate damage.
}
