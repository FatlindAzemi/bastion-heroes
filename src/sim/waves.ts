import { enemyById, rules } from '../data';
import type { LevelDef } from '../data';
import { ENEMY_SPAWN_X } from './grid';
import { ticksFromSeconds } from './placement';
import type { PendingSpawn, Rng, SimEvent, SimState, WaveState } from './types';

type WaveDef = LevelDef['waves'][number];
type SpawnDef = WaveDef['spawns'][number];

/** Ticks a wave waits after its last enemy died before the next wave starts (spec 3.10: 3 s). */
const EARLY_CLEAR_DELAY_TICKS = ticksFromSeconds(rules.waves.earlyClearDelayS);

/** Ticks before a big wave spawns that its banner is shown (spec 3.10: 3 s). */
const BIG_WAVE_WARNING_TICKS = ticksFromSeconds(rules.waves.bigWaveWarningS);

/** Creates the wave runner state for a level (spec 3.10, 7.1). */
export function initialWaveState(level: LevelDef): WaveState {
  const firstWaveTick = ticksFromSeconds(level.firstWaveDelay);
  return {
    index: -1,
    nextWaveTick: firstWaveTick,
    pendingSpawns: [],
    nextSpawnTick: firstWaveTick,
    earlyClearTick: null,
    allWavesSpawned: false,
    bannerWaveIndex: null,
    bannerTick: null,
  };
}

/** Maps the level flag to the event kind of spec 11.3 (default flag "none" means normal). */
function waveKind(flag: WaveDef['flag']): 'normal' | 'big' | 'final' {
  return flag === 'none' ? 'normal' : flag;
}

/** Shuffles a list in place with the seeded rng (spec 7.1 rule 1: shuffle with the level seed). */
function shuffleInPlace<T>(items: T[], rng: Rng): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    const current = items[index];
    const swap = items[swapIndex];
    if (current !== undefined && swap !== undefined) {
      items[index] = swap;
      items[swapIndex] = current;
    }
  }
}

/**
 * Picks the lane for one spawn (spec 7.1 rule 3). A fixed lane list picks only
 * from that list; "random" picks an active lane but never the same lane three
 * times in a row (with a single active lane the repeat is unavoidable).
 */
function pickLane(
  state: SimState,
  lanes: SpawnDef['lanes'],
  activeLanes: readonly number[],
  chosenLanes: readonly number[],
): number | undefined {
  if (lanes === 'random') {
    if (activeLanes.length === 0) {
      return undefined;
    }
    const laneIndex = Math.floor(state.rng.next() * activeLanes.length);
    const lane = activeLanes[laneIndex];
    if (lane === undefined) {
      return undefined;
    }
    const previousLane = chosenLanes[chosenLanes.length - 1];
    const beforePreviousLane = chosenLanes[chosenLanes.length - 2];
    if (lane === previousLane && lane === beforePreviousLane && activeLanes.length > 1) {
      return activeLanes[(laneIndex + 1) % activeLanes.length];
    }
    return lane;
  }
  if (lanes.length === 0) {
    return undefined;
  }
  return lanes[Math.floor(state.rng.next() * lanes.length)];
}

/** Expands the wave spawns in order, shuffles them and chooses a lane for each (spec 7.1 rule 1). */
function buildSpawnPlan(state: SimState, waveDef: WaveDef, level: LevelDef): PendingSpawn[] {
  const expanded: { enemyId: string; lanes: SpawnDef['lanes'] }[] = [];
  for (const spawn of waveDef.spawns) {
    for (let count = 0; count < spawn.count; count += 1) {
      expanded.push({ enemyId: spawn.enemy, lanes: spawn.lanes });
    }
  }
  shuffleInPlace(expanded, state.rng);

  const chosenLanes: number[] = [];
  const plan: PendingSpawn[] = [];
  for (const spawn of expanded) {
    const lane = pickLane(state, spawn.lanes, level.activeLanes, chosenLanes);
    if (lane === undefined) {
      continue;
    }
    chosenLanes.push(lane);
    plan.push({ enemyId: spawn.enemyId, lane });
  }
  return plan;
}

/** Plans the big-wave banner for the wave after `currentIndex`, if that wave is big (spec 3.10). */
function scheduleNextWaveBanner(state: SimState, level: LevelDef, currentIndex: number): void {
  const nextWave = level.waves[currentIndex + 1];
  if (nextWave?.flag !== 'big' || state.wave.nextWaveTick === null) {
    state.wave.bannerWaveIndex = null;
    state.wave.bannerTick = null;
    return;
  }
  state.wave.bannerWaveIndex = currentIndex + 1;
  state.wave.bannerTick = Math.max(state.tick, state.wave.nextWaveTick - BIG_WAVE_WARNING_TICKS);
}

/** Starts wave `index`: plans its spawns, its timers and its events (spec 3.10, 7.1). */
function startWave(state: SimState, level: LevelDef, index: number, events: SimEvent[]): void {
  const waveDef = level.waves[index];
  if (waveDef === undefined) {
    return;
  }
  state.wave.index = index;
  state.wave.pendingSpawns = buildSpawnPlan(state, waveDef, level);
  state.wave.nextSpawnTick = state.tick;
  state.wave.nextWaveTick =
    waveDef.duration === 0 ? null : state.tick + ticksFromSeconds(waveDef.duration);
  state.wave.earlyClearTick = null;
  state.wave.allWavesSpawned = index === level.waves.length - 1;
  scheduleNextWaveBanner(state, level, index);

  events.push({ type: 'waveStarted', index, kind: waveKind(waveDef.flag) });
  if (waveDef.flag === 'final') {
    events.push({ type: 'waveBanner', index, kind: 'final' });
  }
}

/** Starts the first wave at firstWaveDelay and later waves at their duration end (spec 3.10). */
function advanceWaveIfReady(state: SimState, level: LevelDef, events: SimEvent[]): void {
  const wave = state.wave;
  if (wave.index === -1) {
    if (wave.nextWaveTick !== null && state.tick >= wave.nextWaveTick) {
      startWave(state, level, 0, events);
    }
    return;
  }
  if (wave.allWavesSpawned || wave.pendingSpawns.length > 0) {
    // A wave only advances once its spawn list is empty, so no spawn is ever dropped.
    return;
  }
  const durationDone = wave.nextWaveTick !== null && state.tick >= wave.nextWaveTick;
  const earlyClearDone = wave.earlyClearTick !== null && state.tick >= wave.earlyClearTick;
  if (durationDone || earlyClearDone) {
    startWave(state, level, wave.index + 1, events);
  }
}

/**
 * Schedules the early start of the next wave: 3 s after every enemy of the
 * current wave is dead, whichever comes first with the duration (spec 3.10).
 */
function updateEarlyClear(state: SimState): void {
  const wave = state.wave;
  if (
    wave.index === -1 ||
    wave.allWavesSpawned ||
    wave.earlyClearTick !== null ||
    wave.pendingSpawns.length > 0
  ) {
    return;
  }
  const hasLivingEnemy = state.enemies.some((enemy) => enemy.waveIndex === wave.index);
  if (hasLivingEnemy) {
    return;
  }
  wave.earlyClearTick = state.tick + EARLY_CLEAR_DELAY_TICKS;
  const earlierBannerTick = wave.earlyClearTick - BIG_WAVE_WARNING_TICKS;
  if (wave.bannerTick !== null && earlierBannerTick < wave.bannerTick) {
    wave.bannerTick = Math.max(state.tick, earlierBannerTick);
  }
}

/** Emits the big-wave banner when its 3 s warning tick is reached (spec 3.10). */
function emitBannerIfDue(state: SimState, level: LevelDef, events: SimEvent[]): void {
  const wave = state.wave;
  if (wave.bannerTick === null || wave.bannerWaveIndex === null || state.tick < wave.bannerTick) {
    return;
  }
  const announcedWave = level.waves[wave.bannerWaveIndex];
  if (announcedWave?.flag === 'big') {
    events.push({ type: 'waveBanner', index: wave.bannerWaveIndex, kind: 'big' });
  }
  wave.bannerTick = null;
  wave.bannerWaveIndex = null;
}

/** Spawns the next enemies of the current wave with the wave's spawnGap (spec 3.10, 7.1). */
function spawnDueEnemies(state: SimState, level: LevelDef, events: SimEvent[]): void {
  const wave = state.wave;
  const waveDef = wave.index === -1 ? undefined : level.waves[wave.index];
  if (waveDef === undefined) {
    return;
  }
  const spawnGapTicks = ticksFromSeconds(waveDef.spawnGap);
  while (wave.pendingSpawns.length > 0 && state.tick >= wave.nextSpawnTick) {
    const spawn = wave.pendingSpawns.shift();
    if (spawn === undefined) {
      return;
    }
    spawnEnemy(state, spawn, wave.index, events);
    wave.nextSpawnTick += spawnGapTicks;
  }
}

/** Spawns one enemy at the enemy spawn point with its data hp (spec 3.1, 6.1, 11.3). */
function spawnEnemy(
  state: SimState,
  spawn: PendingSpawn,
  waveIndex: number,
  events: SimEvent[],
): void {
  const enemyDef = enemyById[spawn.enemyId];
  if (enemyDef === undefined) {
    return;
  }
  const id = state.nextId;
  state.nextId += 1;
  state.enemies.push({
    id,
    enemyId: spawn.enemyId,
    lane: spawn.lane,
    x: ENEMY_SPAWN_X,
    hp: enemyDef.hp,
    maxHp: enemyDef.hp,
    waveIndex,
    blockedByDefenderId: null,
    nextBiteTick: null,
    statuses: [],
    comboCooldowns: { steam: 0, shatter: 0, toxic: 0, chain: 0 },
  });
  events.push({ type: 'enemySpawned', id, enemyId: spawn.enemyId, lane: spawn.lane });
}

/**
 * Phase 2 of every tick (spec 11.3): starts waves when due, spawns their enemies
 * one spawnGap apart, and emits the banner events of spec 3.10.
 */
export function updateWaves(state: SimState, level: LevelDef, events: SimEvent[]): void {
  advanceWaveIfReady(state, level, events);
  updateEarlyClear(state);
  emitBannerIfDue(state, level, events);
  spawnDueEnemies(state, level, events);
}
