import { duelRules } from '../../data';
import { acceptsCommands, hashDuelState, phaseLengthTicks } from '../duel';
import type { DuelCommand, DuelResult, DuelState, Side } from '../duel';
import type { DuelHandView } from './hand';
import {
  createLocalDuelMatch,
  duelCommandOf,
  type DuelPlayerSetup,
  type LocalDuelMatch,
  type LocalDuelMatchOptions,
} from './localMatch';

/** One confirmed command and the tick that applies it (spec 11.6, 19.4). */
export interface DuelReplayCommand {
  tick: number;
  cmd: DuelCommand;
}

/**
 * A Duel replay (spec 11.6, 19.9): the public sim seed, both decks with their
 * private shuffle seeds, and the confirmed commands in tick order. Bots are not
 * part of it: their plays are ordinary commands, so a replay needs no bot.
 */
export interface DuelReplay {
  seed: number;
  players: Record<Side, DuelPlayerSetup>;
  commands: DuelReplayCommand[];
}

/** One recorded Duel state hash (spec 19.4). */
export interface DuelRecordedHash {
  tick: number;
  hash: string;
}

/** The outcome of running a replay to the end of the match. */
export interface DuelReplayResult {
  result: DuelResult;
  finalTick: number;
  /** Hashes after every 30th tick (spec 19.4) plus the final tick. */
  hashes: DuelRecordedHash[];
  /** Both private hands at the end; they pin the shuffle of the private seeds (spec 18.4). */
  hands: Record<Side, DuelHandView>;
}

/** A local match that records every command its host accepts. */
export interface RecordedDuelMatch {
  /** The local match; play and surrender through it, exactly as through the plain host. */
  readonly match: LocalDuelMatch;
  /** The replay of everything recorded so far. */
  replay(): DuelReplay;
}

/** Copies the match options so the replay owns its data. */
function copyPlayers(players: Record<Side, DuelPlayerSetup>): Record<Side, DuelPlayerSetup> {
  return {
    south: { deck: [...players.south.deck], privateSeed: players.south.privateSeed },
    north: { deck: [...players.north.deck], privateSeed: players.north.privateSeed },
  };
}

/** True while the host passes commands to the sim (not in the countdown, not after the end). */
function isRunning(state: Readonly<DuelState>): boolean {
  return state.result === null && acceptsCommands(state);
}

/**
 * Creates a local Duel that records a replay (spec 11.6, 19.9). Every play the
 * host accepts and every surrender it passes on is recorded for the tick it is
 * applied at; commands the sim then rejects stay in the replay, so the re-run
 * rejects them too.
 */
export function createRecordedDuelMatch(options: LocalDuelMatchOptions): RecordedDuelMatch {
  const host = createLocalDuelMatch(options);
  const commands: DuelReplayCommand[] = [];
  const match: LocalDuelMatch = {
    state: host.state,
    handOf: (side) => host.handOf(side),
    play(side, cardPlay) {
      const tick = host.state.tick;
      const reason = host.play(side, cardPlay);
      const command = duelCommandOf(side, cardPlay);
      if (reason === null && typeof command !== 'string') {
        commands.push({ tick, cmd: command });
      }
      return reason;
    },
    surrender(side) {
      if (isRunning(host.state)) {
        commands.push({ tick: host.state.tick, cmd: { type: 'surrender', side } });
      }
      host.surrender(side);
    },
    step: () => host.step(),
  };
  return {
    match,
    replay: () => ({
      seed: options.seed,
      players: copyPlayers(options.players),
      commands: commands.map((entry) => ({ tick: entry.tick, cmd: { ...entry.cmd } })),
    }),
  };
}

/** Rejects commands whose ticks go backwards or are not whole non-negative ticks. */
function validateCommandOrder(commands: readonly DuelReplayCommand[]): void {
  let previousTick = 0;
  for (const { tick } of commands) {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new Error(`Duel replay command tick ${tick} is not a non-negative integer`);
    }
    if (tick < previousTick) {
      throw new Error('Duel replay commands must be ordered by their tick');
    }
    previousTick = tick;
  }
}

/** Passes one recorded command to the host; a play the host refuses breaks the replay. */
function applyReplayCommand(match: LocalDuelMatch, entry: DuelReplayCommand): void {
  const { cmd } = entry;
  if (cmd.type === 'surrender') {
    match.surrender(cmd.side);
    return;
  }
  const col = cmd.type === 'playDefender' ? cmd.col : undefined;
  const reason = match.play(cmd.side, { cardId: cmd.cardId, lane: cmd.lane, col });
  if (reason !== null) {
    throw new Error(`Duel replay command at tick ${entry.tick} was refused: ${reason}`);
  }
}

/** The last tick a match can reach: the end of the longest sudden death (spec 18.2). */
function maxMatchTicks(): number {
  return (
    phaseLengthTicks('countdown') +
    phaseLengthTicks('regular') +
    phaseLengthTicks('overdrive') +
    phaseLengthTicks('suddenDeath')
  );
}

/** Steps the match to its end, applying each command before the tick it names. */
function stepToEnd(
  match: LocalDuelMatch,
  commands: readonly DuelReplayCommand[],
): DuelRecordedHash[] {
  const interval = duelRules.sync.hashIntervalTicks;
  const hashes: DuelRecordedHash[] = [];
  let next = 0;
  while (match.state.result === null) {
    if (match.state.tick > maxMatchTicks()) {
      throw new Error('Duel replay ran past the longest possible match');
    }
    while (commands[next] !== undefined && commands[next]?.tick === match.state.tick) {
      applyReplayCommand(match, commands[next] as DuelReplayCommand);
      next += 1;
    }
    match.step();
    if (match.state.tick % interval === 0) {
      hashes.push({ tick: match.state.tick, hash: hashDuelState(match.state) });
    }
  }
  if (next < commands.length) {
    throw new Error('Duel replay has commands after the end of the match');
  }
  return hashes;
}

/**
 * Re-runs a Duel replay headless through the local host (spec 11.6, 19.9), so
 * every play is checked against the private hand again. Records the state hash
 * after every 30th tick (spec 19.4) and at the end of the match.
 */
export function runDuelReplay(replay: DuelReplay): DuelReplayResult {
  validateCommandOrder(replay.commands);
  const match = createLocalDuelMatch({ seed: replay.seed, players: replay.players });
  const hashes = stepToEnd(match, replay.commands);
  const final = { tick: match.state.tick, hash: hashDuelState(match.state) };
  if (hashes.at(-1)?.tick !== final.tick) {
    hashes.push(final);
  }
  const result = match.state.result;
  if (result === null) {
    throw new Error('Duel replay ended without a result');
  }
  return {
    result: { ...result },
    finalTick: match.state.tick,
    hashes,
    hands: { south: copyHand(match.handOf('south')), north: copyHand(match.handOf('north')) },
  };
}

/** A plain copy of a hand view. */
function copyHand(view: DuelHandView): DuelHandView {
  return { hand: [...view.hand], next: view.next };
}
