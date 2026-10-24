/**
 * View types of the in-level HUD (spec 9.8). They deliberately contain no simulation
 * imports: `src/main.ts` projects the sim state into these views, keeping the UI layer
 * inside the import boundary of spec 10.4.
 */

/** Game speed shown by the speed toggle (spec 3.2). */
export type HudSpeed = 1 | 2;

/** A card's star level shown by the star pips (spec 3.6, 9.8). */
export type HudStars = 1 | 2 | 3;

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
  /** Highest star level of the defenders placed from this card (spec 3.6, 9.8). */
  readonly stars: HudStars;
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

/** A flag (big wave) or skull (final wave) marker on the bottom-right progress bar (spec 3.10, 9.8). */
export interface HudProgressMarkView {
  /** Position along the bar as a 0..1 fraction. */
  readonly fraction: number;
  readonly kind: 'big' | 'final';
}

/** Bottom-right level progress: fill fraction plus one mark per BIG wave and the final wave (spec 9.8). */
export interface HudLevelProgressView {
  /** Overall level progress as a 0..1 fraction. */
  readonly fillFraction: number;
  readonly marks: readonly HudProgressMarkView[];
}

/** Boss health bar shown below the card bar while a boss is on the field (spec 6.3, 9.8). */
export interface HudBossView {
  readonly name: string;
  /** Current boss health as a 0..1 fraction. */
  readonly healthFraction: number;
  /** Health fractions of the phase markers (spec 6.3: 66 % and 33 % health). */
  readonly phaseMarkers: readonly number[];
}

/** The kinds of full-width wave banner (spec 3.10: big-wave warning and FINAL WAVE). */
export type HudBannerKind = 'big' | 'final';

/** The visible wave banner state; `nonce` restarts the slide animation on a repeat banner. */
export interface HudBannerView {
  readonly kind: HudBannerKind;
  readonly nonce: number;
}

/** Everything the HUD renders for one frame (spec 9.8). */
export interface HudStateView {
  readonly essence: number;
  readonly cards: readonly HudCardView[];
  readonly defenders: readonly HudDefenderView[];
  readonly orbs: readonly HudOrbView[];
  readonly progress: HudLevelProgressView;
  readonly boss: HudBossView | null;
  readonly paused: boolean;
  readonly speed: HudSpeed;
}

/** Why the sim rejected a command (spec 3.4, 11.3). */
export type HudRejectionReason = 'notEnoughEssence' | 'onCooldown' | 'tileOccupied' | 'invalidTile';

/** Events the game loop forwards to the HUD (spec 3.4, 3.10, 11.3). */
export type HudEvent =
  | { readonly type: 'commandRejected'; readonly reason: HudRejectionReason }
  | { readonly type: 'waveBanner'; readonly kind: HudBannerKind };

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
  /**
   * Banner still visible at the fast-forwarded debug tick (spec 13.7 screenshot runs),
   * so a `?tick=` screenshot can show the spec 3.10 wave banner as it would look live.
   */
  readonly initialBanner?: HudBannerKind | null;
}

/** Event sink the game loop forwards command feedback and banners to (spec 11.3). */
export interface HudBus {
  listener: ((events: readonly HudEvent[]) => void) | null;
}

/** The mounted HUD; `handleEvents` is called once per sim tick by the game loop. */
export interface HudHandle {
  handleEvents(events: readonly HudEvent[]): void;
  dispose(): void;
}
