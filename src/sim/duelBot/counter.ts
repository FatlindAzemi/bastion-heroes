import { tileCenterX } from '../grid';
import { duelDefenderCard, duelRaiderCard } from '../duel';
import type { DuelCardPlay } from '../duelMatch';
import { distanceFromOwnBase, type LaneReading } from './board';
import { duelCardCost, legalPlaysOfCard } from './legalPlays';
import type { DuelBotView } from './types';

/** Enemy raider health in a lane that no own unit in its way matches yet. */
function unansweredHealthOf(lane: LaneReading): number {
  return lane.enemyRaiderHealth - lane.ownBlockerHealth;
}

/**
 * The lane to counter (spec 18.10): the lane with the most enemy raider health
 * after subtracting the health of the own units in its way. A lane whose raiders
 * are outweighed is not a threat. Equal lanes go to the lower lane index.
 */
export function threatLaneOf(lanes: readonly LaneReading[]): LaneReading | undefined {
  const threat = bestOf(lanes, unansweredHealthOf);
  return threat !== undefined && unansweredHealthOf(threat) > 0 ? threat : undefined;
}

/** True when the card can stop raiders: a defender that fights, or a ground raider (spec 18.6). */
export function isCounterCard(cardId: string): boolean {
  const defender = duelDefenderCard(cardId);
  if (defender !== undefined) {
    return defender.duel.producer === undefined;
  }
  return duelRaiderCard(cardId)?.def.isFlying === false;
}

/** True when the card can hit flying raiders: a defender with `hitsFlying` (spec 4.4). */
export function isAntiAirCard(cardId: string): boolean {
  return duelDefenderCard(cardId)?.def.hitsFlying === true;
}

/**
 * The counter cards in hand, defenders before raiders, each group in hand order.
 * Against a lane of only flying raiders only anti-air defenders count.
 */
export function counterCardsOf(view: DuelBotView, lane?: LaneReading): string[] {
  const fits = lane?.isAirOnly === true ? isAntiAirCard : isCounterCard;
  const cards = view.hand.hand.filter(fits);
  const defenders = cards.filter((cardId) => duelDefenderCard(cardId) !== undefined);
  return [...defenders, ...cards.filter((cardId) => !defenders.includes(cardId))];
}

/** Picks the entry with the best score; the first one wins a tie. Undefined for an empty list. */
export function bestOf<Entry>(
  entries: readonly Entry[],
  scoreOf: (entry: Entry) => number,
): Entry | undefined {
  let best: Entry | undefined;
  let bestScore = -Infinity;
  for (const entry of entries) {
    const score = scoreOf(entry);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The tile a defender card takes in a lane: a wall stands as far forward as
 * possible, every other defender as close to the own gate as possible. With
 * raiders in the lane only tiles between the gate and the closest raider count.
 */
export function defenderPlayInLane(
  view: DuelBotView,
  cardId: string,
  lane: LaneReading,
): DuelCardPlay | undefined {
  const isWall = duelDefenderCard(cardId)?.def.role === 'wall';
  const tileDistance = (play: DuelCardPlay): number =>
    distanceFromOwnBase(view.side, tileCenterX(play.col ?? 0));
  const plays = legalPlaysOfCard(view, cardId).filter(
    (play) => play.lane === lane.lane && tileDistance(play) < lane.closestRaiderDistance,
  );
  return bestOf(plays, (play) => (isWall ? tileDistance(play) : -tileDistance(play)));
}

/** The play of one counter card in the threat lane, or undefined when it has none right now. */
function counterPlayOfCard(
  view: DuelBotView,
  cardId: string,
  lane: LaneReading,
): DuelCardPlay | undefined {
  if (duelDefenderCard(cardId) !== undefined) {
    return defenderPlayInLane(view, cardId, lane);
  }
  return legalPlaysOfCard(view, cardId).find((play) => play.lane === lane.lane);
}

/**
 * The counter to a threat lane (spec 18.10): a defender in the raiders' way, or a
 * ground raider in the lane when no defender fits. The most expensive counter the
 * bot can pay for wins; defenders go before raiders. Null when nothing fits now.
 */
export function counterPlayOf(view: DuelBotView, lane: LaneReading): DuelCardPlay | null {
  const plays = counterCardsOf(view, lane).flatMap((cardId) => {
    const play = counterPlayOfCard(view, cardId, lane);
    return play === undefined ? [] : [play];
  });
  const defenderPlays = plays.filter((play) => play.col !== undefined);
  const pool = defenderPlays.length > 0 ? defenderPlays : plays;
  return bestOf(pool, (play) => duelCardCost(play.cardId) ?? 0) ?? null;
}
