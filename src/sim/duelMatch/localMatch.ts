import { acceptsCommands, createDuelSim } from '../duel';
import type { DuelCommand, DuelEvent, DuelRejectReason, DuelState, Side } from '../duel';
import { duelCardKind } from './deck';
import {
  createDuelHand,
  cyclePlayedCard,
  handViewOf,
  isInHand,
  type DuelHandState,
  type DuelHandView,
} from './hand';

/** What one player brings to a match: a legal deck and the private shuffle seed (spec 18.4). */
export interface DuelPlayerSetup {
  readonly deck: readonly string[];
  readonly privateSeed: number;
}

/** Everything a local match needs (spec 18.10): the public sim seed and both players. */
export interface LocalDuelMatchOptions {
  readonly seed: number;
  readonly players: Record<Side, DuelPlayerSetup>;
}

/** A card play as the player sends it (spec 19.5 `play`): `col` only for defenders. */
export interface DuelCardPlay {
  readonly cardId: string;
  readonly lane: number;
  readonly col?: number;
}

/**
 * Why the host refused a play before it reached the sim: the reasons of the sim,
 * plus `cardNotInHand` (spec 19.3), which also covers a card whose earlier play
 * of this tick is still waiting for the sim.
 */
export type DuelPlayRejectReason = DuelRejectReason | 'cardNotInHand';

/**
 * A Duel that runs locally without the server (spec 18.10, Training). It owns the
 * sim and both private hands, checks every play against the hand and passes only
 * plays of cards in hand to the sim (spec 19.3, 19.11).
 */
export interface LocalDuelMatch {
  /** The public sim state for the renderer, the HUD and the bots (spec 19.3). */
  readonly state: Readonly<DuelState>;
  /** The private hand and "next" card of one player (spec 18.4). */
  handOf(side: Side): DuelHandView;
  /**
   * Plays a card for the next tick. Returns the reason when the host refuses it,
   * otherwise null: the sim then accepts or rejects it (`commandRejected`) in the
   * next `step()`, and the card cycles only when the sim accepted it.
   */
  play(side: Side, play: DuelCardPlay): DuelPlayRejectReason | null;
  /** Gives up for the next tick (spec 18.2); ignored in the countdown and after the end. */
  surrender(side: Side): void;
  /** Advances one tick, cycles the cards of accepted plays and returns the sim events. */
  step(): DuelEvent[];
}

type PlayCommand = Exclude<DuelCommand, { type: 'surrender' }>;

/** Builds the sim command of a play, or the reason why the play names no legal command. */
function commandOf(side: Side, play: DuelCardPlay): PlayCommand | DuelRejectReason {
  const kind = duelCardKind(play.cardId);
  if (kind === undefined) {
    return 'invalidCard';
  }
  if (kind === 'raider') {
    return { type: 'playRaider', side, cardId: play.cardId, lane: play.lane };
  }
  if (play.col === undefined) {
    return 'invalidTile';
  }
  return { type: 'playDefender', side, cardId: play.cardId, lane: play.lane, col: play.col };
}

/** The commands the sim rejected in one tick. */
function rejectedCommands(events: readonly DuelEvent[]): Set<DuelCommand> {
  const rejected = new Set<DuelCommand>();
  for (const event of events) {
    if (event.type === 'commandRejected') {
      rejected.add(event.command);
    }
  }
  return rejected;
}

/** Creates the private hands of both players; throws for an illegal deck (spec 18.4). */
function createHands(players: Record<Side, DuelPlayerSetup>): Record<Side, DuelHandState> {
  return {
    south: createDuelHand(players.south.deck, players.south.privateSeed),
    north: createDuelHand(players.north.deck, players.north.privateSeed),
  };
}

/**
 * Creates a local Duel (spec 18.10). The sim only gets the public `seed`; decks,
 * hands and private seeds stay in the host (spec 19.3). A play is scheduled for
 * the tick the next `step()` runs; there is no input delay without a server.
 */
export function createLocalDuelMatch(options: LocalDuelMatchOptions): LocalDuelMatch {
  const sim = createDuelSim(options.seed);
  const hands = createHands(options.players);
  /** Plays passed to the sim that the next `step()` decides. */
  const pending: PlayCommand[] = [];

  /** True in regular time, overdrive and sudden death: not in the countdown, not after the end. */
  function isRunning(): boolean {
    return sim.state.result === null && acceptsCommands(sim.state);
  }

  function play(side: Side, cardPlay: DuelCardPlay): DuelPlayRejectReason | null {
    if (!isRunning()) {
      return 'matchNotRunning';
    }
    const isPending = pending.some(
      (command) => command.side === side && command.cardId === cardPlay.cardId,
    );
    if (!isInHand(hands[side], cardPlay.cardId) || isPending) {
      return 'cardNotInHand';
    }
    const command = commandOf(side, cardPlay);
    if (typeof command === 'string') {
      return command;
    }
    pending.push(command);
    sim.enqueue(command, sim.state.tick);
    return null;
  }

  function step(): DuelEvent[] {
    const events = sim.step();
    const rejected = rejectedCommands(events);
    // Spec 18.4: only a play the sim accepted cycles its card; a rejected card stays in hand.
    for (const command of pending.splice(0)) {
      if (!rejected.has(command)) {
        cyclePlayedCard(hands[command.side], command.cardId);
      }
    }
    return events;
  }

  return {
    state: sim.state,
    handOf: (side) => handViewOf(hands[side]),
    play,
    surrender(side: Side): void {
      if (isRunning()) {
        sim.enqueue({ type: 'surrender', side }, sim.state.tick);
      }
    },
    step,
  };
}
