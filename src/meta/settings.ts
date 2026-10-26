/**
 * Settings glue of M4: the save owns music/SFX volume, auto-collect, haptics and
 * language; this module pushes them into the platform wrappers at boot and after
 * every change. Auto-collect is read by `src/main.ts` when a level starts.
 */
import { setVolumes } from '../platform/audio';
import { setHapticsEnabled } from '../platform/haptics';
import type { SaveData, Settings } from './save';

/** Pushes the persisted settings into the audio and haptics platforms. */
export function applySettings(save: SaveData): void {
  setVolumes({ music: save.settings.music, sfx: save.settings.sfx });
  setHapticsEnabled(save.settings.haptics);
}

/** Clamps a settings patch to the valid ranges before it is saved. */
export function sanitizeSettings(patch: Partial<Settings>): Partial<Settings> {
  const clean: Partial<Settings> = { ...patch };
  if (patch.music !== undefined) {
    clean.music = Math.min(1, Math.max(0, patch.music));
  }
  if (patch.sfx !== undefined) {
    clean.sfx = Math.min(1, Math.max(0, patch.sfx));
  }
  return clean;
}
