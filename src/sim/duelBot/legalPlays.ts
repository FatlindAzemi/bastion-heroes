import { duelRules } from '../../data';
import { LANE_COUNT } from '../grid';
import { canMerge } from '../stars';
import {
  countRaiders,
  duelDefenderCard,
  duelRaiderCard,
  findDuelDefenderAt,
  isAtCardLimit,
  ownColumnsOf,
  type DuelDefenderCard,
} from '../duel';
import { duelCardKind, type DuelCardPlay } from '../duelMatch';
import type { DuelBotView } from './types';

/** Duel cost of a card, or undefined when the id is not a Duel card (spec 18.8). */
export function duelCardCost(cardId: string): number | undefined {
  return (duelDefenderCard(cardId) ?? duelRaiderCard(cardId))?.duel.cost;
}

/** True when the bot has the Essence for the card (spec 18.4). */
function canAfford(view: DuelBotView, cost: number): boolean {
  return view.state.sides[view.side].essence >= cost;
}

/** True when the tile takes the defender: empty within the card limit, or a merge (spec 18.5, 18.8). */
function isLegalDefenderTile(
  view: DuelBotView,
  card: DuelDefenderCard,
  lane: number,
  col: number,
): boolean {
  const existing = findDuelDefenderAt(view.state, lane, col);
  if (existing !== undefined) {
    return canMerge(existing, card.def);
  }
  return !isAtCardLimit(view.state.defenders, view.side, card);
}

/** Every legal placement of a defender card: lanes ascending, own columns ascending (spec 18.5). */
function legalDefenderPlays(view: DuelBotView, card: DuelDefenderCard): DuelCardPlay[] {
  const plays: DuelCardPlay[] = [];
  if (!canAfford(view, card.duel.cost)) {
    return plays;
  }
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    for (const col of ownColumnsOf(view.side)) {
      if (isLegalDefenderTile(view, card, lane, col)) {
        plays.push({ cardId: card.def.id, lane, col });
      }
    }
  }
  return plays;
}

/** Every legal lane of a raider card: all five when the Essence and the raider cap allow it (spec 18.5, 18.6). */
function legalRaiderPlays(view: DuelBotView, cardId: string): DuelCardPlay[] {
  const card = duelRaiderCard(cardId);
  if (card === undefined || !canAfford(view, card.duel.cost)) {
    return [];
  }
  const raidersAfterPlay = countRaiders(view.state, view.side) + (card.duel.summonCount ?? 1);
  if (raidersAfterPlay > duelRules.raiders.maxLivingRaiders) {
    return [];
  }
  return Array.from({ length: LANE_COUNT }, (_, lane) => ({ cardId, lane }));
}

/**
 * Every play of one card the sim accepts on the next tick (spec 18.5): the same
 * rules as `playDefender` and `playRaider`, checked on the public state.
 */
export function legalPlaysOfCard(view: DuelBotView, cardId: string): DuelCardPlay[] {
  if (duelCardKind(cardId) === 'raider') {
    return legalRaiderPlays(view, cardId);
  }
  const card = duelDefenderCard(cardId);
  return card === undefined ? [] : legalDefenderPlays(view, card);
}

/** The cards in hand that have at least one legal play, in hand order. */
export function playableCards(view: DuelBotView): string[] {
  return view.hand.hand.filter((cardId) => legalPlaysOfCard(view, cardId).length > 0);
}
