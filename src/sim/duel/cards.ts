import { defenderById, duelRules } from '../../data';
import type { DefenderDef, DuelCardDef } from '../../data';
import { isInBounds } from '../grid';
import { ACTIVATION_DELAY_TICKS } from '../placement';
import { canMerge, defenderMaxHp, rescaleTimer } from '../stars';
import { ticksFromSeconds } from '../time';
import { duelProducerIntervalTicks, spendEssence } from './essence';
import { ownsColumn } from './sides';
import type {
  DuelCommand,
  DuelDefenderState,
  DuelEvent,
  DuelRejectReason,
  DuelState,
  Side,
} from './types';

type PlayDefenderCommand = Extract<DuelCommand, { type: 'playDefender' }>;

/** A defender card of the Duel: the campaign definition and its `duel` block (spec 18.8). */
export interface DuelDefenderCard {
  def: DefenderDef;
  duel: DuelCardDef;
}

/** Card level of every card in a Duel (spec 18.6, 20.4: Duel Standard, level 6). */
export const DUEL_CARD_LEVEL = duelRules.standard.cardLevel;

/** Looks a defender card up by id; undefined when the id is not a Duel defender (spec 18.8). */
export function duelDefenderCard(cardId: string): DuelDefenderCard | undefined {
  const def = defenderById[cardId];
  if (def === undefined || def.duel === undefined || def.duel.kind !== 'defender') {
    return undefined;
  }
  return { def, duel: def.duel };
}

/** Full health of a Duel defender: the Duel health of 18.8 at the Duel Standard level (spec 4.2). */
export function duelDefenderMaxHp(card: DuelDefenderCard, stars: 1 | 2 | 3): number {
  return defenderMaxHp(card.duel.hp ?? card.def.hp, DUEL_CARD_LEVEL, stars);
}

/** Finds the defender standing on a tile, if any. */
export function findDuelDefenderAt(
  state: Readonly<DuelState>,
  lane: number,
  col: number,
): DuelDefenderState | undefined {
  return state.defenders.find((defender) => defender.lane === lane && defender.col === col);
}

/**
 * True when the side already has as many copies of the card as 18.8 allows
 * ("Max 1 per player"). A merge adds no copy, so it is never limited.
 */
export function isAtCardLimit(
  defenders: readonly DuelDefenderState[],
  side: Side,
  card: DuelDefenderCard,
): boolean {
  const limit = card.duel.maxPerPlayer;
  if (limit === undefined) {
    return false;
  }
  const copies = defenders.filter(
    (defender) => defender.side === side && defender.defenderId === card.def.id,
  );
  return copies.length >= limit;
}

/** What a validated `playDefender` command acts on. */
interface ValidatedPlay {
  card: DuelDefenderCard;
  /** The player's same defender on the tile: the play is a merge (spec 18.5, 3.6). */
  existing: DuelDefenderState | undefined;
}

/**
 * Validates a `playDefender` command (spec 18.5) in a fixed order: the card is a
 * Duel defender, the tile is on the grid, the tile is in the player's own columns,
 * the player has the Essence, the tile is empty or holds the same defender below
 * the max stars, and a new copy stays within the card's limit.
 */
function validatePlay(
  state: Readonly<DuelState>,
  command: PlayDefenderCommand,
): ValidatedPlay | DuelRejectReason {
  const card = duelDefenderCard(command.cardId);
  if (card === undefined) {
    return 'invalidCard';
  }
  if (!isInBounds(command.lane, command.col)) {
    return 'invalidTile';
  }
  if (!ownsColumn(command.side, command.col)) {
    return 'notYourSide';
  }
  if (state.sides[command.side].essence < card.duel.cost) {
    return 'notEnoughEssence';
  }
  const existing = findDuelDefenderAt(state, command.lane, command.col);
  if (existing !== undefined) {
    return canMerge(existing, card.def) ? { card, existing } : 'tileOccupied';
  }
  return isAtCardLimit(state.defenders, command.side, card)
    ? 'cardLimitReached'
    : { card, existing };
}

/** Tick of the first producer pulse of a placed defender, or null when it does not produce (spec 18.8). */
function firstProducerTick(card: DuelDefenderCard, placedTick: number): number | null {
  const producer = card.duel.producer;
  return producer === undefined ? null : placedTick + ticksFromSeconds(producer.firstDelayS);
}

/** Tick at which a placed trap defender is armed, or null for every other pattern (spec 4.3, 18.8). */
function trapReadyTick(card: DuelDefenderCard, placedTick: number): number | null {
  if (card.def.pattern !== 'trap') {
    return null;
  }
  return placedTick + ticksFromSeconds(card.duel.armDelayS ?? card.def.armDelayS ?? 0);
}

/** Adds a fresh ★1 defender of the side; it becomes active after 0.5 s (spec 18.5, 3.4). */
function spawnDuelDefender(
  state: DuelState,
  card: DuelDefenderCard,
  command: PlayDefenderCommand,
  events: DuelEvent[],
): void {
  const { side, lane, col } = command;
  const id = state.nextId;
  const maxHp = duelDefenderMaxHp(card, 1);
  state.nextId += 1;
  state.defenders.push({
    id,
    side,
    defenderId: card.def.id,
    lane,
    col,
    stars: 1,
    hp: maxHp,
    maxHp,
    cardLevel: DUEL_CARD_LEVEL,
    activeAtTick: state.tick + ACTIVATION_DELAY_TICKS,
    nextOrbTick: firstProducerTick(card, state.tick),
    nextAttackTick: 0,
    trapReadyAtTick: trapReadyTick(card, state.tick),
    trapRearmed: false,
    attackCount: 0,
    burstShotsRemaining: 0,
  });
  events.push({ type: 'defenderPlaced', side, id, defenderId: card.def.id, lane, col, stars: 1 });
}

/**
 * Merges a played card into the player's same defender on the tile (spec 3.6,
 * 18.5): one more star, the same entity id, a full heal to the new health and a
 * producer timer that keeps its progress at the faster interval.
 */
function mergeDuelDefender(
  state: DuelState,
  card: DuelDefenderCard,
  existing: DuelDefenderState,
  events: DuelEvent[],
): void {
  const previousStars = existing.stars;
  const stars: 2 | 3 = previousStars === 1 ? 2 : 3;
  existing.stars = stars;
  existing.maxHp = duelDefenderMaxHp(card, stars);
  existing.hp = existing.maxHp;
  // A ★3 burst bonus must not continue a burst started below ★3.
  existing.burstShotsRemaining = 0;
  const producer = card.duel.producer;
  if (producer !== undefined && existing.nextOrbTick !== null) {
    existing.nextOrbTick = rescaleTimer(
      existing.nextOrbTick,
      state.tick,
      duelProducerIntervalTicks(producer, previousStars),
      duelProducerIntervalTicks(producer, stars),
    );
  }
  events.push({ type: 'defenderMerged', side: existing.side, id: existing.id, stars });
}

/**
 * Applies a `playDefender` command (spec 18.5). A rejected command changes
 * nothing and emits `commandRejected` with the reason. A merge costs the full
 * Duel cost like a normal placement (spec 3.6); there are no cooldowns (18.4).
 */
export function playDefender(
  state: DuelState,
  command: PlayDefenderCommand,
  events: DuelEvent[],
): void {
  const play = validatePlay(state, command);
  if (typeof play === 'string') {
    events.push({ type: 'commandRejected', side: command.side, reason: play, command });
    return;
  }
  spendEssence(state, command.side, play.card.duel.cost, events);
  if (play.existing !== undefined) {
    mergeDuelDefender(state, play.card, play.existing, events);
    return;
  }
  spawnDuelDefender(state, play.card, command, events);
}
