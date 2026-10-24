/**
 * The simulation layer (spec 11.1, 11.2). Other layers import the sim through
 * this module; the simulation never imports the renderer, the UI or the platform.
 */
export { createSim } from './createSim';
export { hashState } from './hash';
export {
  BASE_LINE_X,
  COLUMN_COUNT,
  ENEMY_SPAWN_X,
  isActiveLane,
  isInBounds,
  isPlaceableTerrain,
  isPlaceableTile,
  isValidColumn,
  isValidLane,
  LANE_COUNT,
  TILE_SIZE,
  terrainAt,
  tileCenter,
  tileCenterX,
  type TerrainType,
  type WorldPosition,
} from './grid';
export {
  ACTIVATION_DELAY_TICKS,
  isCardReady,
  isDefenderActive,
  ticksFromSeconds,
} from './placement';
export { createRng } from './rng';
export type {
  ComboCooldownState,
  ComboId,
  Command,
  DefenderState,
  ElementKind,
  EnemyState,
  EnemyStatusState,
  LevelDef,
  LevelStatus,
  LoadoutEntry,
  OrbState,
  PendingSpawn,
  ProjectileState,
  Replay,
  ReplayCommand,
  Rng,
  Sim,
  SimEvent,
  SimState,
  StatusKind,
  TrapState,
  WaveState,
} from './types';
