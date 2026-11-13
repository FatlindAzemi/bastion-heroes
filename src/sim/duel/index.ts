/**
 * The Duel simulation (spec 18, 19.11). Other layers and the match server import
 * the Duel sim through this module.
 */
export { createDuelSim } from './createDuelSim';
export {
  DUEL_CARD_LEVEL,
  duelDefenderCard,
  duelDefenderMaxHp,
  findDuelDefenderAt,
  isAtCardLimit,
  type DuelDefenderCard,
} from './cards';
export { duelProducerIntervalTicks, incomeIntervalTicksOf } from './essence';
export { acceptsCommands, phaseLengthTicks } from './phases';
export { DUEL_BOARD, DUEL_SIDES, ownColumnsOf, ownsColumn, raiderSpawnXOf } from './sides';
export type {
  DuelCommand,
  DuelDefenderState,
  DuelEvent,
  DuelPhase,
  DuelRaiderState,
  DuelRejectReason,
  DuelResult,
  DuelSideState,
  DuelSim,
  DuelState,
  DuelUnitEvent,
  Side,
} from './types';
