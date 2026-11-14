import { duelRules } from '../../data';
import { duelDefenderCard, type Side } from '../duel';
import { duelCardKind, type DuelCardPlay } from '../duelMatch';
import { readLanes, type LaneReading } from './board';
import {
  bestOf,
  counterCardsOf,
  counterPlayOf,
  defenderPlayInLane,
  threatLaneOf,
} from './counter';
import { duelCardCost, legalPlaysOfCard } from './legalPlays';
import type { DuelBotStrategy, DuelBotView } from './types';

/** Essence the bot keeps for a counter (spec 18.10): the cost of its cheapest counter card in hand. */
function counterReserveOf(view: DuelBotView): number {
  const costs = counterCardsOf(view).map((cardId) => duelCardCost(cardId) ?? 0);
  return costs.length === 0 ? 0 : Math.min(...costs);
}

/**
 * True when the bot may spend on a card that is no counter: the reserve stays
 * after paying, or the Essence counter is full and further income would be lost.
 */
function maySpendOn(view: DuelBotView, cardId: string): boolean {
  const essence = view.state.sides[view.side].essence;
  const cost = duelCardCost(cardId) ?? Infinity;
  return essence - cost >= counterReserveOf(view) || essence >= duelRules.essence.maxEssence;
}

/** True when the bot has a raider in the lane, active or still being summoned. */
function hasOwnRaiderIn(view: DuelBotView, lane: number): boolean {
  const isOwn = (unit: { side: Side; lane: number }): boolean =>
    unit.side === view.side && unit.lane === lane;
  return view.state.enemies.some(isOwn) || view.state.summons.some(isOwn);
}

/** The raider cards in hand the bot may spend on right now. */
function pushCardsOf(view: DuelBotView): string[] {
  return view.hand.hand.filter(
    (cardId) => duelCardKind(cardId) === 'raider' && maySpendOn(view, cardId),
  );
}

/** The play of the best-scored card in the lane with the least enemy defender health. */
function raiderPlayOf(
  view: DuelBotView,
  lanes: readonly LaneReading[],
  costScore: (cost: number) => number,
): DuelCardPlay | undefined {
  const lane = bestOf(lanes, (reading) => -reading.enemyDefenderHealth);
  const plays = pushCardsOf(view)
    .flatMap((cardId) => legalPlaysOfCard(view, cardId))
    .filter((play) => play.lane === lane?.lane);
  return bestOf(plays, (play) => costScore(duelCardCost(play.cardId) ?? 0));
}

/**
 * The opener: while no enemy trap is used, the cheapest raider goes into a lane
 * without own raiders to spring its trap; a trap would kill every raider sent
 * after it (spec 18.7).
 */
function openerPlayOf(view: DuelBotView, lanes: readonly LaneReading[]): DuelCardPlay | undefined {
  const untouched = lanes.filter(
    (lane) => !lane.isEnemyTrapUsed && !hasOwnRaiderIn(view, lane.lane),
  );
  return raiderPlayOf(view, untouched, (cost) => -cost);
}

/** The push (spec 18.10): the most expensive raider into a lane whose enemy trap is used. */
function pushPlayOf(view: DuelBotView, lanes: readonly LaneReading[]): DuelCardPlay | undefined {
  const open = lanes.filter((lane) => lane.isEnemyTrapUsed);
  return raiderPlayOf(view, open, (cost) => cost);
}

/** Number of own defenders in a lane. */
function ownDefenderCount(view: DuelBotView, lane: number): number {
  return view.state.defenders.filter(
    (defender) => defender.side === view.side && defender.lane === lane,
  ).length;
}

/** A defender the bot may spend on, placed in the lane with the fewest own defenders. */
function buildPlayOf(view: DuelBotView, lanes: readonly LaneReading[]): DuelCardPlay | undefined {
  const plays = view.hand.hand
    .filter((cardId) => duelDefenderCard(cardId) !== undefined && maySpendOn(view, cardId))
    .flatMap((cardId) => lanes.map((lane) => defenderPlayInLane(view, cardId, lane)))
    .flatMap((play) => (play === undefined ? [] : [play]));
  return bestOf(plays, (play) => -ownDefenderCount(view, play.lane));
}

/** A producer card the bot may spend on, while regular time leaves it time to pay back (spec 18.2). */
function producerPlayOf(view: DuelBotView, lanes: readonly LaneReading[]): DuelCardPlay | undefined {
  if (view.state.phase !== 'regular') {
    return undefined;
  }
  const producers = view.hand.hand.filter(
    (cardId) => duelDefenderCard(cardId)?.duel.producer !== undefined,
  );
  return buildPlayOf({ ...view, hand: { ...view.hand, hand: producers } }, lanes);
}

/**
 * `hard` (spec 18.10): counters like `normal`, but waits for the Essence when it
 * cannot pay for a counter yet, keeps the cost of a counter in reserve, and
 * spends the rest on raiders in lanes with a used trap.
 */
export const hardStrategy: DuelBotStrategy = (view) => {
  const lanes = readLanes(view);
  // Spec 18.10: hard saves Essence only for lanes it holds a counter card for.
  const threat = threatLaneOf(lanes.filter((lane) => counterCardsOf(view, lane).length > 0));
  if (threat !== undefined) {
    const counter = counterPlayOf(view, threat);
    const isFull = view.state.sides[view.side].essence >= duelRules.essence.maxEssence;
    if (counter !== null || !isFull) {
      return counter;
    }
  }
  return (
    producerPlayOf(view, lanes) ??
    pushPlayOf(view, lanes) ??
    openerPlayOf(view, lanes) ??
    buildPlayOf(view, lanes) ??
    null
  );
};
