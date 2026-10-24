/**
 * Debug-only screenshot trigger for the spec 9.7 VFX set: `?debugvfx=<id>` fires
 * one VFX at the middle of the board every 900 ms, and `?debugvfx=shake` triggers
 * the 9.7 screen shake. It follows the additive debug-URL helpers of issue #66/#74
 * and is ignored when malformed; nothing here changes the simulation.
 */

import { isVfxId } from './definitions';
import type { VfxId } from './types';

/** A parsed debug VFX request: an id to loop, and/or the shake trigger. */
export interface DebugVfx {
  readonly id: VfxId | null;
  readonly shake: boolean;
}

/** Parses `?debugvfx=combo_steam` or `?debugvfx=shake`; null when absent or unknown. */
export function readDebugVfx(search: string): DebugVfx | null {
  const raw = new URLSearchParams(search).get('debugvfx');
  if (raw === null) {
    return null;
  }
  if (raw === 'shake') {
    return { id: null, shake: true };
  }
  if (!isVfxId(raw)) {
    return null;
  }
  return { id: raw, shake: false };
}
