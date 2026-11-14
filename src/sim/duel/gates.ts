import { duelRules, rules } from '../../data';
import { advanceX, baseLineXOf, forwardOf, isAheadOf, opposingSide } from '../combat/side';
import { LANE_COUNT } from '../grid';
import type { TrapState } from '../types';
import { duelRaiderCard } from './raiderCards';
import { DUEL_SIDES } from './sides';
import type { DuelEvent, DuelRaiderState, DuelState, Side } from './types';

/** Tiles a rolling trap moves per tick (spec 18.7: 8 tiles per second). */
const TRAP_SPEED_TILES_PER_TICK = duelRules.gate.trapSpeedTilesPerS / rules.tick.tickRate;

/**
 * Rounding tolerance of the base-line check, in tiles. Not a game number: 9 - x and
 * x round differently, so without it a raider that walks exactly onto a base line
 * arrives one tick later on one side than its mirror image on the other (spec 18.1).
 */
const BASE_LINE_TOLERANCE_TILES = 1e-9;

/** One unused Last Stand Trap per lane for one player (spec 18.7). */
export function initialDuelTraps(): TrapState[] {
  return Array.from({ length: LANE_COUNT }, () => ({ used: false, rollerX: null }));
}

/** True when the raider stands on or past the base line of the bastion it attacks (spec 18.1, 18.7). */
function hasReachedEnemyBaseLine(raider: DuelRaiderState): boolean {
  const forward = forwardOf(raider.side);
  const enemyBaseLineX = baseLineXOf(opposingSide(raider.side));
  return !isAheadOf(
    enemyBaseLineX,
    advanceX(raider.x, BASE_LINE_TOLERANCE_TILES, forward),
    forward,
  );
}

/**
 * The raiders of both sides that reached the enemy base line (spec 18.7), sorted
 * by id: south raiders at x >= 9.0, north raiders at x <= 0.0. Flying raiders count too.
 */
export function raidersReachingBaseLine(state: Readonly<DuelState>): DuelRaiderState[] {
  return state.enemies
    .filter((raider) => hasReachedEnemyBaseLine(raider))
    .sort((first, second) => first.id - second.id);
}

/** Gate damage of one raider: the `gateDamage` of its card (spec 18.7, 18.8). */
function gateDamageOf(raider: DuelRaiderState): number {
  const gateDamage = duelRaiderCard(raider.enemyId)?.duel.gateDamage;
  if (gateDamage === undefined) {
    throw new Error(`Raider "${raider.enemyId}" has no gateDamage in its duel block.`);
  }
  return gateDamage;
}

/** Takes a raider off the board. */
function removeRaider(state: DuelState, raider: DuelRaiderState): void {
  state.enemies.splice(state.enemies.indexOf(raider), 1);
}

/** A trap kills a raider at once, whatever its health, armor or shield is (spec 18.7). */
function killRaiderByTrap(state: DuelState, raider: DuelRaiderState, events: DuelEvent[]): void {
  removeRaider(state, raider);
  events.push({ type: 'enemyDied', id: raider.id, side: raider.side });
}

/** The raider is removed and the gate it reached loses the raider's `gateDamage` (spec 18.7). */
function damageGate(state: DuelState, raider: DuelRaiderState, events: DuelEvent[]): void {
  const { side, id, enemyId, lane } = raider;
  removeRaider(state, raider);
  events.push({ type: 'raiderReachedBase', side, id, enemyId, lane });
  const gateSide = opposingSide(side);
  const gate = state.sides[gateSide];
  const amount = gateDamageOf(raider);
  gate.gateHealth = Math.max(0, gate.gateHealth - amount);
  events.push({ type: 'gateDamaged', side: gateSide, amount, health: gate.gateHealth });
}

/** True on the tick a trap fired: its roller still stands on the own base line. */
function firedThisTick(trap: TrapState, owner: Side): boolean {
  return trap.rollerX === baseLineXOf(owner);
}

/**
 * Handles one raider at the enemy base line (spec 18.7). An unused trap in its
 * lane fires and kills it, together with every other raider that reached the line
 * in that lane on this tick. In a lane whose trap is used the gate takes damage.
 */
function resolveRaiderAtBaseLine(
  state: DuelState,
  raider: DuelRaiderState,
  events: DuelEvent[],
): void {
  const owner = opposingSide(raider.side);
  const trap = state.sides[owner].traps[raider.lane];
  if (trap === undefined) {
    throw new Error(`Lane ${raider.lane} has no Last Stand Trap.`);
  }
  if (!trap.used) {
    trap.used = true;
    trap.rollerX = baseLineXOf(owner);
    events.push({ type: 'trapFired', side: owner, lane: raider.lane });
  }
  if (firedThisTick(trap, owner)) {
    killRaiderByTrap(state, raider, events);
  } else {
    damageGate(state, raider, events);
  }
}

/** The enemy raiders a roller touched while it moved from `fromX` to `toX`, sorted by id. */
function raidersTouchedByRoller(
  state: Readonly<DuelState>,
  owner: Side,
  lane: number,
  fromX: number,
  toX: number,
): DuelRaiderState[] {
  const forward = forwardOf(owner);
  return state.enemies
    .filter((raider) => raider.side !== owner && raider.lane === lane)
    .filter((raider) => isAheadOf(raider.x, fromX, forward) && !isAheadOf(raider.x, toX, forward))
    .sort((first, second) => first.id - second.id);
}

/**
 * Rolls one trap forward by one tick (spec 18.7). It kills every enemy raider it
 * touches, leaves own units and defenders alone and stops at the enemy base line,
 * the end of the lane.
 */
function rollTrap(state: DuelState, owner: Side, lane: number, events: DuelEvent[]): void {
  const trap = state.sides[owner].traps[lane];
  if (trap === undefined || trap.rollerX === null) {
    return;
  }
  const forward = forwardOf(owner);
  const fromX = trap.rollerX;
  const toX = advanceX(fromX, TRAP_SPEED_TILES_PER_TICK, forward);
  for (const raider of raidersTouchedByRoller(state, owner, lane, fromX, toX)) {
    killRaiderByTrap(state, raider, events);
  }
  const endX = baseLineXOf(opposingSide(owner));
  trap.rollerX = isAheadOf(endX, toX, forward) ? toX : null;
}

/**
 * Tick step 8 (spec 19.11): Last Stand Traps and gate damage (spec 18.7). Raiders
 * at a base line fire the lane's trap or damage the gate, then every rolling trap
 * moves. A gate that reaches 0 health ends the match in step 9 (`updateMatchEnd`).
 */
export function updateTrapsAndGates(state: DuelState, events: DuelEvent[]): void {
  for (const raider of raidersReachingBaseLine(state)) {
    resolveRaiderAtBaseLine(state, raider, events);
  }
  for (const owner of DUEL_SIDES) {
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      rollTrap(state, owner, lane, events);
    }
  }
}
