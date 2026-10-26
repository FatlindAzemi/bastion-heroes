/**
 * Debug-only screenshot helper for the 2.5D combat juice (issue #114 §3):
 * `?debugjuice=numbers` loops a row of damage numbers (one per damage type plus a
 * crit), `?debugjuice=rings` loops the AOE ground rings and shockwaves in the
 * emerald/gold/violet palette and `?debugjuice=flash` loops the white impact
 * flashes. Additive like the `?debugvfx=` and `?debuganim=` helpers, ignored when
 * malformed, and never touches the simulation.
 */

/** The three deterministic juice showcase modes. */
export type DebugJuiceMode = 'numbers' | 'rings' | 'flash';

/** Every mode, used for the lookup. */
const DEBUG_JUICE_MODES: readonly DebugJuiceMode[] = ['numbers', 'rings', 'flash'];

/** Parses `?debugjuice=numbers|rings|flash`; null when absent or unknown. */
export function readDebugJuice(search: string): DebugJuiceMode | null {
  const raw = new URLSearchParams(search).get('debugjuice');
  if (raw === null) {
    return null;
  }
  return DEBUG_JUICE_MODES.find((mode) => mode === raw) ?? null;
}
