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
  // Contract extension for the M1 row 1.5 "banners as events" (spec 3.10): the
  // big-wave warning is shown 3 s before the wave, the final banner at its start.
  | { type: 'waveBanner'; index: number; kind: 'big' | 'final' }
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

/** One command of a replay, recorded with the tick whose phase 1 applies it (spec 11.6). */
export interface ReplayCommand {
  tick: number;
  cmd: Command;
}

/**
 * A recorded level run (spec 11.6): the same level, seed, loadout and commands
 * always produce the same states, compared through `hashState` in src/sim/hash.ts.
 */
export interface Replay {
  levelId: string;
  seed: number;
  loadout: LoadoutEntry[];
  commands: ReplayCommand[];
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

/** A defender standing on the grid (spec 11.3, 3.4, 5.2). */
export interface DefenderState {
  id: number;
  defenderId: string;
  lane: number;
  col: number;
  stars: 1 | 2 | 3;
  /** Current health. Base hp is set on placement; card-level/star scaling is #21. */
  hp: number;
  maxHp: number;
  /** Card level of the loadout slot it was placed from (spec 4.2). */
  cardLevel: number;
  /** First tick at which the defender may act or be targeted, after its 0.5 s drop (spec 3.4). */
  activeAtTick: number;
  /** Absolute tick of its next producer orb, or null if the defender does not produce (spec 5.2). */
  nextOrbTick: number | null;
  /** Absolute tick at which the defender may fire again (spec 5.2 attackIntervalS). */
  nextAttackTick: number;
  /** Tick at which a trap defender is armed; null while unarmed, used up or rearming (spec 4.3). */
  trapReadyAtTick: number | null;
  /** True once a ★3 trap used its one rearm (spec 4.3, 5.2). */
  trapRearmed: boolean;
  /** Attacks fired so far; the `freezeEveryNthAttack` counter uses it (spec 4.5, 5.2). */
  attackCount: number;
  /** Extra bolts still to fire in the current ★3 burst attack; 0 when not bursting (spec 5.2). */
  burstShotsRemaining: number;
}

/** A defender element of spec 4.6/5.2. */
export type ElementKind = 'fire' | 'frost' | 'storm' | 'poison' | 'none';

/** The four elemental combos of spec 4.6. */
export type ComboId = 'steam' | 'shatter' | 'toxic' | 'chain';

/** Per-enemy per-combo cooldown timers (spec 4.6: one trigger per combo every 2.0 s). */
export interface ComboCooldownState {
  steam: number;
  shatter: number;
  toxic: number;
  chain: number;
}

/** The seven enemy status effects of spec 4.5. */
export type StatusKind = 'slow' | 'freeze' | 'burn' | 'poison' | 'stun' | 'knockback' | 'wet';

/** One active status on an enemy (spec 4.5). The renderer reads it for tints/VFX, combos use it. */
export interface EnemyStatusState {
  kind: StatusKind;
  /** Tick at which the status expires (wet is refreshed every tick while on water). */
  expiresAtTick: number;
  /** Tick of the next periodic damage tick (burn/poison only), null otherwise. */
  nextTickAt: number | null;
  /** Knockback only: tiles pushed to the right per tick. */
  knockbackTilesPerTick: number;
}

/** An enemy walking along a lane (spec 3.8, 11.3). */
export interface EnemyState {
  id: number;
  enemyId: string;
  lane: number;
  x: number;
  /** Current health; reduced by projectiles (spec 4.2). */
  hp: number;
  maxHp: number;
  /** Index of the wave that spawned this enemy; the early-clear rule of 3.10 uses it. */
  waveIndex: number;
  /** Defender currently blocking this enemy, or null when it walks freely (spec 3.8). */
  blockedByDefenderId: number | null;
  /** Tick of the next bite of the blocking defender, or null when it is not biting (spec 4.7). */
  nextBiteTick: number | null;
  /** Active status effects, in application order (spec 4.5). */
  statuses: EnemyStatusState[];
  /** Per-combo cooldown: the earliest tick at which this enemy may trigger each combo (spec 4.6). */
  comboCooldowns: ComboCooldownState;
  /** Remaining shield health; 0 for enemies without a shield (spec 6.2 Shieldbearer). */
  shieldHp: number;
  /** True once the armor broke (spec 6.2 Pot-Head Gloomling: pot falls off at 200 hp). */
  armorBroken: boolean;
  /** Tick of the next heal pulse, or null when the enemy does not heal (spec 6.2 Gloom Priest). */
  nextHealTick: number | null;
  /** True once a one-time throw special fired (spec 6.2 Gloom Ogre: at 50 % health). */
  hasThrown: boolean;
}

/**
 * A projectile in flight (spec 4.3, 11.3). The optional timing fields describe
 * the pattern: `targetId`/`landTick` for the arcs of lob and splash, `splashRadius`
 * for splash, and `targetLane`/`switchAtX` for the diagonal lane switch.
 */
export interface ProjectileState {
  id: number;
  kind: string;
  lane: number;
  x: number;
  /** X the projectile was fired from (the arc origin, spec 4.3). */
  originX: number;
  /** Id of the defender that fired it (spec 11.3 attack event). */
  sourceId: number;
  /** Damage before the armor multiplier T; T is applied when it hits (spec 4.2). */
  damage: number;
  damageType: 'pierce' | 'blast' | 'arcane';
  /** True when this projectile can hit flying enemies (spec 4.4 rule 4). */
  hitsFlying: boolean;
  /** Lob/splash: the enemy the arc is thrown at; null for straight and diagonal. */
  targetId: number | null;
  /** Lob/splash: tick at which the arc lands; null for straight and diagonal. */
  landTick: number | null;
  /** Splash: impact radius in tiles; null for every other pattern. */
  splashRadius: number | null;
  /** Diagonal: lane to switch to at `switchAtX`; null for every other pattern. */
  targetLane: number | null;
  /** Diagonal: world x at which the projectile switches to `targetLane`; null otherwise. */
  switchAtX: number | null;
  /** Status this projectile applies to every enemy it hits, or null (spec 4.5, 5.2). */
  statusKind: StatusKind | null;
  /** Duration in seconds of the applied status (spec 4.5). */
  statusDurationS: number;
  /** Poison stacks of the applied status (1 for every other status, spec 4.5). */
  statusStacks: number;
  /** Element of the defender that fired it; the 4.6 combos match on it. */
  element: ElementKind;
  /**
   * ★3 piercing bonuses: enemies the projectile may still pass through after its
   * first hit; 0 for every normal projectile (spec 5.2 Rune Archer).
   */
  piercesRemaining: number;
  /** ★3 Pyro Fox: the Burn patch left at the impact point, or null (spec 5.2). */
  firePatch: FirePatchSpec | null;
}

/** The area and lifetime of a ★3 Pyro Fox fire patch (spec 5.2). */
export interface FirePatchSpec {
  /** Impact radius in tiles (spec 5.2: 0.5). */
  radiusTiles: number;
  /** Lifetime in ticks (spec 5.2: 2.0 s). */
  durationTicks: number;
}

/**
 * A ★3 Pyro Fox fire patch on the field (spec 5.2): a small area that keeps
 * applying Burn to every enemy inside until it expires.
 */
export interface FirePatchState {
  id: number;
  lane: number;
  /** World x of the impact point. */
  x: number;
  /** Impact radius in tiles (spec 5.2: 0.5). */
  radiusTiles: number;
  /** Tick at which the patch disappears. */
  expiresAtTick: number;
  /** Tick of the next Burn application to the enemies inside the patch. */
  nextBurnTick: number;
}

/**
 * An Essence orb on the field (spec 3.3, 11.3). The tick fields tell the
 * renderer where the drop animation is: from `spawnTick` to `landTick` it falls,
 * then it sits on the tile until `expiresAtTick`.
 */
export interface OrbState {
  id: number;
  lane: number;
  x: number;
  value: number;
  /** Tick the orb spawned (spec 3.3). */
  spawnTick: number;
  /** Tick the orb lands on its tile: spawnTick + 1.0 s (spec 3.3). */
  landTick: number;
  /** Tick the orb expires: landTick + 8.0 s, then it is lost (spec 3.3). */
  expiresAtTick: number;
}

/** One enemy of the current wave that still has to spawn, in spawn order (spec 7.1). */
export interface PendingSpawn {
  enemyId: string;
  /** Lane chosen at wave start; "random" lanes never repeat a lane three times (spec 7.1). */
  lane: number;
}

/**
 * Wave runner state (spec 3.10, 7.1). The UI (#26) reads it for the wave progress
 * bar and banners, and the win check (#22) uses `allWavesSpawned` and `pendingSpawns`.
 */
export interface WaveState {
  /** Index of the current wave; -1 until the first wave starts. */
  index: number;
  /** Tick at which the next wave starts (firstWaveDelay / duration end); null = no timer (final wave). */
  nextWaveTick: number | null;
  /** Enemies of the current wave still to spawn, in spawn order (spec 7.1). */
  pendingSpawns: PendingSpawn[];
  /** Tick of the next enemy spawn of the current wave (spec 3.10). */
  nextSpawnTick: number;
  /** Tick at which the current wave advances because all its enemies are dead; null = not cleared (spec 3.10). */
  earlyClearTick: number | null;
  /** True once the final wave has started; #22 uses it for the win check (spec 3.10). */
  allWavesSpawned: boolean;
  /** Pending big-wave banner: index of the wave it announces, null when none is pending (spec 3.10). */
  bannerWaveIndex: number | null;
  /** Pending big-wave banner: tick at which it is shown, null when none is pending (spec 3.10). */
  bannerTick: number | null;
}

/** The Last Stand Trap of one lane (spec 3.9). The renderer can read `rollerX` for the rolling VFX. */
export interface TrapState {
  /** True once the trap was used; one use per lane per level (spec 3.9). */
  used: boolean;
  /** World x of the roller while it rolls from trapStartX to trapEndX; null when it is not rolling. */
  rollerX: number | null;
}

/** Status of the level run (spec 3.9, 3.10). */
export type LevelStatus = 'playing' | 'won' | 'lost';

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
  /**
   * Absolute tick at which each loadout card becomes usable again, index-aligned
   * with `loadout`. 0 means the card is ready (spec 3.5).
   */
  cardCooldownEndTicks: number[];
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
  /** ★3 Pyro Fox fire patches currently on the field (spec 5.2). */
  readonly firePatches: FirePatchState[];
  /** Wave runner state (spec 3.10). */
  wave: WaveState;
  /** One Last Stand Trap per lane (spec 3.9); the renderer can read the roller positions. */
  readonly traps: TrapState[];
  /** 'playing' until the win/loss check ends the level; commands are ignored afterwards (spec 3.9, 3.10). */
  status: LevelStatus;
  /** Stars earned by a win: 0 while playing or lost, 1-3 after a win (spec 3.11). */
  stars: 0 | 1 | 2 | 3;
  /** Defenders lost to enemies in this run; the 3-star rule of 3.11 uses it. */
  defendersLost: number;
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
 * The level definition lives in the data layer since issue #17 (spec 7.1, 11.5).
 * The sim re-exports it here so that the rest of the simulation has one import path.
 */
export type { LevelDef } from '../data';
