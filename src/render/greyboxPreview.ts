import { defenderById, enemyById } from '../data';
import { rules } from '../data/rules';
import type { Command, LoadoutEntry, SimEvent, SimState } from '../sim/types';
import type { LevelViewOptions } from './grid';
import type { GameRenderer } from './renderer';

/** Fixed tick of the screenshot (spec 13.7 uses tick 900 in its debug URL example). */
const PREVIEW_TICK = 900;

/** Ticks per second, from the data rules (spec 3.2). */
const TICK_RATE = rules.tick.tickRate;

/**
 * Illustrative greybox layout for the screenshot: a full 5 x 9 lawn and a few rock terrain
 * tiles, so the whole renderer of issue #24 is visible. The real level route (`?level=`)
 * with the exact W1-L01 layout arrives with issue #27.
 */
const PREVIEW_LEVEL: LevelViewOptions = {
  activeLanes: [0, 1, 2, 3, 4],
  terrain: [
    { lane: 1, col: 4, type: 'rock' },
    { lane: 3, col: 2, type: 'rock' },
  ],
};

/** Loadout of the preview level: the three M1 defenders (spec 5.1, 3.12). */
const PREVIEW_LOADOUT: readonly LoadoutEntry[] = [
  { defenderId: 'sparkbolt_gremlin', level: 1 },
  { defenderId: 'glowshroom_monk', level: 1 },
  { defenderId: 'iron_granny', level: 1 },
];

interface PreviewDefenderSeed {
  readonly id: number;
  readonly defenderId: string;
  readonly lane: number;
  readonly col: number;
}

const PREVIEW_DEFENDER_SEEDS: readonly PreviewDefenderSeed[] = [
  { id: 1, defenderId: 'sparkbolt_gremlin', lane: 2, col: 0 },
  { id: 2, defenderId: 'glowshroom_monk', lane: 2, col: 1 },
  { id: 3, defenderId: 'iron_granny', lane: 3, col: 4 },
  { id: 4, defenderId: 'sparkbolt_gremlin', lane: 1, col: 5 },
  { id: 5, defenderId: 'glowshroom_monk', lane: 4, col: 3 },
];

interface PreviewDefenderState {
  id: number;
  defenderId: string;
  lane: number;
  col: number;
  stars: 1;
  hp: number;
  maxHp: number;
  cardLevel: number;
  activeAtTick: number;
  nextOrbTick: number | null;
}

/** Builds a preview defender from its data definition (spec 5.1, 5.2). */
function createPreviewDefender(seed: PreviewDefenderSeed): PreviewDefenderState {
  const definition = defenderById[seed.defenderId];
  const maxHp = definition?.hp ?? 0;
  const activationDelayTicks = Math.round(rules.placement.defenderActivationDelayS * TICK_RATE);
  return {
    id: seed.id,
    defenderId: seed.defenderId,
    lane: seed.lane,
    col: seed.col,
    stars: 1,
    hp: maxHp,
    maxHp,
    cardLevel: 1,
    activeAtTick: PREVIEW_TICK - activationDelayTicks,
    nextOrbTick:
      definition?.pattern === 'producer'
        ? PREVIEW_TICK + Math.round((definition.firstOrbDelayS ?? 0) * TICK_RATE)
        : null,
  };
}

interface PreviewEnemySeed {
  readonly id: number;
  readonly lane: number;
  readonly x: number;
}

const PREVIEW_ENEMY_SEEDS: readonly PreviewEnemySeed[] = [
  { id: 10, lane: 0, x: 6.2 },
  { id: 11, lane: 1, x: 3.8 },
  { id: 12, lane: 1, x: 7.6 },
  { id: 13, lane: 2, x: 3.2 },
  { id: 14, lane: 2, x: 5.5 },
  { id: 15, lane: 3, x: 8.2 },
  { id: 16, lane: 4, x: 4.6 },
  { id: 17, lane: 4, x: 7.2 },
];

/** Full health of a preview enemy from the data, so the preview frame stays representative (6.1). */
const ENEMY_MAX_HP = enemyById.gloomling?.hp ?? 0;

/** One tick of gloomling movement: its data speed divided by the tick rate (spec 3.2, 6.1). */
const ENEMY_TICK_STEP = (enemyById.gloomling?.speed ?? 0) / TICK_RATE;

interface PreviewOrbState {
  id: number;
  lane: number;
  x: number;
  value: number;
}

/** Sky-drop orbs already on the field at the preview tick (spec 3.3). */
const PREVIEW_ORBS: readonly PreviewOrbState[] = [
  { id: 25, lane: 0, x: 2.6, value: rules.essence.skyDropAmount },
  { id: 26, lane: 2, x: 4.9, value: rules.essence.skyDropAmount },
  { id: 27, lane: 4, x: 8.4, value: rules.essence.skyDropAmount },
];

/**
 * Minimal wave-runner state for context only; the greybox renderer never reads it (spec 3.10).
 * Deliberately a plain object, because this fixture is decoupled from the sim state types.
 */
const PREVIEW_WAVE = {
  index: 0,
  nextWaveTick: null,
  pendingSpawns: [],
  nextSpawnTick: 0,
  earlyClearTick: null,
  allWavesSpawned: false,
  bannerWaveIndex: null,
  bannerTick: null,
};

/** Blocked tiles of the preview level (spec 7.1); the inactive lanes are active here. */
const ROCK_TILES: ReadonlySet<string> = new Set(
  PREVIEW_LEVEL.terrain
    ?.filter((tile) => tile.type === 'rock')
    .map((tile) => `${tile.lane}:${tile.col}`) ?? [],
);

/** Whether a tile is outside the grid or blocked by rock (spec 3.1, 7.1). */
function isPlacementBlocked(lane: number, col: number): boolean {
  const inGrid =
    lane >= 0 && lane < rules.grid.laneCount && col >= 0 && col < rules.grid.columnCount;
  return !inGrid || ROCK_TILES.has(`${lane}:${col}`);
}

/** Mutable state of the dev-only preview sim; the frame is rebuilt from it on demand. */
interface PreviewRuntime {
  tick: number;
  essence: number;
  autoCollect: boolean;
  nextId: number;
  cardCooldownEndTicks: number[];
  defenders: PreviewDefenderState[];
  orbs: PreviewOrbState[];
  commands: Command[];
}

/** Creates the initial preview runtime: initial cooldowns from the data (spec 3.5, 5.1). */
function createPreviewRuntime(): PreviewRuntime {
  return {
    tick: PREVIEW_TICK,
    essence: rules.essence.startingEssence,
    autoCollect: false,
    nextId: 30,
    cardCooldownEndTicks: PREVIEW_LOADOUT.map((entry) => {
      const definition = defenderById[entry.defenderId];
      return definition !== undefined && !definition.startsReady
        ? Math.round(definition.cooldownS * TICK_RATE)
        : 0;
    }),
    defenders: PREVIEW_DEFENDER_SEEDS.map(createPreviewDefender),
    orbs: PREVIEW_ORBS.map((orb) => ({ ...orb })),
    commands: [],
  };
}

/**
 * Builds the preview frame at the runtime tick. Enemies keep walking left at their data
 * speed, so the loop's ticks and the interpolation between them are visible (spec 3.2, 6.1).
 */
function createPreviewFrame(runtime: PreviewRuntime): Readonly<SimState> {
  const enemyStep = (PREVIEW_TICK - runtime.tick) * ENEMY_TICK_STEP;
  const previewFrame = {
    levelId: 'w1_l01',
    seed: 10001,
    loadout: PREVIEW_LOADOUT,
    cardCooldownEndTicks: runtime.cardCooldownEndTicks,
    tick: runtime.tick,
    rng: { state: 0, next: () => 0 },
    nextId: runtime.nextId,
    essence: runtime.essence,
    autoCollect: runtime.autoCollect,
    wave: PREVIEW_WAVE,
    defenders: runtime.defenders,
    enemies: PREVIEW_ENEMY_SEEDS.map((enemy) => ({
      id: enemy.id,
      enemyId: 'gloomling',
      lane: enemy.lane,
      x: enemy.x + enemyStep,
      hp: ENEMY_MAX_HP,
      maxHp: ENEMY_MAX_HP,
      waveIndex: 0,
    })),
    projectiles: [
      { id: 20, kind: 'bolt', lane: 1, x: 5.9 },
      { id: 21, kind: 'bolt', lane: 2, x: 4.6 },
      { id: 22, kind: 'bolt', lane: 3, x: 5.1 },
    ],
    orbs: runtime.orbs,
  };
  // Dev-only preview frame for the greybox HUD; deleted in #27 together with this route.
  // Intentionally not an exhaustive SimState: it has the fields the renderer and HUD read.
  // The cast keeps this temporary fixture out of the sim type-extension loop.
  return previewFrame as unknown as Readonly<SimState>;
}

/** Applies a placed defender command and returns its event (spec 3.4, 11.3). */
function placePreviewDefender(runtime: PreviewRuntime, command: Command): SimEvent | null {
  if (command.type !== 'place') {
    return null;
  }
  const definition = defenderById[command.defenderId];
  const cardIndex = PREVIEW_LOADOUT.findIndex((entry) => entry.defenderId === command.defenderId);
  if (definition === undefined || cardIndex < 0) {
    return { type: 'commandRejected', reason: 'invalidTile' };
  }
  if ((runtime.cardCooldownEndTicks[cardIndex] ?? 0) > runtime.tick) {
    return { type: 'commandRejected', reason: 'onCooldown' };
  }
  if (runtime.essence < definition.cost) {
    return { type: 'commandRejected', reason: 'notEnoughEssence' };
  }
  if (isPlacementBlocked(command.lane, command.col)) {
    return { type: 'commandRejected', reason: 'invalidTile' };
  }
  if (runtime.defenders.some((d) => d.lane === command.lane && d.col === command.col)) {
    return { type: 'commandRejected', reason: 'tileOccupied' };
  }
  runtime.essence -= definition.cost;
  runtime.cardCooldownEndTicks[cardIndex] =
    runtime.tick + Math.round(definition.cooldownS * TICK_RATE);
  const activationDelayTicks = Math.round(rules.placement.defenderActivationDelayS * TICK_RATE);
  const defender: PreviewDefenderState = {
    id: runtime.nextId,
    defenderId: command.defenderId,
    lane: command.lane,
    col: command.col,
    stars: 1,
    hp: definition.hp,
    maxHp: definition.hp,
    cardLevel: 1,
    activeAtTick: runtime.tick + activationDelayTicks,
    nextOrbTick:
      definition.pattern === 'producer'
        ? runtime.tick + Math.round((definition.firstOrbDelayS ?? 0) * TICK_RATE)
        : null,
  };
  runtime.nextId += 1;
  runtime.defenders.push(defender);
  return {
    type: 'defenderPlaced',
    id: defender.id,
    defenderId: defender.defenderId,
    lane: defender.lane,
    col: defender.col,
    stars: 1,
  };
}

/** Applies one queued preview command and returns the event the HUD should see (spec 11.3). */
function applyPreviewCommand(runtime: PreviewRuntime, command: Command): SimEvent | null {
  switch (command.type) {
    case 'setAutoCollect':
      runtime.autoCollect = command.on;
      return null;
    case 'collectOrb': {
      const index = runtime.orbs.findIndex((orb) => orb.id === command.orbId);
      const orb = runtime.orbs[index];
      if (orb === undefined) {
        return { type: 'commandRejected', reason: 'invalidTile' };
      }
      runtime.orbs.splice(index, 1);
      runtime.essence = Math.min(runtime.essence + orb.value, rules.essence.maxEssence);
      return { type: 'orbCollected', id: command.orbId };
    }
    case 'shovel': {
      const index = runtime.defenders.findIndex(
        (defender) => defender.lane === command.lane && defender.col === command.col,
      );
      const defender = runtime.defenders[index];
      if (defender === undefined) {
        return { type: 'commandRejected', reason: 'invalidTile' };
      }
      runtime.defenders.splice(index, 1);
      return { type: 'defenderRemoved', id: defender.id, reason: 'shovel' };
    }
    case 'place':
      return placePreviewDefender(runtime, command);
  }
}

/** Minimal sim shape the fixed-tick loop and the HUD drive; the real `createSim` arrives with #27. */
export interface GreyboxPreviewSim {
  readonly state: Readonly<SimState>;
  /** Advances the preview by one tick and returns its events (spec 11.3 shape). */
  step(): SimEvent[];
  /** Queues a HUD command, applied at the next step (spec 11.3 shape). */
  enqueue(command: Command): void;
}

/**
 * Creates the dev-only preview sim. It mirrors the sim contract (tick, commands, events)
 * with just enough behaviour for the HUD to be testable in the browser; it is a fixture,
 * not a second simulation, and it is deleted together with this route in #27.
 */
export function createGreyboxPreviewSim(): GreyboxPreviewSim {
  const runtime = createPreviewRuntime();
  let cachedFrame: Readonly<SimState> | null = null;
  return {
    get state(): Readonly<SimState> {
      cachedFrame ??= createPreviewFrame(runtime);
      return cachedFrame;
    },
    step: (): SimEvent[] => {
      runtime.tick += 1;
      const events: SimEvent[] = [];
      for (const command of runtime.commands) {
        const event = applyPreviewCommand(runtime, command);
        if (event !== null) {
          events.push(event);
        }
      }
      runtime.commands.length = 0;
      cachedFrame = null;
      return events;
    },
    enqueue: (command): void => {
      runtime.commands.push(command);
    },
  };
}

/** Spawn events of the preview entities, so the screenshot exercises the event path (spec 11.3). */
function createPreviewEvents(): SimEvent[] {
  const defenderEvents = PREVIEW_DEFENDER_SEEDS.map((defender): SimEvent => ({
    type: 'defenderPlaced',
    id: defender.id,
    defenderId: defender.defenderId,
    lane: defender.lane,
    col: defender.col,
    stars: 1,
  }));
  const enemyEvents = PREVIEW_ENEMY_SEEDS.map((enemy): SimEvent => ({
    type: 'enemySpawned',
    id: enemy.id,
    enemyId: 'gloomling',
    lane: enemy.lane,
  }));
  const orbEvents = PREVIEW_ORBS.map((orb): SimEvent => ({
    type: 'orbSpawned',
    id: orb.id,
    x: orb.x,
    lane: orb.lane,
    value: orb.value,
  }));
  return [
    ...defenderEvents,
    ...enemyEvents,
    { type: 'projectileSpawned', id: 20, kind: 'bolt', x: 5.9, lane: 1 },
    { type: 'projectileSpawned', id: 21, kind: 'bolt', x: 4.6, lane: 2 },
    { type: 'projectileSpawned', id: 22, kind: 'bolt', x: 5.1, lane: 3 },
    ...orbEvents,
  ];
}

/**
 * Shows the dev-only greybox preview on the renderer and returns the preview sim for the
 * fixed-tick game loop and the HUD. The route exists only in dev builds and exercises the
 * real loop and HUD paths without inventing game numbers.
 * TODO(#27): remove the greybox preview route when the debug URL lands.
 */
export function showGreyboxPreview(renderer: GameRenderer): GreyboxPreviewSim {
  renderer.showLevel(PREVIEW_LEVEL);
  renderer.handleEvents(createPreviewEvents());
  return createGreyboxPreviewSim();
}
