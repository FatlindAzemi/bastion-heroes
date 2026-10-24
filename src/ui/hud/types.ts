/**
 * View types of the in-level HUD (spec 9.8). They deliberately contain no simulation
 * imports: `src/main.ts` projects the sim state into these views, keeping the UI layer
 * inside the import boundary of spec 10.4.
 */

/** Game speed shown by the speed toggle (spec 3.2). */
export type HudSpeed = 1 | 2;

/** One card of the card bar (spec 3.5, 9.8). */
export interface HudCardView {
  readonly defenderId: string;
  readonly name: string;
  readonly faction: string;
  readonly rarity: string;
  /** Essence cost of placing the card (spec 5.1). */
  readonly cost: number;
  /** Cooldown seconds left; 0 means the card is ready (spec 3.5). */
  readonly cooldownRemainingSeconds: number;
  /** Remaining cooldown as a 0..1 fraction of the full cooldown (spec 3.5). */
  readonly cooldownFraction: number;
}

/** One defender standing on the grid, as far as the HUD needs it (spec 3.7). */
export interface HudDefenderView {
  readonly id: number;
  readonly lane: number;
  readonly col: number;
}

/** One Essence orb on the field (spec 3.3). */
export interface HudOrbView {
  readonly id: number;
  readonly lane: number;
  readonly x: number;
}

/** Everything the HUD renders for one frame (spec 9.8). */
export interface HudStateView {
  readonly essence: number;
  readonly cards: readonly HudCardView[];
  readonly defenders: readonly HudDefenderView[];
  readonly orbs: readonly HudOrbView[];
  readonly paused: boolean;
  readonly speed: HudSpeed;
}

/** Why the sim rejected a command (spec 3.4, 11.3). */
export type HudRejectionReason = 'notEnoughEssence' | 'onCooldown' | 'tileOccupied' | 'invalidTile';

/** Command feedback the loop forwards to the HUD (spec 11.3). */
export type HudEvent = { readonly type: 'commandRejected'; readonly reason: HudRejectionReason };

/** The commands the HUD sends; `src/main.ts` turns them into sim commands (spec 11.3). */
export interface HudActions {
  place(cardIndex: number, lane: number, col: number): void;
  shovel(lane: number, col: number): void;
  collectOrb(orbId: number): void;
  togglePause(): void;
  toggleSpeed(): void;
}

/** A point on the ground plane, in world units (spec 9.1). */
export interface HudWorldPoint {
  readonly x: number;
  readonly z: number;
}

/** Wiring the game client passes to the HUD. */
export interface HudOptions {
  /** Reads the current HUD view; called once per animation frame. */
  readonly readState: () => HudStateView;
  readonly actions: HudActions;
  /** Renderer callback: DOM pointer position -> ground-plane world point (spec 9.1). */
  readonly pointerToWorld: (clientX: number, clientY: number) => HudWorldPoint | null;
}

/** Event sink the game loop forwards command feedback to (spec 11.3). */
export interface HudBus {
  listener: ((events: readonly HudEvent[]) => void) | null;
}

/** The mounted HUD; `handleEvents` is called once per sim tick by the game loop. */
export interface HudHandle {
  handleEvents(events: readonly HudEvent[]): void;
  dispose(): void;
}
