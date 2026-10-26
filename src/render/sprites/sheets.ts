/**
 * Sprite asset loading (issue #114).
 *
 * Loads `public/sprites/manifest.json` and every character sheet, configuring the
 * textures for crisp pixel art (NearestFilter, no mipmaps, sRGB, premultiplied
 * alpha off). A missing or broken asset never throws: the result is simply null /
 * an empty sheet map, so the level can keep rendering with the 3D unit fallback.
 * Textures are cached per URL across layers and released with `releaseCharacterSheets`.
 */
import { NearestFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three';

import { parseSpriteManifest } from './manifest';
import { createPlaceholderTexture } from './placeholderTexture';
import type { SpriteCharacter, SpriteManifest, SpriteSheetTexture } from './types';

/** Virtual URL scheme of a procedurally generated placeholder sheet. */
export const PLACEHOLDER_IMAGE_PREFIX = 'placeholder:';

/** Loaded character sheets by data id (defender/enemy id). */
export type CharacterSheets = ReadonlyMap<string, SpriteSheetTexture>;

/** Shared texture loads, so two layers never fetch the same sheet twice. */
const textureLoads = new Map<string, Promise<Texture | null>>();

/** Configures a sheet texture for pixel-art sampling (spec 9.3). */
function configureSheetTexture(texture: Texture): Texture {
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Reader for the natural pixel size of a loaded image or canvas. */
function texturePixelSize(texture: Texture): { width: number; height: number } | null {
  const image: unknown = texture.image;
  if (typeof image !== 'object' || image === null) {
    return null;
  }
  const width = (image as { width?: unknown }).width;
  const height = (image as { height?: unknown }).height;
  if (typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  return { width, height };
}

/** Alpha value the sprite shader discards below (`alphaTest` 0.5 -> 128). */
const CONTENT_ALPHA_THRESHOLD = 128;

/** Upper bound of the measured bottom padding, as a fraction of one frame height. */
const MAX_BOTTOM_INSET = 0.25;

/**
 * Measures the transparent padding under the visible pixel art of the bottom frame
 * row (the manifest frames have a few px of outline padding). The ratio lets the
 * layer sink the quad so the character's feet, not the padded frame, touch the
 * ground. Returns 0 when the pixels cannot be read (canvas tainted, no 2d context).
 */
function measureBottomInset(texture: Texture, frameHeight: number): number {
  const size = texturePixelSize(texture);
  if (size === null || !(frameHeight > 0)) {
    return 0;
  }
  const source: unknown = texture.image;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      return 0;
    }
    context.drawImage(source as CanvasImageSource, 0, 0);
    const pixels = context.getImageData(0, 0, size.width, size.height).data;
    const rows = Math.max(1, Math.floor(size.height / frameHeight));
    const startY = (rows - 1) * frameHeight;
    for (let y = size.height - 1; y >= startY; y -= 1) {
      for (let x = 0; x < size.width; x += 1) {
        const alpha = pixels[(y * size.width + x) * 4 + 3] ?? 0;
        if (alpha >= CONTENT_ALPHA_THRESHOLD) {
          return Math.min(MAX_BOTTOM_INSET, (size.height - 1 - y) / frameHeight);
        }
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Loads one sheet texture; placeholder URLs are generated locally. */
function loadSheetTexture(character: SpriteCharacter, id: string): Promise<Texture | null> {
  if (character.image.startsWith(PLACEHOLDER_IMAGE_PREFIX)) {
    const texture = createPlaceholderTexture(
      id,
      character.frameWidth,
      character.frameHeight,
      character.columns,
    );
    return Promise.resolve(texture);
  }
  const cached = textureLoads.get(character.image);
  if (cached !== undefined) {
    return cached;
  }
  const load = new Promise<Texture | null>((resolve) => {
    new TextureLoader().load(
      character.image,
      (texture) => resolve(configureSheetTexture(texture)),
      undefined,
      () => {
        console.warn(`sprites: failed to load sheet ${character.image}`);
        resolve(null);
      },
    );
  });
  textureLoads.set(character.image, load);
  return load;
}

/** Loads one character sheet; null when the image is missing. */
async function loadCharacterSheet(
  id: string,
  character: SpriteCharacter,
): Promise<SpriteSheetTexture | null> {
  const texture = await loadSheetTexture(character, id);
  if (texture === null) {
    return null;
  }
  const size = texturePixelSize(texture);
  if (size === null) {
    return null;
  }
  return {
    character,
    texture,
    sheetWidth: size.width,
    sheetHeight: size.height,
    bottomInset: measureBottomInset(texture, character.frameHeight),
  };
}

/**
 * Loads every character sheet of a manifest. Sheets that fail are skipped; the
 * caller decides whether an empty result means "unavailable" or "fall back to the
 * placeholder manifest".
 */
export async function loadCharacterSheets(manifest: SpriteManifest): Promise<CharacterSheets> {
  const entries = Object.entries(manifest.characters);
  const loaded = await Promise.all(
    entries.map(([id, character]) => loadCharacterSheet(id, character)),
  );
  const sheets = new Map<string, SpriteSheetTexture>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const sheet = loaded[index];
    if (entry !== undefined && sheet !== null && sheet !== undefined) {
      sheets.set(entry[0], sheet);
    }
  }
  return sheets;
}

/** Loads and parses the real manifest; null when it is missing or invalid. */
export async function loadSpriteManifest(manifestUrl: string): Promise<SpriteManifest | null> {
  try {
    const response = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!response.ok) {
      return null;
    }
    return parseSpriteManifest(await response.json());
  } catch {
    return null;
  }
}

/** Disposes the textures of a loaded sheet set and drops them from the shared cache. */
export function releaseCharacterSheets(sheets: CharacterSheets): void {
  for (const sheet of sheets.values()) {
    sheet.texture.dispose();
  }
}
