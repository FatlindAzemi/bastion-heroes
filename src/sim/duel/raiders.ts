import type { DuelEventLog } from './events';
import type { DuelCommand, DuelEvent, DuelState } from './types';

type PlayRaiderCommand = Extract<DuelCommand, { type: 'playRaider' }>;

/**
 * Applies a `playRaider` command (spec 18.5, 18.6). Seam for #124: until raiders
 * exist the command is rejected and changes nothing.
 */
export function playRaider(
  _state: DuelState,
  command: PlayRaiderCommand,
  events: DuelEvent[],
): void {
  events.push({ type: 'commandRejected', side: command.side, reason: 'notImplemented', command });
}

/**
 * Tick step 6 (spec 19.11): raiders move, block and fight, sorted by id. Seam for
 * #124: nothing walks yet. Shared code that emits campaign events must run
 * through `log.emitShared` so its events get their side.
 */
export function updateRaiders(state: DuelState, log: DuelEventLog): void {
  void state;
  void log;
  // #124: summon queue, movement at speed x 1.5, blocking, raider vs raider fights, specials.
}
