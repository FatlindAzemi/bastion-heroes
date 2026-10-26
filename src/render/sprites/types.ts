/**
 * 2.5D sprite billboard layer types (issue #114).
 *
 * The sprite atlases are generated in parallel by the sprite-forge tooling and
 * described by `public/sprites/manifest.json`; the schema below is the contract
 * between that pipeline and this render layer. Everything here is data only, so
 * the manifest parser and the frame/billboard logic can be unit-tested without a
 * GPU (see `tests/render/sprites.test.ts`).
 */
import type { Camera, Texture } from 'three';

import type { UnitLayer, UnitLayerOptions } from '../units';

/** The animation clips a character sheet may contain (sprite-forge manifest contract). */
export type SpriteClipName = 'idle' | 'attack' | 'walk' | 'eat' | 'produce' | 'victory';

/** Every clip name, in the order a missing-clip fallback resolves them. */
export const SPRITE_CLIP_NAMES: readonly SpriteClipName[] = [
  'idle',
  'walk',
  'attack',
  'eat',
  'produce',
  'victory',
];

/** One clip: row-major frame indices into the sheet grid, playback fps and loop flag. */
export interface SpriteClip {
  readonly frames: readonly number[];
  readonly fps: number;
  readonly loop: boolean;
}

/** A rectangular area of one sprite sheet (frameWidth/frameHeight are pixel sizes). */
export interface SpriteSheet {
  /** URL of the sheet from the manifest; the placeholder scheme uses `placeholder:<id>`. */
  readonly image: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Frames per row; rows are derived from the real image height after loading. */
  readonly columns: number;
  /** Character height in world units, measured from bottom-center anchor to the top. */
  readonly worldHeight: number;
}

/** One character sheet: a sheet plus its animation clips (`idle` is mandatory). */
export interface SpriteCharacter extends SpriteSheet {
  readonly clips: Readonly<Partial<Record<SpriteClipName, SpriteClip>>>;
}

/** One static environment prop sheet (not drawn by the unit layer, exposed for the level). */
export type SpriteProp = SpriteSheet;

/** The parsed `public/sprites/manifest.json`. */
export interface SpriteManifest {
  readonly version: 1;
  readonly characters: Readonly<Record<string, SpriteCharacter>>;
  readonly props: Readonly<Record<string, SpriteProp>>;
}

/** A loaded character sheet: the texture plus the real pixel size needed for UV maths. */
export interface SpriteSheetTexture {
  readonly character: SpriteCharacter;
  readonly texture: Texture;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  /**
   * Transparent bottom padding of the pixel-art frames, measured from the sheet's
   * alpha, as a fraction of one frame height. The quad is sunk by this much so the
   * visible content (not the padded frame) stands on the ground point.
   */
  readonly bottomInset: number;
}

/** Options of the sprite unit layer: the unit-layer options plus sprite/asset options. */
export interface SpriteUnitLayerOptions extends UnitLayerOptions {
  /** Camera used for the billboard orientation; can also be set with `setCamera`. */
  readonly camera?: Camera;
  /** Manifest URL; defaults to `<BASE_URL>sprites/manifest.json`. */
  readonly manifestUrl?: string;
  /**
   * Development fallback: when the real manifest cannot be loaded, draw procedural
   * placeholder quads instead of nothing. Off by default so the Lead keeps the 3D
   * unit layer visible until the atlas pipeline has delivered its files.
   */
  readonly placeholderFallback?: boolean;
  /** Called once the asset loading settled; `true` when at least one sheet is usable. */
  readonly onReady?: (available: boolean) => void;
  /**
   * Readability multiplier on the manifest `worldHeight` (default 1.25, clamped to
   * 1..3). It scales the billboard height and the ground shadow together, so the
   * sprites stay proportionally grounded on a portrait phone screen.
   */
  readonly worldScale?: number;
}

/**
 * The sprite unit layer. Structural 1:1 replacement for `UnitLayer` (same calls and
 * semantics), plus the asynchronous availability surface the Lead needs to decide
 * whether the 3D unit layer should stay.
 */
export interface SpriteUnitLayer extends UnitLayer {
  /** Resolves `true` when at least one character sheet loaded; `false` when empty. */
  readonly ready: Promise<boolean>;
  /** Current availability: true once the first usable sheet or placeholder is loaded. */
  readonly available: boolean;
  /**
   * Character ids with a loaded sheet. The sprite-forge atlas is generated in
   * parallel, so the Lead can use this to check whether the whole roster is covered
   * before hiding the 3D unit layer (a unit without a sheet is simply not drawn).
   */
  readonly loadedCharacters: ReadonlySet<string>;
  /** Sets the camera used for camera-facing billboards (the level scene camera). */
  setCamera(camera: Camera): void;
}
