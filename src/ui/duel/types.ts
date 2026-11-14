/**
 * View types of the Duel HUD (spec 18.9) and the Training flow (spec 18.10, 20.6).
 * They contain no simulation imports: `src/duelTraining.ts` projects the local
 * match into these views, keeping `src/ui/` inside the import boundary of 10.4.
 */

/** The four phases of a match as the HUD shows them (spec 18.2). */
export type DuelHudPhase = 'countdown' | 'regular' | 'overdrive' | 'suddenDeath';

/** The bot levels the Training entry offers (spec 18.10). */
export type TrainingBotLevel = 'easy' | 'normal' | 'hard';

/** The opponent as the opponent bar shows it (spec 18.9, 18.10). */
export interface DuelOpponentView {
  readonly name: string;
  /** Bots always carry the "AI" tag; a bot is never presented as a human (18.10). */
  readonly isBot: boolean;
  /** Trophies of a ranked opponent; null in Training, which has no trophies (18.10). */
  readonly trophies: number | null;
  /** The bot level shown instead of trophies in Training. */
  readonly botLevel: TrainingBotLevel | null;
}

/** Everything the Duel HUD renders for one frame (spec 18.9). */
export interface DuelHudStateView {
  readonly phase: DuelHudPhase;
  /** Remaining match time in seconds for the top timer (18.2). */
  readonly clockSeconds: number;
  /** Whole seconds left in the countdown; 0 once the match runs (18.2). */
  readonly countdownSeconds: number;
  readonly essence: number;
  readonly maxEssence: number;
  /** Progress to the next Essence point, 0..1 (18.3); 1 at the maximum. */
  readonly essenceProgress: number;
  readonly ownGate: number;
  readonly opponentGate: number;
  readonly maxGate: number;
  /** Card ids of the 4 hand slots, in slot order (18.4). */
  readonly hand: readonly string[];
  /** Card id shown as "next" (18.4). */
  readonly next: string;
  readonly opponent: DuelOpponentView;
  /** True once the match has a result; the HUD stops taking input. */
  readonly ended: boolean;
}

/**
 * Why a play was refused (spec 18.5, 18.6, 18.8, 19.3): the sim's reasons plus the
 * host's `cardNotInHand`. Only some of them have a player-facing text.
 */
export type DuelHudRejectReason =
  | 'notEnoughEssence'
  | 'notYourSide'
  | 'tileOccupied'
  | 'invalidTile'
  | 'invalidCard'
  | 'cardLimitReached'
  | 'tooManyRaiders'
  | 'matchNotRunning'
  | 'cardNotInHand';

/** Events the Training loop forwards to the HUD once per tick. */
export type DuelHudEvent =
  | { readonly type: 'commandRejected'; readonly reason: DuelHudRejectReason }
  | { readonly type: 'phaseChanged'; readonly phase: DuelHudPhase }
  | { readonly type: 'gateDamaged'; readonly own: boolean };

/** The kind of card the player holds, for the board highlight (spec 18.9). */
export type DuelHeldKind = 'defender' | 'raider';

/** A point on the ground plane in sim coordinates (spec 18.1: the mirror is undone). */
export interface DuelWorldPoint {
  readonly x: number;
  readonly z: number;
}

/** The intents the HUD sends; `src/duelTraining.ts` turns them into host calls. */
export interface DuelHudActions {
  /** Plays a hand card on a tile (defender) or a lane (raider); returns the host's refusal. */
  play(cardId: string, lane: number, col: number): DuelHudRejectReason | null;
  /** Shows or clears the board highlight of a held card (spec 18.9). */
  setHeldKind(kind: DuelHeldKind | null): void;
  /** Gives up the match after the confirmation (spec 18.2, 18.9). */
  surrender(): void;
}

/** Wiring the Training loop passes to the HUD. */
export interface DuelHudOptions {
  /** Reads the current HUD view; called once per animation frame. */
  readonly readState: () => DuelHudStateView;
  readonly actions: DuelHudActions;
  /** Renderer callback: DOM pointer position -> sim ground point, or null off the board. */
  readonly pointerToWorld: (clientX: number, clientY: number) => DuelWorldPoint | null;
}

/** Event sink the Training loop forwards per-tick HUD events to. */
export interface DuelHudBus {
  listener: ((events: readonly DuelHudEvent[]) => void) | null;
}

/** The mounted Duel HUD. */
export interface DuelHudHandle {
  handleEvents(events: readonly DuelHudEvent[]): void;
  dispose(): void;
}

/** How a Duel ended from the player's view (spec 18.2, 18.9). */
export type DuelOutcome = 'won' | 'lost' | 'draw';

/** Why a Duel ended (spec 18.2). */
export type DuelEndReason = 'gate' | 'time' | 'surrender' | 'forfeit';

/** Options of the Duel result screen (spec 18.9, 20.6). */
export interface DuelResultOptions {
  readonly outcome: DuelOutcome;
  readonly reason: DuelEndReason;
  readonly ownGate: number;
  readonly opponentGate: number;
  readonly maxGate: number;
  /** True for a Training match: no trophy change and no rewards (18.10). */
  readonly training: boolean;
  readonly botLevel: TrainingBotLevel | null;
  readonly onPlayAgain: () => void;
  readonly onHome: () => void;
}

/** The mounted result screen. */
export interface DuelResultHandle {
  dispose(): void;
}
