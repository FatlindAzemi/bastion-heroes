/**
 * Public entry point of the 2.5D sprite billboard layer (issue #114).
 *
 * The Lead swaps the GLB unit layer for this one 1:1:
 *
 * ```ts
 * const units = createSpriteUnitLayer(unitGroup, { camera, particles });
 * void units.ready.then((available) => {
 *   // keep or hide the 3D unit layer based on `available`
 * });
 * ```
 *
 * Types only, plus the single factory: the pure frame/billboard helpers and the
 * parser live in their own modules for the unit tests.
 */
export { createSpriteUnitLayer } from './layer';
export { parseSpriteManifest, resolveSpriteClip } from './manifest';
export { loadSpriteManifest } from './sheets';
export type {
  SpriteCharacter,
  SpriteClip,
  SpriteClipName,
  SpriteManifest,
  SpriteProp,
  SpriteSheet,
  SpriteUnitLayer,
  SpriteUnitLayerOptions,
} from './types';
