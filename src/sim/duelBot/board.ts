import { duelRules } from '../../data';
import { LANE_COUNT, tileCenterX } from '../grid';
import type { DuelRaiderState, Side } from '../duel';
import type { DuelBotView } from './types';

/** World x of each side's base line (spec 18.1: south 0.0, north 9.0). */
const BASE_LINE_X: Readonly<Record<Side, number>> = {
  south: duelRules.board.southBaseLineX,
  north: duelRules.board.northBaseLineX,
};

/** The other side. */
export function opponentOf(side: Side): Side {
  return side === 'south' ? 'north' : 'south';
}

/** Enemy raiders the bot can see: the active ones and the ones standing at the spawn point (spec 18.5). */
export function visibleEnemyRaiders(view: DuelBotView): DuelRaiderState[] {
  const enemy = opponentOf(view.side);
  const active = view.state.enemies.filter((raider) => raider.side === enemy && raider.hp > 0);
  const summoned = view.state.summons.flatMap((summon) =>
    summon.side === enemy && summon.raider !== null ? [summon.raider] : [],
  );
  return [...active, ...summoned];
}

/** Distance of a world x from the bot's own base line; smaller is closer to the own gate (spec 18.1). */
export function distanceFromOwnBase(side: Side, x: number): number {
  return Math.abs(x - BASE_LINE_X[side]);
}

/** Summed health of units. */
function sumHealth(units: readonly { hp: number }[]): number {
  return units.reduce((sum, unit) => sum + unit.hp, 0);
}

/** What the bot reads from one lane (spec 18.10). */
export interface LaneReading {
  readonly lane: number;
  /** Summed health of the enemy raiders in the lane. */
  readonly enemyRaiderHealth: number;
  /** Number of enemy raiders in the lane. */
  readonly enemyRaiderCount: number;
  /** Distance of the closest enemy raider from the own base line; Infinity without raiders. */
  readonly closestRaiderDistance: number;
  /** Summed health of the own units in the raiders' way: defenders between the gate and the closest raider, and own raiders. */
  readonly ownBlockerHealth: number;
  /** Summed health of the opponent's defenders in the lane. */
  readonly enemyDefenderHealth: number;
  /** True when the opponent's Last Stand Trap of the lane is used (spec 18.7). */
  readonly isEnemyTrapUsed: boolean;
}

/** Reads one lane of the public board from the bot's side. */
function readLane(view: DuelBotView, lane: number, raiders: readonly DuelRaiderState[]): LaneReading {
  const enemy = opponentOf(view.side);
  const inLane = raiders.filter((raider) => raider.lane === lane);
  const distances = inLane.map((raider) => distanceFromOwnBase(view.side, raider.x));
  const closestRaiderDistance = Math.min(Infinity, ...distances);
  const defenders = view.state.defenders.filter((defender) => defender.lane === lane);
  const ownAhead = defenders.filter(
    (defender) =>
      defender.side === view.side &&
      distanceFromOwnBase(view.side, tileCenterX(defender.col)) < closestRaiderDistance,
  );
  const enemyDefenders = defenders.filter((defender) => defender.side === enemy);
  const ownRaiders = view.state.enemies.filter(
    (raider) => raider.side === view.side && raider.lane === lane && raider.hp > 0,
  );
  return {
    lane,
    enemyRaiderHealth: sumHealth(inLane),
    enemyRaiderCount: inLane.length,
    closestRaiderDistance,
    ownBlockerHealth: sumHealth(ownAhead) + sumHealth(ownRaiders),
    enemyDefenderHealth: sumHealth(enemyDefenders),
    isEnemyTrapUsed: view.state.sides[enemy].traps[lane]?.used === true,
  };
}

/** Reads all five lanes, lane 0 first. */
export function readLanes(view: DuelBotView): LaneReading[] {
  const raiders = visibleEnemyRaiders(view);
  return Array.from({ length: LANE_COUNT }, (_, lane) => readLane(view, lane, raiders));
}
