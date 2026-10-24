import { rules } from '../data';
import { ticksFromSeconds } from './placement';
import type { OrbState, SimEvent, SimState } from './types';

/** Ticks an orb falls from above before it lands (spec 3.3: 1.0 s). */
const ORB_FALL_TICKS = ticksFromSeconds(rules.essence.skyDropFallTimeS);

/** Ticks an orb stays on the ground before it is lost (spec 3.3: 8.0 s). */
const ORB_LIFETIME_TICKS = ticksFromSeconds(rules.essence.orbLifetimeS);

/**
 * Spawns one orb (sky drop or producer orb) that falls for 1.0 s and expires
 * 8.0 s after landing (spec 3.3). Every orb id comes from the shared entity id
 * counter (spec 11.3).
 */
export function spawnOrb(
  state: SimState,
  events: SimEvent[],
  lane: number,
  x: number,
  value: number,
): void {
  const spawnTick = state.tick;
  const landTick = spawnTick + ORB_FALL_TICKS;
  const orb: OrbState = {
    id: state.nextId,
    lane,
    x,
    value,
    spawnTick,
    landTick,
    expiresAtTick: landTick + ORB_LIFETIME_TICKS,
  };
  state.nextId += 1;
  state.orbs.push(orb);
  events.push({ type: 'orbSpawned', id: orb.id, x, lane, value });
}
