/**
 * Campaign progression of the M4 save: a level is unlocked when the previous
 * level has at least one star (the World 1 path is strictly sequential), and the
 * star record drives the map, the title summary and the result screen.
 */
import { levels } from '../data';
import type { SaveData } from './save';

/** Levels ordered by their campaign number. */
const ORDERED_LEVELS = [...levels].sort((left, right) => left.number - right.number);

/** Recorded stars of a level, 0 when it was never won. */
export function starsForLevel(save: SaveData, levelId: string): 0 | 1 | 2 | 3 {
  return (save.levels[levelId]?.stars ?? 0) as 0 | 1 | 2 | 3;
}

/** Total stars collected in World 1. */
export function totalStars(save: SaveData): number {
  return ORDERED_LEVELS.reduce((sum, level) => sum + starsForLevel(save, level.id), 0);
}

/** Number of levels with at least one star. */
export function clearedLevelCount(save: SaveData): number {
  return ORDERED_LEVELS.filter((level) => starsForLevel(save, level.id) > 0).length;
}

/** The first level of the campaign. */
export function firstLevelId(): string {
  return ORDERED_LEVELS[0]?.id ?? 'w1_l01';
}

/** True when the level is the first or the previous level was cleared. */
export function isLevelUnlocked(save: SaveData, levelId: string): boolean {
  const index = ORDERED_LEVELS.findIndex((level) => level.id === levelId);
  if (index < 0) {
    return false;
  }
  if (index === 0) {
    return true;
  }
  const previous = ORDERED_LEVELS[index - 1];
  return previous !== undefined && starsForLevel(save, previous.id) > 0;
}

/** The first unlocked level without a star, or the last level after a full clear. */
export function nextLevelToPlay(save: SaveData): string {
  const unplayed = ORDERED_LEVELS.find(
    (level) => isLevelUnlocked(save, level.id) && starsForLevel(save, level.id) === 0,
  );
  return unplayed?.id ?? ORDERED_LEVELS[ORDERED_LEVELS.length - 1]?.id ?? firstLevelId();
}

/** The level after `levelId`, or null for the last level. */
export function nextLevelId(levelId: string): string | null {
  const index = ORDERED_LEVELS.findIndex((level) => level.id === levelId);
  const next = index >= 0 ? ORDERED_LEVELS[index + 1] : undefined;
  return next?.id ?? null;
}
