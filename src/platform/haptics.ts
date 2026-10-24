/**
 * Device haptics stub (spec 9.9, 6.3). The real Capacitor Haptics plugin arrives with
 * the mobile shell in M6 (spec 10.2, 11.2); until then every call is a no-op, so the
 * renderer/UI can already call the documented moments (light on placement, medium on
 * trap fire, heavy on win and loss, spec 9.9) without a device build.
 */

/** The three haptic strengths of spec 9.9. */
export type HapticStrength = 'light' | 'medium' | 'heavy';

/** The haptic requested most recently; diagnostic only (M6 plays it on a device). */
let lastStrength: HapticStrength | null = null;

/** Requests one haptic pulse; a no-op until the M6 Capacitor plugin lands. */
export function playHaptic(strength: HapticStrength): void {
  lastStrength = strength;
}

/** The last requested strength (diagnostics/tests); null before the first request. */
export function lastHapticStrength(): HapticStrength | null {
  return lastStrength;
}

/** Test-only reset of the diagnostic state. */
export function resetHapticsForTests(): void {
  lastStrength = null;
}
