import type { SimEvent } from '../types';
import type { DuelEvent, DuelState, DuelUnitEvent, Side } from './types';

/**
 * Collects the events of one tick. The shared combat code of `src/sim/combat/`
 * emits campaign events without a side; `emitShared` adds the side of the unit
 * each event names (spec 19.11: "every unit event also carries `side`").
 */
export interface DuelEventLog {
  /** The events of this tick so far, in emission order. */
  readonly events: DuelEvent[];
  /** Runs shared code that emits campaign events and appends them with their side. */
  emitShared(run: (sharedEvents: SimEvent[]) => void): void;
}

/** Remembers the side of every unit and projectile that is in the state right now. */
function recordSides(state: Readonly<DuelState>, sideById: Map<number, Side>): void {
  for (const defender of state.defenders) {
    sideById.set(defender.id, defender.side);
  }
  for (const raider of state.enemies) {
    sideById.set(raider.id, raider.side);
  }
  for (const projectile of state.projectiles) {
    if (projectile.side !== undefined) {
      sideById.set(projectile.id, projectile.side);
    }
  }
}

/** Id of the unit a shared event is about, or null for an event without a unit (combo). */
function unitIdOf(event: SimEvent): number | null {
  switch (event.type) {
    case 'defenderPlaced':
    case 'defenderMerged':
    case 'defenderRemoved':
    case 'enemySpawned':
    case 'enemyDied':
    case 'projectileSpawned':
    case 'projectileEnded':
      return event.id;
    case 'attack':
      return event.sourceId;
    case 'hit':
    case 'statusApplied':
      return event.targetId;
    case 'combo':
      return null;
    default:
      throw new Error(`The Duel does not use the campaign event "${event.type}".`);
  }
}

/** Adds the unit's side to one shared event (spec 19.11). */
function withSide(event: SimEvent, sideById: ReadonlyMap<number, Side>): DuelEvent {
  const unitId = unitIdOf(event);
  if (unitId === null) {
    return event as Extract<SimEvent, { type: 'combo' }>;
  }
  const side = sideById.get(unitId);
  if (side === undefined) {
    throw new Error(`Event "${event.type}" names unit ${unitId}, which has no side.`);
  }
  return { ...event, side } as DuelUnitEvent;
}

/**
 * Creates the event log of one tick. Sides are looked up by unit id; the lookup
 * is refreshed after every shared phase and dead units stay in it until the tick
 * ends, so death and projectile-end events still find their side.
 */
export function createEventLog(state: Readonly<DuelState>): DuelEventLog {
  const events: DuelEvent[] = [];
  const sideById = new Map<number, Side>();
  recordSides(state, sideById);
  return {
    events,
    emitShared(run: (sharedEvents: SimEvent[]) => void): void {
      const sharedEvents: SimEvent[] = [];
      run(sharedEvents);
      recordSides(state, sideById);
      for (const event of sharedEvents) {
        events.push(withSide(event, sideById));
      }
    },
  };
}
