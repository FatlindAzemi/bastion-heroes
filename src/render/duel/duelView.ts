/**
 * The mirrored Duel view (spec 18.1): every client draws its own side at the bottom
 * of the screen. The sim always uses absolute coordinates; for the north player the
 * renderer and the pointer mapping mirror them (x becomes 9 - x, lane becomes
 * 4 - lane), never the sim. This module is the only place that knows the mirror:
 * it turns the Duel state and events into the campaign-shaped "view" state and
 * events the existing unit, projectile and VFX layers already draw.
 */
import { duelRules, rules } from '../../data';
import type { DuelEvent, DuelState, Side } from '../../sim/duel';
import type { DefenderState, EnemyState, ProjectileState, SimEvent } from '../../sim/types';
import type { RenderSimState } from '../renderState';

/** The x the mirror reflects around: base lines 0 and 9 swap (spec 18.1). */
const MIRROR_X_SUM = duelRules.board.southBaseLineX + duelRules.board.northBaseLineX;
const LAST_LANE = rules.grid.laneCount - 1;
const LAST_COLUMN = rules.grid.columnCount - 1;

/** Sim x to view x for the player of `viewSide` (spec 18.1). */
export function viewX(x: number, viewSide: Side): number {
  return viewSide === 'north' ? MIRROR_X_SUM - x : x;
}

/** Sim lane to view lane; works on continuous lanes too (spec 18.1). */
export function viewLane(lane: number, viewSide: Side): number {
  return viewSide === 'north' ? LAST_LANE - lane : lane;
}

/** Sim column to view column (the mirror of a whole tile). */
export function viewColumn(col: number, viewSide: Side): number {
  return viewSide === 'north' ? LAST_COLUMN - col : col;
}

/**
 * Converts a ground point of the drawn board (world x, world z) back into sim
 * coordinates: x along the lanes and z = lane + 0.5 (spec 9.1). The mirror is its
 * own inverse, so the north player's taps land on the tile they see (spec 18.1).
 */
export function simPointOfView(
  worldX: number,
  worldZ: number,
  viewSide: Side,
): { readonly x: number; readonly z: number } {
  if (viewSide === 'south') {
    return { x: worldX, z: worldZ };
  }
  const tile = rules.grid.tileSize;
  return { x: MIRROR_X_SUM * tile - worldX, z: (LAST_LANE + 1) * tile - worldZ };
}

/** The view copy of one defender. */
function viewDefender(defender: DefenderState, viewSide: Side): DefenderState {
  return {
    ...defender,
    lane: viewLane(defender.lane, viewSide),
    col: viewColumn(defender.col, viewSide),
  };
}

/** The view copy of one raider. */
function viewRaider(raider: EnemyState, viewSide: Side): EnemyState {
  return { ...raider, lane: viewLane(raider.lane, viewSide), x: viewX(raider.x, viewSide) };
}

/** The view copy of one projectile; only the drawn coordinates change. */
function viewProjectile(projectile: ProjectileState, viewSide: Side): ProjectileState {
  return {
    ...projectile,
    lane: viewLane(projectile.lane, viewSide),
    x: viewX(projectile.x, viewSide),
    originX: viewX(projectile.originX, viewSide),
  };
}

/**
 * The raiders to draw: the active ones plus the summoned ones already standing at
 * their spawn point (spec 18.5). A summoning raider is not in `state.enemies`, but
 * the player must see it appear, so the view lists it too.
 */
export function visibleRaiders(state: Readonly<DuelState>): EnemyState[] {
  const raiders: EnemyState[] = [...state.enemies];
  for (const summon of state.summons) {
    if (summon.raider !== null) {
      raiders.push(summon.raider);
    }
  }
  return raiders;
}

/**
 * The campaign-shaped view state of a Duel for the player of `viewSide`: mirrored
 * units and projectiles. Traps and orbs are empty here; the Duel draws both sides'
 * traps itself and has no Essence orbs (spec 18.3, 18.7).
 */
export function duelViewState(state: Readonly<DuelState>, viewSide: Side): RenderSimState {
  return {
    tick: state.tick,
    defenders: state.defenders.map((defender) => viewDefender(defender, viewSide)),
    enemies: visibleRaiders(state).map((raider) => viewRaider(raider, viewSide)),
    projectiles: state.projectiles.map((projectile) => viewProjectile(projectile, viewSide)),
    orbs: [],
    traps: [],
  };
}

/** Mirrors the coordinates of one campaign-shaped unit event; other events pass through. */
function viewUnitEvent(event: SimEvent, viewSide: Side): SimEvent {
  switch (event.type) {
    case 'defenderPlaced':
      return {
        ...event,
        lane: viewLane(event.lane, viewSide),
        col: viewColumn(event.col, viewSide),
      };
    case 'enemySpawned':
      return { ...event, lane: viewLane(event.lane, viewSide) };
    case 'projectileSpawned':
    case 'combo':
      return { ...event, lane: viewLane(event.lane, viewSide), x: viewX(event.x, viewSide) };
    default:
      return event;
  }
}

/** The Duel-only event types that the campaign layers must never see. */
const DUEL_ONLY_EVENTS: ReadonlySet<DuelEvent['type']> = new Set<DuelEvent['type']>([
  'commandRejected',
  'essenceChanged',
  'essenceProduced',
  'gateDamaged',
  'trapFired',
  'raiderReachedBase',
  'phaseChanged',
  'duelEnded',
]);

/** True for the unit and combo events the campaign layers can draw (spec 19.11). */
function isCampaignShaped(event: DuelEvent): event is Extract<DuelEvent, SimEvent> {
  return !DUEL_ONLY_EVENTS.has(event.type);
}

/**
 * The unit, projectile and combo events of one tick in view coordinates. Duel-only
 * events (gates, traps, Essence, phases) are left out: the Duel scene handles them,
 * and a campaign `trapFired` would draw the trap of the wrong base.
 */
export function duelViewEvents(events: readonly DuelEvent[], viewSide: Side): SimEvent[] {
  const viewEvents: SimEvent[] = [];
  for (const event of events) {
    if (isCampaignShaped(event)) {
      viewEvents.push(viewUnitEvent(event, viewSide));
    }
  }
  return viewEvents;
}
