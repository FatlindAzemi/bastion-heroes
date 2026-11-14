import { duelRules, enemyById } from '../../data';
import type { DuelCardDef, EnemyDef } from '../../data';
import { isValidLane } from '../grid';
import { ticksFromSeconds } from '../time';
import { spendEssence } from './essence';
import type { DuelCommand, DuelEvent, DuelRejectReason, DuelState, Side } from './types';

type PlayRaiderCommand = Extract<DuelCommand, { type: 'playRaider' }>;

/** A raider card of the Duel: the section 6 definition and its `duel` block (spec 18.8). */
export interface DuelRaiderCard {
  def: EnemyDef;
  duel: DuelCardDef;
}

/** Looks a raider card up by id; undefined when the id is not a Duel raider (spec 18.8). */
export function duelRaiderCard(cardId: string): DuelRaiderCard | undefined {
  const def = enemyById[cardId];
  if (def === undefined || def.duel === undefined || def.duel.kind !== 'raider') {
    return undefined;
  }
  return { def, duel: def.duel };
}

/** How many raiders one play of the card summons (spec 18.8: Gloomling 2, every other card 1). */
function summonCountOf(card: DuelRaiderCard): number {
  return card.duel.summonCount ?? 1;
}

/**
 * Living raiders of a side for the raider cap (spec 18.6): the active raiders and
 * the raiders of played cards that are still being summoned.
 */
export function countRaiders(state: Readonly<DuelState>, side: Side): number {
  const active = state.enemies.filter((raider) => raider.side === side && raider.hp > 0);
  const summoned = state.summons.filter((summon) => summon.side === side);
  return active.length + summoned.length;
}

/**
 * Validates a `playRaider` command (spec 18.5, 18.6) in a fixed order: the card is
 * a Duel raider, the lane is on the grid, all raiders of the card fit under the
 * raider cap, and the player has the Essence. All five lanes are always allowed.
 */
function validatePlay(
  state: Readonly<DuelState>,
  command: PlayRaiderCommand,
): DuelRaiderCard | DuelRejectReason {
  const card = duelRaiderCard(command.cardId);
  if (card === undefined) {
    return 'invalidCard';
  }
  if (!isValidLane(command.lane)) {
    return 'invalidTile';
  }
  // A card whose raiders do not all fit is rejected, so the cap is never exceeded (see #137).
  const raidersAfterPlay = countRaiders(state, command.side) + summonCountOf(card);
  if (raidersAfterPlay > duelRules.raiders.maxLivingRaiders) {
    return 'tooManyRaiders';
  }
  if (state.sides[command.side].essence < card.duel.cost) {
    return 'notEnoughEssence';
  }
  return card;
}

/**
 * Queues the raiders of a played card (spec 18.5, 18.8): the first appears on
 * this tick, each further one `summonGapS` later, and each becomes active the
 * summon delay after it appeared.
 */
function queueSummons(state: DuelState, card: DuelRaiderCard, command: PlayRaiderCommand): void {
  const gapTicks = ticksFromSeconds(card.duel.summonGapS ?? 0);
  const delayTicks = ticksFromSeconds(duelRules.raiders.summonDelayS);
  for (let index = 0; index < summonCountOf(card); index += 1) {
    const appearTick = state.tick + index * gapTicks;
    state.summons.push({
      side: command.side,
      enemyId: card.def.id,
      lane: command.lane,
      appearTick,
      activeAtTick: appearTick + delayTicks,
      raider: null,
    });
  }
}

/**
 * Applies a `playRaider` command (spec 18.5, 18.6). A rejected command changes
 * nothing and emits `commandRejected` with the reason. The card costs its Duel
 * cost once, however many raiders it summons (spec 18.8).
 */
export function playRaider(
  state: DuelState,
  command: PlayRaiderCommand,
  events: DuelEvent[],
): void {
  const card = validatePlay(state, command);
  if (typeof card === 'string') {
    events.push({ type: 'commandRejected', side: command.side, reason: card, command });
    return;
  }
  spendEssence(state, command.side, card.duel.cost, events);
  queueSummons(state, card, command);
}
