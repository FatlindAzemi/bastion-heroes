/**
 * Types of the spec 9.7 VFX layer (issue #75). Every VFX id has its own module in
 * `src/render/vfx/<id>.ts`; all modules export one `VfxDefinition` that the shared
 * particle system and the effect layer read. Keeping the definitions data-only keeps
 * them unit-testable and keeps the per-frame work allocation-free.
 */

/** The eighteen VFX ids of the spec 9.7 table. */
export type VfxId =
  | 'spawn_dust'
  | 'hit_pierce'
  | 'hit_blast'
  | 'hit_arcane'
  | 'status_slow'
  | 'status_freeze'
  | 'status_burn'
  | 'status_poison'
  | 'combo_steam'
  | 'combo_shatter'
  | 'combo_toxic'
  | 'combo_chain'
  | 'essence_orb'
  | 'death_poof_enemy'
  | 'death_poof_defender'
  | 'trap_roll'
  | 'merge_star'
  | 'win_confetti';

/** The six sprites of the shared 512x512 particle sheet (4x2 atlas, row-major). */
export type VfxSprite = 0 | 1 | 2 | 3 | 4 | 5;

/** Names of the sprites in atlas-cell order (used by tests and the texture tool). */
export const SPRITE_NAMES = [
  'soft_circle',
  'star',
  'spark',
  'smoke_puff',
  'snowflake',
  'rune',
] as const;

/** One particle preset of a VFX definition. */
export interface VfxDefinition {
  readonly id: VfxId;
  /** Atlas cell of the shared particle sheet (spec 9.7 sprite list). */
  readonly sprite: VfxSprite;
  /** Sprite tints, picked per particle (spec 9.4 palette colours). */
  readonly colors: readonly number[];
  /** Particles emitted per burst. */
  readonly count: number;
  /** Initial outward speed in units per second. */
  readonly speed: number;
  /** Initial upward speed in units per second. */
  readonly upward: number;
  /** Downward acceleration in units per second squared; negative floats up (smoke). */
  readonly gravity: number;
  /** Lifetime range of one particle in seconds. */
  readonly lifeMin: number;
  readonly lifeMax: number;
  /** Sprite size in world units. */
  readonly size: number;
}

/** One spawned effect at a world position. */
export interface VfxSpawn {
  readonly id: VfxId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Optional tint override for popups and damage numbers. */
  readonly color?: number;
}
