/**
 * Duel simulation contract (spec 19.11). Everything outside `src/sim/duel/`
 * talks to the Duel sim only through these types. The Duel sim is headless and
 * deterministic like the campaign sim (spec 3.2); the same code runs on the
 * match server (spec 19.1). The campaign contract of 11.3 stays unchanged.
 */
import type {
  DefenderState,
  EnemyState,
  FirePatchState,
  ProjectileState,
  Rng,
  Side,
  SimEvent,
} from '../types';

export type { Side };

/** The four phases of a match (spec 18.2). */
export type DuelPhase = 'countdown' | 'regular' | 'overdrive' | 'suddenDeath';

/** A player input (spec 19.11). `side` is the player who sent it. */
export type DuelCommand =
  | { type: 'playDefender'; side: Side; cardId: string; lane: number; col: number }
  | { type: 'playRaider'; side: Side; cardId: string; lane: number }
  | { type: 'surrender'; side: Side };

/**
 * Why a command was rejected (spec 18.5, 11.3):
 * - `notEnoughEssence`: "Not enough Essence" (18.5).
 * - `notYourSide`: "Not your side": the tile is not in the player's own columns (18.1, 18.5).
 * - `tileOccupied`: "Tile occupied": another defender, or the same defender at max stars (18.5).
 * - `invalidTile`: the lane or column is outside the 5 x 9 grid (3.1).
 * - `invalidCard`: the card id is not a Duel card of the kind the command plays (18.8).
 * - `cardLimitReached`: the player already has the card's maximum number of copies (18.8).
 * - `matchNotRunning`: the countdown is still running; no commands are accepted (18.2).
 * - `notImplemented`: the command belongs to a later D1 issue (`playRaider` #124, `surrender` #125).
 */
export type DuelRejectReason =
  | 'notEnoughEssence'
  | 'notYourSide'
  | 'tileOccupied'
  | 'invalidTile'
  | 'invalidCard'
  | 'cardLimitReached'
  | 'matchNotRunning'
  | 'notImplemented';

/** How a match ended (spec 18.2). */
export interface DuelResult {
  winner: Side | 'draw';
  reason: 'gate' | 'time' | 'surrender' | 'forfeit';
}

/** The campaign unit events of 11.3 that happen in a Duel; each names one unit. */
type UnitEventType =
  | 'defenderPlaced'
  | 'defenderMerged'
  | 'defenderRemoved'
  | 'enemySpawned'
  | 'attack'
  | 'projectileSpawned'
  | 'projectileEnded'
  | 'hit'
  | 'statusApplied'
  | 'enemyDied';

/** Adds the owning side to every member of an event union. */
type WithSide<Event> = Event extends unknown ? Event & { side: Side } : never;

/**
 * A unit event of 11.3 with the side of its unit (spec 19.11): the placed, merged,
 * removed, spawned or dead unit, the attacker of `attack`, the firing defender of a
 * projectile, and the target of `hit` and `statusApplied`.
 */
export type DuelUnitEvent = WithSide<Extract<SimEvent, { type: UnitEventType }>>;

/** Something a player can see or hear in a Duel; emitted by `step()` (spec 19.11). */
export type DuelEvent =
  | DuelUnitEvent
  // A combo happens at a place, not on one unit, so it carries no side (spec 4.6).
  | Extract<SimEvent, { type: 'combo' }>
  | { type: 'commandRejected'; side: Side; reason: DuelRejectReason; command: DuelCommand }
  | { type: 'essenceChanged'; side: Side; essence: number }
  // The "+1" popup of a producer (spec 18.3); emitted even when the point is lost at the cap.
  | { type: 'essenceProduced'; side: Side; sourceId: number; amount: number }
  | { type: 'gateDamaged'; side: Side; amount: number; health: number }
  | { type: 'phaseChanged'; phase: DuelPhase }
  | { type: 'duelEnded'; winner: Side | 'draw'; reason: DuelResult['reason'] };

/** A defender in a Duel: always owned by a side (spec 18.1). */
export type DuelDefenderState = DefenderState & { side: Side };

/** A raider in a Duel: a walking unit that is always owned by a side (spec 18.6). */
export type DuelRaiderState = EnemyState & { side: Side };

/** The public numbers of one player (spec 19.3). */
export interface DuelSideState {
  /** Essence available to the player; a whole number from 0 to the maximum (spec 18.3). */
  essence: number;
  /** Health of the player's gate (spec 18.7). */
  gateHealth: number;
}

/**
 * The simulated Duel state (spec 19.3, 19.11). It holds only public information:
 * units, gates, timers and both players' Essence. Hands, deck order and the
 * private shuffle seeds are not part of it. It satisfies `CombatState`, so the
 * shared combat code of `src/sim/combat/` runs on it as is.
 */
export interface DuelState {
  /** Seed of this match; part of the replay identity (spec 3.2, 11.6). */
  readonly seed: number;
  /** The only random source of the simulation (spec 3.2, 11.3). */
  readonly rng: Rng;
  /** Ticks elapsed since the countdown started; 1 tick = 1/30 s (spec 3.2). */
  tick: number;
  /** Next entity id. One counter starting at 1; ids are never reused (spec 11.3). */
  nextId: number;
  /** Current phase of the match (spec 18.2). */
  phase: DuelPhase;
  /** Tick at which the current phase ends; the HUD clock counts down to it (spec 18.2). */
  phaseEndTick: number;
  /** Ticks between two income points in the current phase (spec 18.3). */
  incomeIntervalTicks: number;
  /** Tick of the next income point of both players; null during the countdown (spec 18.3). */
  nextIncomeTick: number | null;
  /** Essence and gate of each player (spec 19.3). */
  readonly sides: Record<Side, DuelSideState>;
  /** Defenders of both sides on the grid. */
  readonly defenders: DuelDefenderState[];
  /** Raiders of both sides (spec 18.6); named like the campaign list the shared code reads. */
  readonly enemies: DuelRaiderState[];
  /** Projectiles in flight; each carries the side of the defender that fired it. */
  readonly projectiles: ProjectileState[];
  /** ★3 Pyro Fox fire patches on the field (spec 5.2). */
  readonly firePatches: FirePatchState[];
  /** Null while the match runs; the result once it ended (spec 18.2). */
  result: DuelResult | null;
}

/** The simulation of one Duel (spec 19.11). */
export interface DuelSim {
  /** Read-only view of the current state for the renderer, the UI and the bots. */
  readonly state: Readonly<DuelState>;
  /** Schedules a command; it is applied at the start of that tick (spec 19.4, 19.11). */
  enqueue(cmd: DuelCommand, tick: number): void;
  /** Advances exactly one tick (1/30 s) and returns the events of that tick. */
  step(): DuelEvent[];
}
