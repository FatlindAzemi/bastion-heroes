import type { SimState } from '../sim/types';

/**
 * The part of a simulation state the unit, projectile and VFX layers read. The
 * campaign `SimState` satisfies it as is; the Duel scene builds one per tick from
 * the mirrored Duel state (spec 18.1), so both modes share the same layers.
 */
export type RenderSimState = Pick<
  SimState,
  'tick' | 'defenders' | 'enemies' | 'projectiles' | 'orbs' | 'traps'
>;
