import { enemyById } from '../data';
import { rules } from '../data/rules';
import type { SimEvent, SimState } from '../sim/types';
import type { LevelViewOptions } from './grid';
import type { GameRenderer } from './renderer';

/** Fixed tick of the screenshot (spec 13.7 uses tick 900 in its debug URL example). */
const PREVIEW_TICK = 900;

/** Interpolation alpha of the screenshot: exactly halfway between two ticks (spec 11.4). */
const PREVIEW_ALPHA = 0.5;

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

interface PreviewDefender {
  readonly id: number;
  readonly defenderId: string;
  readonly lane: number;
  readonly col: number;
}

const PREVIEW_DEFENDERS: readonly PreviewDefender[] = [
  { id: 1, defenderId: 'sparkbolt_gremlin', lane: 2, col: 0 },
  { id: 2, defenderId: 'glowshroom_monk', lane: 2, col: 1 },
  { id: 3, defenderId: 'iron_granny', lane: 3, col: 4 },
  { id: 4, defenderId: 'sparkbolt_gremlin', lane: 1, col: 5 },
  { id: 5, defenderId: 'glowshroom_monk', lane: 4, col: 3 },
];

/** Builds the defender fields the greybox renderer reads (deleted with this route in #27). */
function createPreviewDefender(defender: PreviewDefender): {
  id: number;
  defenderId: string;
  lane: number;
  col: number;
  stars: 1;
} {
  return {
    id: defender.id,
    defenderId: defender.defenderId,
    lane: defender.lane,
    col: defender.col,
    stars: 1,
  };
}

interface PreviewEnemy {
  readonly id: number;
  readonly lane: number;
  readonly x: number;
}

const PREVIEW_ENEMIES: readonly PreviewEnemy[] = [
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
const ENEMY_TICK_STEP = (enemyById.gloomling?.speed ?? 0) / rules.tick.tickRate;

interface PreviewOrb {
  readonly id: number;
  readonly lane: number;
  readonly x: number;
  readonly value: number;
}

const PREVIEW_ORBS: readonly PreviewOrb[] = [
  { id: 25, lane: 0, x: 2.6, value: 25 },
  { id: 26, lane: 2, x: 4.9, value: 25 },
  { id: 27, lane: 4, x: 8.4, value: 25 },
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

/**
 * Creates the fixed preview frame of one tick; `enemyStep` shifts the enemies back so the
 * interpolation frame lies exactly between two ticks (spec 11.4).
 */
function createPreviewState(tick: number, enemyStep: number): Readonly<SimState> {
  const previewFrame = {
    levelId: 'w1_l01',
    seed: 10001,
    tick,
    wave: PREVIEW_WAVE,
    defenders: PREVIEW_DEFENDERS.map(createPreviewDefender),
    enemies: PREVIEW_ENEMIES.map((enemy) => ({
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
    orbs: PREVIEW_ORBS,
  };
  // Dev-only preview frame for the fixed-tick screenshot; deleted in #27 together with this route.
  // Intentionally not an exhaustive SimState: the greybox renderer only reads defenders/enemies/
  // projectiles/orbs. The cast keeps this temporary fixture out of the sim type-extension loop.
  return previewFrame as unknown as Readonly<SimState>;
}

/** Spawn events of the preview entities, so the screenshot exercises the event path (spec 11.3). */
function createPreviewEvents(): SimEvent[] {
  const enemyEvents = PREVIEW_ENEMIES.map((enemy): SimEvent => ({
    type: 'enemySpawned',
    id: enemy.id,
    enemyId: 'gloomling',
    lane: enemy.lane,
  }));
  return [
    { type: 'defenderPlaced', id: 1, defenderId: 'sparkbolt_gremlin', lane: 2, col: 0, stars: 1 },
    { type: 'defenderPlaced', id: 2, defenderId: 'glowshroom_monk', lane: 2, col: 1, stars: 1 },
    { type: 'defenderPlaced', id: 3, defenderId: 'iron_granny', lane: 3, col: 4, stars: 1 },
    { type: 'defenderPlaced', id: 4, defenderId: 'sparkbolt_gremlin', lane: 1, col: 5, stars: 1 },
    { type: 'defenderPlaced', id: 5, defenderId: 'glowshroom_monk', lane: 4, col: 3, stars: 1 },
    ...enemyEvents,
    { type: 'projectileSpawned', id: 20, kind: 'bolt', x: 5.9, lane: 1 },
    { type: 'projectileSpawned', id: 21, kind: 'bolt', x: 4.6, lane: 2 },
    { type: 'projectileSpawned', id: 22, kind: 'bolt', x: 5.1, lane: 3 },
    { type: 'orbSpawned', id: 25, x: 2.6, lane: 0, value: 25 },
    { type: 'orbSpawned', id: 26, x: 4.9, lane: 2, value: 25 },
    { type: 'orbSpawned', id: 27, x: 8.4, lane: 4, value: 25 },
  ];
}

/**
 * Dev-only fixed-tick greybox preview for the issue #24 screenshot (spec 13.7). It drives
 * the public `showLevel` / `handleEvents` / `draw` seam exactly like the future game loop.
 * TODO(#27): remove the greybox preview route when the debug URL lands.
 */
export function startGreyboxPreview(renderer: GameRenderer): void {
  renderer.showLevel(PREVIEW_LEVEL);
  const firstTick = createPreviewState(PREVIEW_TICK, ENEMY_TICK_STEP);
  const nextTick = createPreviewState(PREVIEW_TICK + 1, 0);
  renderer.handleEvents(createPreviewEvents());
  renderer.draw(firstTick, 1);
  renderer.handleEvents([]);
  const frame = (): void => {
    renderer.draw(nextTick, PREVIEW_ALPHA);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
