/**
 * Simulation contract (spec 11.3). Everything outside `src/sim/` only talks to
 * the simulation through these types. The simulation is headless and
 * deterministic (spec 3.2); it never touches the DOM or the render layer.
 */

/** A player input, applied in order at the start of the next tick (spec 11.3). */
export type Command =
  | { type: 'place'; defenderId: string; lane: number; col: number }
  | { type: 'shovel'; lane: number; col: number }
  | { type: 'collectOrb'; orbId: number }
  | { type: 'setAutoCollect'; on: boolean };

/** Something the player can see or hear; emitted by `step()` (spec 11.3). */
export type SimEvent =
  | {
      type: 'defenderPlaced';
      id: number;
      defenderId: string;
      lane: number;
      col: number;
      stars: 1 | 2 | 3;
    }
  | { type: 'defenderMerged'; id: number; stars: 2 | 3 }
  | { type: 'defenderRemoved'; id: number; reason: 'shovel' | 'eaten' | 'destroyed' }
  | { type: 'enemySpawned'; id: number; enemyId: string; lane: number }
  | { type: 'attack'; sourceId: number; targetId: number | null }
  | { type: 'projectileSpawned'; id: number; kind: string; x: number; lane: number }
  | { type: 'projectileEnded'; id: number }
  | {
      type: 'hit';
      targetId: number;
      amount: number;
      damageType: 'pierce' | 'blast' | 'arcane';
      crit: boolean;
    }
  | {
      type: 'statusApplied';
      targetId: number;
      status: 'slow' | 'freeze' | 'burn' | 'poison' | 'stun' | 'wet';
    }
  | { type: 'combo'; combo: 'steam' | 'shatter' | 'toxic' | 'chain'; x: number; lane: number }
  | { type: 'enemyDied'; id: number }
  | { type: 'orbSpawned'; id: number; x: number; lane: number; value: number }
  | { type: 'orbCollected'; id: number }
  | { type: 'orbExpired'; id: number }
  | { type: 'waveStarted'; index: number; kind: 'normal' | 'big' | 'final' }
  | { type: 'trapFired'; lane: number }
  | { type: 'levelWon'; stars: 1 | 2 | 3 }
  | { type: 'levelLost' }
  | {
      type: 'commandRejected';
      reason: 'notEnoughEssence' | 'onCooldown' | 'tileOccupied' | 'invalidTile';
    };

/** One card in the level loadout: a defender id and its card level (spec 11.3, 3.12). */
export interface LoadoutEntry {
  defenderId: string;
  level: number;
}

/**
 * Seeded random generator (mulberry32, spec 3.2). `state` is part of the
 * simulation state so that replays and state hashes can compare it (spec 11.6).
 */
export interface Rng {
  /** Current internal generator state. */
  state: number;
  /** Returns the next pseudo-random number in [0, 1). */
  next(): number;
}

/** A defender standing on the grid (spec 11.3). Later issues extend it with health and timers. */
export interface DefenderState {
  id: number;
  defenderId: string;
  lane: number;
  col: number;
  stars: 1 | 2 | 3;
}

/** An enemy walking along a lane (spec 11.3). Later issues extend it with health and statuses. */
export interface EnemyState {
  id: number;
  enemyId: string;
  lane: number;
  x: number;
}

/** A projectile in flight (spec 11.3). */
export interface ProjectileState {
  id: number;
  kind: string;
  lane: number;
  x: number;
}

/** An Essence orb on the field (spec 3.3, 11.3). */
export interface OrbState {
  id: number;
  lane: number;
  x: number;
  value: number;
}

/**
 * The simulated game state. It is exposed read-only to the renderer and the UI,
 * which only read it; the simulation mutates it internally (spec 11.3).
 */
export interface SimState {
  /** Id of the level being simulated (spec 7.1, 11.6). */
  readonly levelId: string;
  /** Seed of this run; part of the replay identity (spec 3.2, 11.6). */
  readonly seed: number;
  /** The player's loadout for this level (spec 3.12). */
  readonly loadout: readonly LoadoutEntry[];
  /** Ticks elapsed since the level started; 1 tick = 1/30 s (spec 3.2). */
  tick: number;
  /** The only random source of the simulation (spec 3.2, 11.3). */
  readonly rng: Rng;
  /** Next entity id. One counter starting at 1; ids are never reused (spec 11.3). */
  nextId: number;
  /** Essence available to the player (spec 3.3). */
  essence: number;
  /** Whether orbs are collected automatically (setting, default off; spec 3.3). */
  autoCollect: boolean;
  /** Defenders currently on the grid (spec 11.3). */
  readonly defenders: DefenderState[];
  /** Enemies currently in the level (spec 11.3). */
  readonly enemies: EnemyState[];
  /** Projectiles currently in flight (spec 11.3). */
  readonly projectiles: ProjectileState[];
  /** Essence orbs currently on the field (spec 3.3, 11.3). */
  readonly orbs: OrbState[];
}

/** The simulation of one level run. It is the only entry point into `src/sim/` (spec 11.2). */
export interface Sim {
  /** Read-only view of the current state for the renderer and the UI (spec 11.3). */
  readonly state: Readonly<SimState>;
  /** Queues a command; it is applied at the start of the next tick, in order (spec 11.3). */
  enqueue(cmd: Command): void;
  /** Advances exactly one tick (1/30 s) and returns the events of that tick (spec 11.3). */
  step(): SimEvent[];
}

/**
 * Temporary structural view of a level definition (spec 7.1). The authoritative
 * `LevelDef` comes from the Zod schemas that issue #17 adds to `src/data/`; this
 * subset only covers what the skeleton needs.
 * TODO(#18): import the LevelDef type from src/data and delete this interface.
 */
export interface LevelDef {
  readonly id: string;
  readonly startEssence: number;
}
