import { defenderById, rules } from '../data';
import type { DefenderDef, LevelDef } from '../data';
import { isPlaceableTile } from './grid';
import type { Command, DefenderState, LoadoutEntry, SimEvent, SimState } from './types';

/** The reason of a rejected command (spec 11.3). */
export type CommandRejectedReason = Extract<SimEvent, { type: 'commandRejected' }>['reason'];

type PlaceCommand = Extract<Command, { type: 'place' }>;
type ShovelCommand = Extract<Command, { type: 'shovel' }>;

/** Converts data seconds to whole simulation ticks (spec 3.2: `Math.round(seconds * 30)`). */
export function ticksFromSeconds(seconds: number): number {
  return Math.round(seconds * rules.tick.tickRate);
}

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

/**
 * Applies a `place` command (spec 3.4). Validation order:
 * 1) the defender is in the loadout and in `src/data` (invalidTile),
 * 2) the tile is in bounds, in an active lane and on placeable terrain (invalidTile),
 * 3) the card is off cooldown (onCooldown),
 * 4) the player can afford the cost (notEnoughEssence),
 * 5) the tile is empty (tileOccupied; merging is M2, enemies never block).
 */
export function placeDefender(
  state: SimState,
  level: LevelDef,
  command: PlaceCommand,
  events: SimEvent[],
): void {
  const cardIndex = state.loadout.findIndex((entry) => entry.defenderId === command.defenderId);
  const card = cardIndex === -1 ? undefined : state.loadout[cardIndex];
  const defender = defenderById[command.defenderId];
  if (card === undefined || defender === undefined) {
    reject(events, 'invalidTile');
    return;
  }
  if (!isPlaceableTile(level, command.lane, command.col)) {
    reject(events, 'invalidTile');
    return;
  }
  if (!isCardReady(state, cardIndex)) {
    reject(events, 'onCooldown');
    return;
  }
  if (state.essence < defender.cost) {
    reject(events, 'notEnoughEssence');
    return;
  }
  if (findDefenderAt(state, command.lane, command.col) !== undefined) {
    reject(events, 'tileOccupied');
    return;
  }

  const id = state.nextId;
  state.nextId += 1;
  state.essence -= defender.cost;
  state.cardCooldownEndTicks[cardIndex] = state.tick + ticksFromSeconds(defender.cooldownS);
  state.defenders.push({
    id,
    defenderId: command.defenderId,
    lane: command.lane,
    col: command.col,
    stars: 1,
    hp: defender.hp,
    maxHp: defender.hp,
    cardLevel: card.level,
    activeAtTick: state.tick + ACTIVATION_DELAY_TICKS,
    nextOrbTick: initialNextOrbTick(defender, state.tick),
    nextAttackTick: 0,
    trapReadyAtTick:
      defender.pattern === 'trap' ? state.tick + ticksFromSeconds(defender.armDelayS ?? 0) : null,
    trapRearmed: false,
    attackCount: 0,
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
