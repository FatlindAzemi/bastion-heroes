/**
 * Device haptics stub (spec 9.9, 6.3). The real Capacitor Haptics plugin arrives with
 * the mobile shell in M6 (spec 10.2, 11.2); until then the calls are recorded for
 * diagnostics, so the renderer/UI can already request the documented moments (light
 * on placement, medium on trap fire, heavy on win and loss, spec 9.9). The settings
 * screen can turn the requests off.
 */

/** The three haptic strengths of spec 9.9. */
export type HapticStrength = 'light' | 'medium' | 'heavy';

/** The haptic requested most recently; diagnostic only (M6 plays it on a device). */
let lastStrength: HapticStrength | null = null;

/** The player setting; false turns every request into a no-op. */
let enabled = true;

/** Requests one haptic pulse; a no-op while disabled or until the M6 plugin lands. */
export function playHaptic(strength: HapticStrength): void {
  if (!enabled) {
    return;
  }
  lastStrength = strength;
}

/** Applies the haptics setting (spec 4.8). */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** True while haptic requests are recorded. */
export function hapticsEnabled(): boolean {
  return enabled;
}

/** The last requested strength (diagnostics/tests); null before the first request. */
export function lastHapticStrength(): HapticStrength | null {
  return lastStrength;
}

/** Test-only reset of the diagnostic state. */
export function resetHapticsForTests(): void {
  lastStrength = null;
  enabled = true;
}
