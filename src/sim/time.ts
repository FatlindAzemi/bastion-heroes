import { rules } from '../data';

/**
 * Converts data seconds to whole simulation ticks (spec 3.2: all timers count
 * integer ticks and data durations are converted with `Math.round(seconds * 30)`).
 */
export function ticksFromSeconds(seconds: number): number {
  return Math.round(seconds * rules.tick.tickRate);
}
