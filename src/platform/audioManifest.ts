/**
 * Audio catalogue of spec 9.9: the music tracks, the ~35 SFX ids and the volume
 * defaults. Kept free of howler so the ids, file paths and mixing gains are unit
 * testable; `src/platform/audio.ts` owns the playback.
 *
 * The committed files live in `public/audio/` (music as M4A + OGG, SFX as M4A) and
 * are generated from the CC0 Kenney sources in `assets-src/audio/` by
 * `tools/build-assets/audio.ts` (spec 12.11).
 */

/** Music of spec 9.9: menu, World 1 calm, big-wave intensity layer, two stings. */
export type MusicId = 'menu' | 'world1_calm' | 'world1_big_wave' | 'victory' | 'defeat';

/** Music ids that are one-shot stings; the loops are the other three. */
export const STING_IDS: readonly MusicId[] = ['victory', 'defeat'];

/** SFX ids of spec 9.9, one per documented moment. */
export type SfxId =
  | 'card_select'
  | 'card_place'
  | 'card_merge'
  | 'shovel'
  | 'orb_drop'
  | 'orb_collect'
  | 'attack_straight'
  | 'attack_lob'
  | 'attack_splash'
  | 'attack_beam'
  | 'attack_diagonal'
  | 'hit_pierce'
  | 'hit_blast'
  | 'hit_arcane'
  | 'combo_steam'
  | 'combo_shatter'
  | 'combo_toxic'
  | 'combo_chain'
  | 'enemy_groan'
  | 'enemy_eat'
  | 'enemy_death'
  | 'defender_death'
  | 'trap'
  | 'wave_horn'
  | 'boss_roar'
  | 'button_tap'
  | 'chest_shake'
  | 'chest_open'
  | 'card_flip_common'
  | 'card_flip_rare'
  | 'card_flip_epic'
  | 'card_flip_legendary'
  | 'card_flip_mythic'
  | 'upgrade'
  | 'level_win'
  | 'level_lose';

/** Volume defaults of spec 9.9. */
export const DEFAULT_MUSIC_VOLUME = 0.6;
/** Volume defaults of spec 9.9. */
export const DEFAULT_SFX_VOLUME = 0.8;

/** Spec 9.9: the music ducks to 30 % of its volume during the victory/defeat stings. */
export const STING_DUCK_FACTOR = 0.3;

/** Spec 9.9: the victory and defeat stings last 3 s. */
export const STING_DURATION_MS = 3000;

/** Crossfade between two music tracks and the fade-in of the big-wave layer. */
export const MUSIC_FADE_MS = 700;

/** One music track: loop or one-shot sting, with its mixing gain. */
export interface MusicDefinition {
  readonly loop: boolean;
  readonly gain: number;
}

/** One SFX: its mixing gain relative to the SFX volume. */
export interface SfxDefinition {
  readonly gain: number;
}

/** The three looping tracks plus the two stings of spec 9.9. */
export const MUSIC_DEFINITIONS: Readonly<Record<MusicId, MusicDefinition>> = {
  menu: { loop: true, gain: 1 },
  world1_calm: { loop: true, gain: 1 },
  world1_big_wave: { loop: true, gain: 0.8 },
  victory: { loop: false, gain: 1 },
  defeat: { loop: false, gain: 1 },
};

/** Per-SFX gains balance the placeholders (frequent combat sounds sit lower). */
export const SFX_DEFINITIONS: Readonly<Record<SfxId, SfxDefinition>> = {
  card_select: { gain: 0.7 },
  card_place: { gain: 0.9 },
  card_merge: { gain: 0.9 },
  shovel: { gain: 0.9 },
  orb_drop: { gain: 0.5 },
  orb_collect: { gain: 0.8 },
  attack_straight: { gain: 0.6 },
  attack_lob: { gain: 0.6 },
  attack_splash: { gain: 0.7 },
  attack_beam: { gain: 0.6 },
  attack_diagonal: { gain: 0.6 },
  hit_pierce: { gain: 0.5 },
  hit_blast: { gain: 0.6 },
  hit_arcane: { gain: 0.5 },
  combo_steam: { gain: 0.7 },
  combo_shatter: { gain: 0.7 },
  combo_toxic: { gain: 0.7 },
  combo_chain: { gain: 0.7 },
  enemy_groan: { gain: 0.45 },
  enemy_eat: { gain: 0.6 },
  enemy_death: { gain: 0.7 },
  defender_death: { gain: 0.8 },
  trap: { gain: 0.8 },
  wave_horn: { gain: 0.8 },
  boss_roar: { gain: 0.8 },
  button_tap: { gain: 0.5 },
  chest_shake: { gain: 0.8 },
  chest_open: { gain: 0.9 },
  card_flip_common: { gain: 0.7 },
  card_flip_rare: { gain: 0.7 },
  card_flip_epic: { gain: 0.7 },
  card_flip_legendary: { gain: 0.7 },
  card_flip_mythic: { gain: 0.7 },
  upgrade: { gain: 0.9 },
  level_win: { gain: 0.8 },
  level_lose: { gain: 0.8 },
};

/** True when a music id is a one-shot victory/defeat sting (spec 9.9). */
export function isSting(id: MusicId): boolean {
  return STING_IDS.includes(id);
}

/** The two committed files of a music track, M4A first and OGG as the fallback (spec 9.9). */
export function musicFiles(id: MusicId, base: string): readonly string[] {
  return [`${base}audio/music/${id}.m4a`, `${base}audio/music/${id}.ogg`];
}

/** The committed file of one SFX (spec 11.2: `public/audio/sfx/*.m4a`). */
export function sfxFiles(id: SfxId, base: string): readonly string[] {
  return [`${base}audio/sfx/${id}.m4a`];
}
