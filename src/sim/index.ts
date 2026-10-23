/**
 * The simulation layer (spec 11.1, 11.2). Other layers import the sim through
 * this module; the simulation never imports the renderer, the UI or the platform.
 */
export { createSim } from './createSim';
export { createRng } from './rng';
export type {
  Command,
  DefenderState,
  EnemyState,
  LevelDef,
  LoadoutEntry,
  OrbState,
  ProjectileState,
  Rng,
  Sim,
  SimEvent,
  SimState,
} from './types';
