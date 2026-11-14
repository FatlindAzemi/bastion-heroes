/**
 * Debug Duel URL (issue #129): `?duel=1` starts a bot-vs-bot Duel with a fixed seed,
 * so the Duel renderer can be seen and screenshot before the Duel HUD and the
 * Training entry exist (#130). Parameters:
 * - `seed=<n>`: sim seed (default 1); the private and bot seeds derive from it.
 * - `view=south|north`: whose view is drawn (spec 18.1, default south).
 * - `tick=<n>`: fast-forward this many ticks before the first frame (default 0).
 * - `hold=1`: stop the sim after the fast-forward, for still screenshots.
 * - `south=` / `north=`: bot level `easy`, `normal` or `hard` (default hard).
 * `parseDuelDebugUrl` is pure, so it is tested without a browser.
 */
import { advance } from './loop';
import type { GameRenderer } from './render';
import type { Side } from './sim/duel';
import { createDuelBot, playDuelBotTurn, type DuelBot, type DuelBotLevel } from './sim/duelBot';
import { createLocalDuelMatch, type LocalDuelMatch } from './sim/duelMatch';

/** Two legal debug decks (spec 18.4): the Arena 1 starter cards and a mixed deck. */
const DEBUG_DECKS: Readonly<Record<Side, readonly string[]>> = {
  south: [
    'sparkbolt_gremlin',
    'glowshroom_monk',
    'iron_granny',
    'boomcap_brewer',
    'gloomling',
    'pothead',
    'shade_wisp',
    'bat_swarm',
  ],
  north: [
    'pyro_fox',
    'rune_archer',
    'frost_witch',
    'snowpup_yeti',
    'gloom_ogre',
    'gloom_priest',
    'shieldbearer',
    'gloomling',
  ],
};

const BOT_LEVELS: readonly DuelBotLevel[] = ['easy', 'normal', 'hard'];

/** A valid debug Duel request. */
export interface DuelDebugRequest {
  readonly seed: number;
  readonly viewSide: Side;
  readonly tick: number;
  readonly hold: boolean;
  readonly bots: Readonly<Record<Side, DuelBotLevel>>;
}

/** The result of reading the URL: no Duel, a Duel, or a readable error. */
export type DuelDebugUrlResult =
  | { readonly kind: 'none' }
  | ({ readonly kind: 'duel' } & DuelDebugRequest)
  | { readonly kind: 'error'; readonly message: string };

/** Reads a non-negative integer parameter, or returns an error message. */
function readInteger(parameters: URLSearchParams, name: string, fallback: number): number | string {
  const raw = parameters.get(name);
  if (raw === null) {
    return fallback;
  }
  return /^\d{1,9}$/.test(raw)
    ? Number(raw)
    : `Debug Duel: "${name}" must be a non-negative integer.`;
}

/** Reads a bot level parameter, or returns an error message. */
function readBotLevel(parameters: URLSearchParams, side: Side): DuelBotLevel | string {
  const raw = parameters.get(side) ?? 'hard';
  const level = BOT_LEVELS.find((candidate) => candidate === raw);
  return level ?? `Debug Duel: "${side}" must be easy, normal or hard.`;
}

/** Parses `?duel=1&seed=&view=&tick=&hold=&south=&north=` (issue #129). */
export function parseDuelDebugUrl(search: string): DuelDebugUrlResult {
  const parameters = new URLSearchParams(search);
  if (parameters.get('duel') !== '1') {
    return { kind: 'none' };
  }
  const view = parameters.get('view') ?? 'south';
  const seed = readInteger(parameters, 'seed', 1);
  const tick = readInteger(parameters, 'tick', 0);
  const south = readBotLevel(parameters, 'south');
  const north = readBotLevel(parameters, 'north');
  const problem = [seed, tick, south, north].find(
    (value) => typeof value === 'string' && value.startsWith('Debug Duel:'),
  );
  if (typeof problem === 'string') {
    return { kind: 'error', message: problem };
  }
  if (view !== 'south' && view !== 'north') {
    return { kind: 'error', message: 'Debug Duel: "view" must be south or north.' };
  }
  return {
    kind: 'duel',
    seed: Number(seed),
    viewSide: view,
    tick: Number(tick),
    hold: parameters.get('hold') === '1',
    bots: { south: south as DuelBotLevel, north: north as DuelBotLevel },
  };
}

/** The running debug match: the local host and one bot per side. */
interface DebugDuel {
  readonly match: LocalDuelMatch;
  readonly bots: readonly DuelBot[];
}

/** Creates the local match and both bots from the request's seed. */
function createDebugDuel(request: DuelDebugRequest): DebugDuel {
  const match = createLocalDuelMatch({
    seed: request.seed,
    players: {
      south: { deck: DEBUG_DECKS.south, privateSeed: request.seed * 2 + 1 },
      north: { deck: DEBUG_DECKS.north, privateSeed: request.seed * 2 + 2 },
    },
  });
  const bots = (['south', 'north'] as const).map((side, index) =>
    createDuelBot({ level: request.bots[side], side, seed: request.seed * 10 + index }),
  );
  return { match, bots };
}

/** One tick in the #127 order: both bots, then `step()`. Null once the match ended. */
function stepDebugDuel(duel: DebugDuel): ReturnType<LocalDuelMatch['step']> | null {
  if (duel.match.state.result !== null) {
    return null;
  }
  for (const bot of duel.bots) {
    playDuelBotTurn(bot, duel.match);
  }
  return duel.match.step();
}

/** Starts the debug Duel and its 30 Hz loop (spec 11.4) on the given renderer. */
export function startDebugDuel(renderer: GameRenderer, request: DuelDebugRequest): void {
  const duel = createDebugDuel(request);
  renderer.showDuel({ viewSide: request.viewSide });
  for (let tick = 0; tick < request.tick; tick += 1) {
    stepDebugDuel(duel);
  }
  let accumulatorSeconds = 0;
  let lastTimeMs = performance.now();
  const frame = (timeMs: number): void => {
    const advanced = advance(
      accumulatorSeconds,
      (timeMs - lastTimeMs) / 1000,
      request.hold ? 0 : 1,
    );
    accumulatorSeconds = advanced.accumulatorSeconds;
    lastTimeMs = timeMs;
    for (let tick = 0; tick < advanced.ticks; tick += 1) {
      renderer.handleDuelEvents(stepDebugDuel(duel) ?? []);
    }
    renderer.drawDuel(duel.match.state, advanced.alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
