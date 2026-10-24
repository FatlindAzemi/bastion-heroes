/**
 * Debug URL support (issue #27, spec 13.7): turns
 * `?level=<id>&seed=<n>&tick=<n>` into a boot request and fast-forwards the
 * simulation before the first frame. Issue #49 adds the additive
 * `?level=<id>&scout=1` entry that opens the Scouting -> Loadout flow first; the
 * `scout` value is exactly `1`, every other value keeps the direct level start.
 * `parseDebugUrl` is a pure function so it can be tested without a browser; the
 * module uses no Node APIs.
 */
import { defenders, levelById, rules } from './data';
import type { LevelDef } from './data/schemas';
import type { LoadoutEntry, Sim, SimEvent } from './sim/types';

/** One debug auto-placement: put a defender on a tile before the first rendered frame. */
export interface DebugPlacement {
  readonly defenderId: string;
  readonly lane: number;
  readonly col: number;
}

/** A validated debug-level request: which level, which seed and how many ticks to skip. */
export interface DebugLevelRequest {
  readonly levelId: string;
  readonly seed: number;
  readonly tick: number;
  /** Debug-only loadout override (`?cards=id,id`), used for model screenshots. */
  readonly cards?: readonly string[];
  /** Debug-only auto-placements (`?place=id:lane,col;...`), applied after the fast-forward. */
  readonly placements?: readonly DebugPlacement[];
  /** Debug-only auto-collect (`?autocollect=1`) so sky drops fund the screenshot loadout. */
  readonly autoCollect?: boolean;
}

/**
 * The result of reading the debug URL: title screen, a direct level run, the
 * Scouting -> Loadout entry (`scout=1`), or a readable error.
 */
export type DebugUrlResult =
  | { readonly kind: 'title' }
  | ({ readonly kind: 'level' } & DebugLevelRequest)
  | ({ readonly kind: 'scout' } & DebugLevelRequest)
  | { readonly kind: 'error'; readonly message: string };

/** Maps a URL level token like `w1-l01` to the data id `w1_l01` (spec 7.2). */
function normalizeLevelId(rawLevelId: string): string {
  return rawLevelId.trim().replace(/-/g, '_');
}

/**
 * Reads a non-negative safe integer query parameter. Missing parameters use the
 * fallback; invalid values return the readable error message as a string instead.
 */
function parseIntegerParam(
  parameters: URLSearchParams,
  name: string,
  fallback: number,
): number | string {
  const rawValue = parameters.get(name);
  if (rawValue === null) {
    return fallback;
  }
  if (!/^\d+$/.test(rawValue)) {
    return `Debug URL: "${name}" must be a non-negative integer, got "${rawValue}".`;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    return `Debug URL: "${name}" is too large: "${rawValue}".`;
  }
  return value;
}

/** Reads the optional `?cards=` loadout override; returns an error message as a string. */
function parseCards(parameters: URLSearchParams): string[] | string {
  const rawCards = parameters.get('cards');
  if (rawCards === null) {
    return [];
  }
  const cards = rawCards
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (cards.length === 0) {
    return 'Debug URL: "cards" needs at least one defender id.';
  }
  for (const defenderId of cards) {
    if (defenders.every((defender) => defender.id !== defenderId)) {
      return `Debug URL: unknown defender "${defenderId}" in "cards".`;
    }
  }
  return cards;
}

/** Reads the optional `?place=id:lane,col;...` auto-placement list. */
function parsePlacements(parameters: URLSearchParams): DebugPlacement[] | string {
  const rawPlacements = parameters.get('place');
  if (rawPlacements === null) {
    return [];
  }
  const placements: DebugPlacement[] = [];
  for (const token of rawPlacements
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)) {
    const match = /^([a-z0-9_]+):(\d+),(\d+)$/.exec(token);
    if (match === null) {
      return `Debug URL: bad "place" entry "${token}", expected <defenderId>:<lane>,<col>.`;
    }
    const defenderId = match[1] ?? '';
    const lane = Number(match[2]);
    const col = Number(match[3]);
    if (defenders.every((defender) => defender.id !== defenderId)) {
      return `Debug URL: unknown defender "${defenderId}" in "place".`;
    }
    if (lane < 0 || lane >= rules.grid.laneCount || col < 0 || col >= rules.grid.columnCount) {
      return `Debug URL: "place" entry "${token}" is outside the grid.`;
    }
    placements.push({ defenderId, lane, col });
  }
  if (placements.length === 0) {
    return 'Debug URL: "place" needs at least one <defenderId>:<lane>,<col> entry.';
  }
  return placements;
}

/**
 * Parses the debug URL query (spec 13.7: `?level=w1-l01&seed=10001&tick=900`).
 * Without a `level` parameter the app shows its title screen. Unknown levels and
 * malformed seed/tick values give a readable error instead of a crash. The
 * additive `scout=1` value of issue #49 routes to the Scouting -> Loadout flow
 * and carries `seed`/`tick` through; `scout` is exact, so any other value keeps
 * starting the level directly.
 */
export function parseDebugUrl(search: string): DebugUrlResult {
  const parameters = new URLSearchParams(search);
  const rawLevelId = parameters.get('level');
  if (rawLevelId === null) {
    return { kind: 'title' };
  }
  const levelId = normalizeLevelId(rawLevelId);
  const level = levelById[levelId];
  if (level === undefined) {
    const knownLevels = Object.keys(levelById).sort().join(', ') || '(none)';
    return {
      kind: 'error',
      message: `Debug URL: unknown level "${rawLevelId}". Known levels: ${knownLevels}.`,
    };
  }
  const seed = parseIntegerParam(parameters, 'seed', level.seed);
  if (typeof seed === 'string') {
    return { kind: 'error', message: seed };
  }
  const tick = parseIntegerParam(parameters, 'tick', 0);
  if (typeof tick === 'string') {
    return { kind: 'error', message: tick };
  }
  const cards = parseCards(parameters);
  if (typeof cards === 'string') {
    return { kind: 'error', message: cards };
  }
  const placements = parsePlacements(parameters);
  if (typeof placements === 'string') {
    return { kind: 'error', message: placements };
  }
  const kind = parameters.get('scout') === '1' ? 'scout' : 'level';
  return {
    kind,
    levelId,
    seed,
    tick,
    ...(cards.length > 0 ? { cards } : {}),
    ...(placements.length > 0 ? { placements } : {}),
    ...(parameters.get('autocollect') === '1' ? { autoCollect: true } : {}),
  };
}

/**
 * Debug loadout: the level's fixed tutorial loadout, or the first available
 * defenders for a free-loadout level, always at card level 1 (spec 3.12). The
 * real loadout screen arrives with M2 issue 2.8.
 */
export function createDebugLoadout(level: LevelDef, cards?: readonly string[]): LoadoutEntry[] {
  const defenderIds =
    cards !== undefined && cards.length > 0
      ? cards
      : (level.fixedLoadout ??
        defenders.slice(0, level.loadoutSlots).map((defender) => defender.id));
  return defenderIds.map((defenderId) => ({ defenderId, level: 1 }));
}

/**
 * Steps the simulation exactly `ticks` times before the first rendered frame
 * (issue #27). The optional sink receives every tick's event list, so the
 * renderer and HUD adapters see the same stream the running loop would produce
 * (spec 11.3, 11.4).
 */
export function fastForward(
  sim: Sim,
  ticks: number,
  onEvents?: (events: readonly SimEvent[]) => void,
): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    const events = sim.step();
    onEvents?.(events);
  }
}
