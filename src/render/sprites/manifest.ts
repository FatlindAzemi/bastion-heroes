/**
 * Sprite manifest parsing and clip resolution (issue #114).
 *
 * Pure data code: it reads the untrusted `public/sprites/manifest.json` produced by
 * the sprite-forge pipeline, validates it field by field and never throws on a
 * malformed or missing entry (a broken sheet must not break the level). No three.js
 * or DOM imports, so `tests/render/sprites.test.ts` covers it in Node.
 */
import {
  SPRITE_CLIP_NAMES,
  type SpriteCharacter,
  type SpriteClip,
  type SpriteClipName,
  type SpriteManifest,
  type SpriteSheet,
} from './types';

/** Default fps of a clip that omits it; the manifest contract always sends one. */
export const DEFAULT_CLIP_FPS = 8;

/** Placeholder world height used when the real atlas pipeline has not delivered yet. */
const PLACEHOLDER_WORLD_HEIGHT = 0.9;
const PLACEHOLDER_FRAME_WIDTH = 48;
const PLACEHOLDER_FRAME_HEIGHT = 64;
const PLACEHOLDER_COLUMNS = 4;

/** True for a plain JSON object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a finite number greater than zero, or null when the value is invalid. */
function positiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Reads a non-empty string, or null when the value is invalid. */
function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return value;
}

/** Parses one clip object; returns null when it has no usable frames. */
function parseClip(value: unknown): SpriteClip | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawFrames = value['frames'];
  if (!Array.isArray(rawFrames)) {
    return null;
  }
  const frames: number[] = [];
  for (const frame of rawFrames) {
    if (typeof frame !== 'number' || !Number.isInteger(frame) || frame < 0) {
      return null;
    }
    frames.push(frame);
  }
  if (frames.length === 0) {
    return null;
  }
  const fps = positiveNumber(value['fps']) ?? DEFAULT_CLIP_FPS;
  const loop = value['loop'];
  return { frames, fps, loop: typeof loop === 'boolean' ? loop : true };
}

/** Parses the shared sheet fields (image, frame size, columns, world height). */
function parseSheet(value: unknown): SpriteSheet | null {
  if (!isRecord(value)) {
    return null;
  }
  const image = nonEmptyString(value['image']);
  const frameWidth = positiveNumber(value['frameWidth']);
  const frameHeight = positiveNumber(value['frameHeight']);
  const columns = positiveNumber(value['columns']);
  const worldHeight = positiveNumber(value['worldHeight']);
  if (image === null || frameWidth === null || frameHeight === null || columns === null) {
    return null;
  }
  if (worldHeight === null) {
    return null;
  }
  return { image, frameWidth, frameHeight, columns: Math.floor(columns), worldHeight };
}

/** Parses one character sheet; a sheet without a usable idle clip is dropped. */
function parseCharacter(value: unknown): SpriteCharacter | null {
  const sheet = parseSheet(value);
  if (sheet === null || !isRecord(value)) {
    return null;
  }
  const rawClips = value['clips'];
  if (!isRecord(rawClips)) {
    return null;
  }
  const clips: Partial<Record<SpriteClipName, SpriteClip>> = {};
  for (const name of SPRITE_CLIP_NAMES) {
    const clip = parseClip(rawClips[name]);
    if (clip !== null) {
      clips[name] = clip;
    }
  }
  if (clips.idle === undefined) {
    return null;
  }
  return { ...sheet, clips };
}

/** Parses a props record; props need no clips, an invalid one is skipped. */
function parseProps(value: unknown): Record<string, SpriteSheet> {
  const props: Record<string, SpriteSheet> = {};
  if (!isRecord(value)) {
    return props;
  }
  for (const [id, entry] of Object.entries(value)) {
    const sheet = parseSheet(entry);
    if (sheet !== null) {
      props[id] = sheet;
    }
  }
  return props;
}

/**
 * Parses the raw JSON of `public/sprites/manifest.json`. Returns null when the
 * document is unusable (wrong version, no valid characters); individual broken
 * character or clip entries are skipped so one bad sheet never breaks the layer.
 */
export function parseSpriteManifest(raw: unknown): SpriteManifest | null {
  if (!isRecord(raw) || raw['version'] !== 1) {
    return null;
  }
  const rawCharacters = raw['characters'];
  if (!isRecord(rawCharacters)) {
    return null;
  }
  const characters: Record<string, SpriteCharacter> = {};
  for (const [id, entry] of Object.entries(rawCharacters)) {
    const character = parseCharacter(entry);
    if (character !== null) {
      characters[id] = character;
    }
  }
  if (Object.keys(characters).length === 0) {
    return null;
  }
  return { version: 1, characters, props: parseProps(raw['props']) };
}

/**
 * Resolves the clip to play: the requested one when present, otherwise the idle
 * loop (sprite-forge may omit clips a model does not have, but idle is mandatory).
 */
export function resolveSpriteClip(
  character: SpriteCharacter,
  name: SpriteClipName,
): SpriteClip | null {
  return character.clips[name] ?? character.clips.idle ?? null;
}

/** The base loop of a unit: enemies walk, defenders stand idle (spec 9.6). */
export function baseClipName(kind: 'defender' | 'enemy'): SpriteClipName {
  return kind === 'enemy' ? 'walk' : 'idle';
}

/** Builds one placeholder clip used until the real atlases are generated. */
function placeholderClip(frames: readonly number[], fps: number): SpriteClip {
  return { frames, fps, loop: true };
}

/**
 * Development fallback manifest: procedural colored placeholder quads for the whole
 * roster, used only when `placeholderFallback` is enabled and the real manifest is
 * missing. It follows the exact shape of the sprite-forge manifest contract, so the
 * same parsing, clip and billboard code paths are exercised without the assets.
 */
export function createPlaceholderManifest(characterIds: readonly string[]): SpriteManifest {
  const clips: Record<SpriteClipName, SpriteClip> = {
    idle: placeholderClip([0, 1, 2, 1], 8),
    walk: placeholderClip([0, 1, 2, 3], 10),
    attack: placeholderClip([0, 2, 3, 1], 12),
    eat: placeholderClip([1, 2, 1], 10),
    produce: placeholderClip([0, 3, 0, 3], 8),
    victory: placeholderClip([2, 0, 2, 0], 8),
  };
  const characters: Record<string, SpriteCharacter> = {};
  for (const id of characterIds) {
    characters[id] = {
      image: `placeholder:${id}`,
      frameWidth: PLACEHOLDER_FRAME_WIDTH,
      frameHeight: PLACEHOLDER_FRAME_HEIGHT,
      columns: PLACEHOLDER_COLUMNS,
      worldHeight: PLACEHOLDER_WORLD_HEIGHT,
      clips,
    };
  }
  return { version: 1, characters, props: {} };
}
