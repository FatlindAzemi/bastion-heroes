import { readLanes } from './board';
import { counterPlayOf, threatLaneOf } from './counter';
import { easyStrategy } from './easy';
import type { DuelBotStrategy } from './types';

/**
 * `normal` (spec 18.10): counters the lane with the most enemy health. Without
 * a threat, or without a counter it can play right now, it plays a random legal
 * card like `easy`.
 */
export const normalStrategy: DuelBotStrategy = (view, random) => {
  const threat = threatLaneOf(readLanes(view));
  const counter = threat === undefined ? null : counterPlayOf(view, threat);
  return counter ?? easyStrategy(view, random);
};
