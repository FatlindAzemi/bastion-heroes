import { duelRules } from '../../data';
import { LANE_COUNT, type TerrainLayout } from '../grid';
import type { Side } from './types';

/** Both sides in the fixed order the sim uses everywhere: south first (spec 19.11). */
export const DUEL_SIDES: readonly Side[] = ['south', 'north'];

/** The Duel board (spec 18.1): all five lanes, no terrain, every tile is `normal`. */
export const DUEL_BOARD: TerrainLayout = {
  activeLanes: Array.from({ length: LANE_COUNT }, (_, lane) => lane),
  terrain: [],
};

/** The columns a side may place defenders in (spec 18.1: south 0-3, north 5-8). */
export function ownColumnsOf(side: Side): readonly number[] {
  return side === 'south' ? duelRules.board.southColumns : duelRules.board.northColumns;
}

/** True when the column is in the side's placement zone; the midline belongs to nobody (spec 18.1). */
export function ownsColumn(side: Side, col: number): boolean {
  return ownColumnsOf(side).includes(col);
}

/** World x at which a side's raiders appear (spec 18.1: south 0.4, north 8.6). */
export function raiderSpawnXOf(side: Side): number {
  return side === 'south' ? duelRules.board.southRaiderSpawnX : duelRules.board.northRaiderSpawnX;
}

/** Sort order of a side: south before north (spec 19.11 tick order step 1). */
export function sideOrder(side: Side): number {
  return DUEL_SIDES.indexOf(side);
}
