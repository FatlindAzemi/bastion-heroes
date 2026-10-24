import { defenderById, enemyById } from '../data';
import { rules } from '../data/rules';
import type { DefenderState, LoadoutEntry, SimEvent, SimState } from '../sim/types';
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

/** Loadout of the preview level; the renderer does not read it yet (spec 3.12). */
const PREVIEW_LOADOUT: readonly LoadoutEntry[] = [
  { defenderId: 'sparkbolt_gremlin', level: 1 },
  { defenderId: 'glowshroom_monk', level: 1 },
  { defenderId: 'iron_granny', level: 1 },
];

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

/** Builds a preview defender at its data health, active since level start (spec 5.1, 3.4). */
function createPreviewDefender(defender: PreviewDefender): DefenderState {
  const definition = defenderById[defender.defenderId];
  const maxHp = definition?.hp ?? 0;
  return {
    id: defender.id,
    defenderId: defender.defenderId,
    lane: defender.lane,
    col: defender.col,
    stars: 1,
    hp: maxHp,
    maxHp,
    cardLevel: 1,
    activeAtTick: 0,
  };
}

/** One tick of gloomling movement: its data speed divided by the tick rate (spec 3.2, 6.1). */
const ENEMY_TICK_STEP = (enemyById.gloomling?.speed ?? 0) / rules.tick.tickRate;

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

/** Creates a fixed preview state; `enemyStep` shifts the enemies back for the interpolation frame. */
function createPreviewState(tick: number, enemyStep: number): Readonly<SimState> {
  return {
    levelId: 'w1_l01',
    seed: 10001,
    loadout: PREVIEW_LOADOUT,
    cardCooldownEndTicks: PREVIEW_LOADOUT.map(() => 0),
    tick,
    rng: { state: 0, next: () => 0 },
    nextId: 30,
    essence: 150,
    autoCollect: false,
    defenders: PREVIEW_DEFENDERS.map(createPreviewDefender),
    enemies: PREVIEW_ENEMIES.map((enemy) => ({
      id: enemy.id,
      enemyId: 'gloomling',
      lane: enemy.lane,
      x: enemy.x + enemyStep,
    })),
    projectiles: [
      { id: 20, kind: 'bolt', lane: 1, x: 5.9 },
      { id: 21, kind: 'bolt', lane: 2, x: 4.6 },
      { id: 22, kind: 'bolt', lane: 3, x: 5.1 },
    ],
    orbs: [
      { id: 25, lane: 0, x: 2.6, value: 25 },
      { id: 26, lane: 2, x: 4.9, value: 25 },
      { id: 27, lane: 4, x: 8.4, value: 25 },
    ],
  };
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
