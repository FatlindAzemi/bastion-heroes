import { defenderById, rules } from '../data';
import type { LevelDef } from '../data';
import { tileCenterX } from './grid';
import { isDefenderActive, ticksFromSeconds } from './placement';
import type { Command, OrbState, SimEvent, SimState } from './types';

type CollectOrbCommand = Extract<Command, { type: 'collectOrb' }>;

/** Ticks an orb falls from above before it lands (spec 3.3: 1.0 s). */
const SKY_DROP_FALL_TICKS = ticksFromSeconds(rules.essence.skyDropFallTimeS);

/** Ticks an orb stays on the ground before it is lost (spec 3.3: 8.0 s). */
const ORB_LIFETIME_TICKS = ticksFromSeconds(rules.essence.orbLifetimeS);

/** Ticks after landing at which auto-collect picks an orb up (spec 3.3: 1.0 s). */
const AUTO_COLLECT_DELAY_TICKS = ticksFromSeconds(rules.essence.autoCollectDelayS);

/** Ticks between two sky drops (spec 3.3: every 8.0 s). */
const SKY_DROP_INTERVAL_TICKS = ticksFromSeconds(rules.essence.skyDropIntervalS);

/** Tick of the first sky drop after level start (spec 3.3: 4.0 s). */
const FIRST_SKY_DROP_TICKS = ticksFromSeconds(rules.essence.firstSkyDropDelayS);

/**
 * Spawns one orb that falls for 1.0 s and expires 8.0 s after landing (spec 3.3).
 * Every orb id comes from the shared entity id counter (spec 11.3).
 */
function spawnOrb(
  state: SimState,
  events: SimEvent[],
  lane: number,
  x: number,
  value: number,
): void {
  const spawnTick = state.tick;
  const landTick = spawnTick + SKY_DROP_FALL_TICKS;
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

/** True on the ticks at which a sky drop spawns (spec 3.3: first at 4.0 s, then every 8.0 s). */
function isSkyDropTick(tick: number): boolean {
  return (
    tick >= FIRST_SKY_DROP_TICKS && (tick - FIRST_SKY_DROP_TICKS) % SKY_DROP_INTERVAL_TICKS === 0
  );
}

/**
 * Spawns the sky drop of this tick on a seeded random tile. The rng picks the
 * lane first and then the column, so the same seed gives the same sequence
 * (spec 3.3, 11.3); night levels (`skyDrops: false`) never drop.
 */
function spawnSkyDrop(state: SimState, level: LevelDef, events: SimEvent[]): void {
  if (!level.skyDrops || !isSkyDropTick(state.tick) || level.activeLanes.length === 0) {
    return;
  }
  const laneIndex = Math.floor(state.rng.next() * level.activeLanes.length);
  const lane = level.activeLanes[laneIndex];
  const col = Math.floor(state.rng.next() * rules.grid.columnCount);
  if (lane === undefined) {
    return;
  }
  spawnOrb(state, events, lane, tileCenterX(col), rules.essence.skyDropAmount);
}

/**
 * Spawns the producer orbs that are due this tick. Producers only start after
 * they became active, then drop every `attackIntervalS` (spec 3.4, 5.2).
 */
function spawnProducerOrbs(state: SimState, events: SimEvent[]): void {
  const producers = state.defenders
    .filter((defender) => defender.nextOrbTick !== null)
    .sort((first, second) => first.id - second.id);

  for (const defender of producers) {
    const firstOrbTick = defender.nextOrbTick;
    if (firstOrbTick === null || state.tick < firstOrbTick) {
      continue;
    }
    if (!isDefenderActive(defender, state.tick)) {
      continue;
    }
    const defenderDef = defenderById[defender.defenderId];
    if (defenderDef === undefined || defenderDef.orbEssence === undefined) {
      continue;
    }
    const intervalTicks =
      defenderDef.attackIntervalS === undefined
        ? null
        : ticksFromSeconds(defenderDef.attackIntervalS);
    if (intervalTicks === null) {
      continue;
    }
    let nextOrbTick = firstOrbTick;
    while (state.tick >= nextOrbTick) {
      spawnOrb(state, events, defender.lane, tileCenterX(defender.col), defenderDef.orbEssence);
      nextOrbTick += intervalTicks;
    }
    defender.nextOrbTick = nextOrbTick;
  }
}

/** Collects an orb: adds its value immediately, capped at the maximum, and removes it (spec 3.3). */
function collectOrbAt(state: SimState, orbIndex: number, events: SimEvent[]): void {
  const orb = state.orbs[orbIndex];
  if (orb === undefined) {
    return;
  }
  state.orbs.splice(orbIndex, 1);
  state.essence = Math.min(rules.essence.maxEssence, state.essence + orb.value);
  events.push({ type: 'orbCollected', id: orb.id });
}

/** Auto-collects landed orbs 1.0 s after they land, when the setting is on (spec 3.3). */
function autoCollectOrbs(state: SimState, events: SimEvent[]): void {
  if (!state.autoCollect) {
    return;
  }
  for (let index = state.orbs.length - 1; index >= 0; index -= 1) {
    const orb = state.orbs[index];
    if (orb !== undefined && state.tick >= orb.landTick + AUTO_COLLECT_DELAY_TICKS) {
      collectOrbAt(state, index, events);
    }
  }
}

/** Removes orbs whose 8.0 s lifetime after landing is over (spec 3.3). */
function expireOrbs(state: SimState, events: SimEvent[]): void {
  for (let index = state.orbs.length - 1; index >= 0; index -= 1) {
    const orb = state.orbs[index];
    if (orb !== undefined && state.tick >= orb.expiresAtTick) {
      state.orbs.splice(index, 1);
      events.push({ type: 'orbExpired', id: orb.id });
    }
  }
}

/** Applies a `collectOrb` command: the value is added when tapped, not on arrival (spec 3.3). */
export function collectOrb(state: SimState, command: CollectOrbCommand, events: SimEvent[]): void {
  const orbIndex = state.orbs.findIndex((orb) => orb.id === command.orbId);
  if (orbIndex === -1) {
    // Already collected or expired: a stale tap changes nothing (spec 11.3).
    return;
  }
  collectOrbAt(state, orbIndex, events);
}

/**
 * Phase 3 of every tick (spec 11.3): sky drops spawn, producers drop their orbs,
 * auto-collect picks landed orbs up and expired orbs disappear (spec 3.3).
 */
export function updateEssence(state: SimState, level: LevelDef, events: SimEvent[]): void {
  spawnSkyDrop(state, level, events);
  spawnProducerOrbs(state, events);
  autoCollectOrbs(state, events);
  expireOrbs(state, events);
}
