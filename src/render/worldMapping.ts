import { rules } from '../data/rules';

/** World x of the centre of column `col` (spec 3.1, 9.1: column c spans x = c to c + 1). */
export function columnToWorldX(col: number): number {
  return (col + 0.5) * rules.grid.tileSize;
}

/** World x of a continuous sim x; one tile is one world unit by default (spec 9.1). */
export function simXToWorldX(x: number): number {
  return x * rules.grid.tileSize;
}

/** World z of lane `lane` (spec 9.1: lane l maps to world z = l + 0.5). */
export function laneToWorldZ(lane: number): number {
  return (lane + 0.5) * rules.grid.tileSize;
}
