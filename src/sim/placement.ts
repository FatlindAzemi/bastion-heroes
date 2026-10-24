import { defenderById, rules } from '../data';
import type { DefenderDef, LevelDef } from '../data';
import { isPlaceableTile } from './grid';
import { canMerge, defenderMaxHp, rebaseProducerTimer } from './stars';
import { ticksFromSeconds } from './time';
import type { Command, DefenderState, LoadoutEntry, SimEvent, SimState } from './types';

/** The reason of a rejected command (spec 11.3). */
export type CommandRejectedReason = Extract<SimEvent, { type: 'commandRejected' }>['reason'];

type PlaceCommand = Extract<Command, { type: 'place' }>;
type ShovelCommand = Extract<Command, { type: 'shovel' }>;

// Spec 3.2: the sim imports `ticksFromSeconds` from time.ts; re-exported for the
// existing call sites that import it from the placement module.
export { ticksFromSeconds };

/** 0.5 s of drop time at the fixed tick rate: 15 ticks (spec 3.2, 3.4). */
export const ACTIVATION_DELAY_TICKS = ticksFromSeconds(rules.placement.defenderActivationDelayS);

/** True when the defender has finished its drop and may act or be targeted (spec 3.4). */
export function isDefenderActive(defender: DefenderState, tick: number): boolean {
  return tick >= defender.activeAtTick;
}

/** True when the loadout card at this index is off cooldown (spec 3.5). */
export function isCardReady(state: SimState, cardIndex: number): boolean {
  const cooldownEndTick = state.cardCooldownEndTicks[cardIndex];
  return cooldownEndTick === undefined || state.tick >= cooldownEndTick;
}

/**
 * Initial cooldown end ticks for all loadout cards (spec 3.5). A card with
 * `startsReady: false` runs its cooldown once from tick 0; the others are ready.
 */
export function initialCardCooldownEndTicks(loadout: readonly LoadoutEntry[]): number[] {
  return loadout.map((entry) => {
    const defender = defenderById[entry.defenderId];
    if (defender === undefined || defender.startsReady) {
      return 0;
    }
    return ticksFromSeconds(defender.cooldownS);
  });
}

/**
 * Tick of the first producer orb of a placed defender, or null when it does not
 * produce. The first orb comes `firstOrbDelayS` after placement (spec 5.2).
 */
function initialNextOrbTick(defender: DefenderDef, placedTick: number): number | null {
  if (defender.pattern !== 'producer' || defender.firstOrbDelayS === undefined) {
    return null;
  }
  return placedTick + ticksFromSeconds(defender.firstOrbDelayS);
}

/** Finds the defender standing on a tile, if any (spec 3.4, 3.7). */
export function findDefenderAt(
  state: SimState,
  lane: number,
  col: number,
): DefenderState | undefined {
  return state.defenders.find((defender) => defender.lane === lane && defender.col === col);
}

/** Rejects a command: it changes nothing and the UI shakes the card (spec 11.3). */
function reject(events: SimEvent[], reason: CommandRejectedReason): void {
  events.push({ type: 'commandRejected', reason });
}

/** What a validated `place` command acts on: the loadout card and the defender on the tile, if any. */
interface ValidatedPlacement {
  cardIndex: number;
  card: LoadoutEntry;
  defenderDef: DefenderDef;
  existing: DefenderState | undefined;
}

/**
 * Validates a `place` command (spec 3.4, 3.6) in the fixed order:
 * 1) the defender is in the loadout and in `src/data` (invalidTile),
 * 2) the tile is in bounds, in an active lane and on placeable terrain (invalidTile),
 * 3) the card is off cooldown (onCooldown),
 * 4) the player can afford the cost (notEnoughEssence),
 * 5) the tile is empty or holds the same defender at ★1/★2 (tileOccupied).
 * Returns the rejection reason instead of a placement when the command is invalid.
 */
function validatePlacement(
  state: SimState,
  level: LevelDef,
  command: PlaceCommand,
): ValidatedPlacement | CommandRejectedReason {
  const cardIndex = state.loadout.findIndex((entry) => entry.defenderId === command.defenderId);
  const card = cardIndex === -1 ? undefined : state.loadout[cardIndex];
  const defenderDef = defenderById[command.defenderId];
  if (card === undefined || defenderDef === undefined) {
    return 'invalidTile';
  }
  if (!isPlaceableTile(level, command.lane, command.col)) {
    return 'invalidTile';
  }
  if (!isCardReady(state, cardIndex)) {
    return 'onCooldown';
  }
  if (state.essence < defenderDef.cost) {
    return 'notEnoughEssence';
  }
  const existing = findDefenderAt(state, command.lane, command.col);
  if (existing !== undefined && !canMerge(existing, defenderDef)) {
    return 'tileOccupied';
  }
  return { cardIndex, card, defenderDef, existing };
}

/**
 * Merges a placed card into the defender already standing on its tile (spec 3.6):
 * raises the star level by one, keeps the same entity id, heals to the new full
 * health, rebases a pending producer orb timer and emits `defenderMerged`.
 */
function mergeDefender(
  state: SimState,
  existing: DefenderState,
  defenderDef: DefenderDef,
  events: SimEvent[],
): void {
  const previousStars = existing.stars;
  const stars: 2 | 3 = previousStars === 1 ? 2 : 3;
  existing.stars = stars;
  existing.maxHp = defenderMaxHp(defenderDef.hp, existing.cardLevel, stars);
  existing.hp = existing.maxHp;
  // A ★3 burst bonus must not continue a burst started below ★3.
  existing.burstShotsRemaining = 0;
  if (existing.nextOrbTick !== null && defenderDef.attackIntervalS !== undefined) {
    existing.nextOrbTick = rebaseProducerTimer(
      existing.nextOrbTick,
      state.tick,
      defenderDef.attackIntervalS,
      previousStars,
      stars,
    );
  }
  events.push({ type: 'defenderMerged', id: existing.id, stars });
}

/** Spends the full cost and starts the full cooldown: a merge pays like a normal placement (spec 3.6). */
function payPlacementCost(state: SimState, cardIndex: number, defenderDef: DefenderDef): void {
  state.essence -= defenderDef.cost;
  state.cardCooldownEndTicks[cardIndex] = state.tick + ticksFromSeconds(defenderDef.cooldownS);
}

/**
 * Adds a fresh ★1 defender to the grid with the card-level health of spec 4.2.
 * The entity id comes from the shared counter (spec 11.3).
 */
function spawnDefender(
  state: SimState,
  card: LoadoutEntry,
  defenderDef: DefenderDef,
  command: PlaceCommand,
  events: SimEvent[],
): void {
  const id = state.nextId;
  const maxHp = defenderMaxHp(defenderDef.hp, card.level, 1);
  state.nextId += 1;
  state.defenders.push({
    id,
    defenderId: command.defenderId,
    lane: command.lane,
    col: command.col,
    stars: 1,
    hp: maxHp,
    maxHp,
    cardLevel: card.level,
    activeAtTick: state.tick + ACTIVATION_DELAY_TICKS,
    nextOrbTick: initialNextOrbTick(defenderDef, state.tick),
    nextAttackTick: 0,
    trapReadyAtTick:
      defenderDef.pattern === 'trap'
        ? state.tick + ticksFromSeconds(defenderDef.armDelayS ?? 0)
        : null,
    trapRearmed: false,
    attackCount: 0,
    burstShotsRemaining: 0,
  });
  events.push({
    type: 'defenderPlaced',
    id,
    defenderId: command.defenderId,
    lane: command.lane,
    col: command.col,
    stars: 1,
  });
}

/**
 * Applies a `place` command (spec 3.4, 3.6). A same-defender placement below the
 * max stars is a merge: it pays the full cost and cooldown like a normal
 * placement and raises the star level by one. Enemies never block placement.
 */
export function placeDefender(
  state: SimState,
  level: LevelDef,
  command: PlaceCommand,
  events: SimEvent[],
): void {
  const validation = validatePlacement(state, level, command);
  if (typeof validation === 'string') {
    reject(events, validation);
    return;
  }

  const { card, defenderDef, existing, cardIndex } = validation;
  payPlacementCost(state, cardIndex, defenderDef);
  if (existing !== undefined) {
    mergeDefender(state, existing, defenderDef, events);
    return;
  }
  spawnDefender(state, card, defenderDef, command, events);
}

/**
 * Applies a `shovel` command (spec 3.7): removes the defender instantly, with no
 * Essence refund and without starting a cooldown. An empty tile is rejected.
 */
export function shovelDefender(state: SimState, command: ShovelCommand, events: SimEvent[]): void {
  const defenderIndex = state.defenders.findIndex(
    (defender) => defender.lane === command.lane && defender.col === command.col,
  );
  const defender = defenderIndex === -1 ? undefined : state.defenders[defenderIndex];
  if (defender === undefined) {
    reject(events, 'invalidTile');
    return;
  }
  state.defenders.splice(defenderIndex, 1);
  events.push({ type: 'defenderRemoved', id: defender.id, reason: 'shovel' });
}
