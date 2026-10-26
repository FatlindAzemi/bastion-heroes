/**
 * Pure projection of the shell level list into the level select cards (issue #113,
 * M4 progression): sequential unlock, the recorded star rating and the glowing
 * "Start here" node. A level whose definition is missing from `src/data` is shown
 * as unavailable instead of crashing the screen.
 */
import { levelById } from '../../data';
import { isLevelUnlocked, starsForLevel, type SaveData } from '../../meta';
import type { ShellLevel } from './shellTypes';

/** One level card of the level select screen. */
export interface LevelCardView {
  readonly id: string;
  readonly name: string;
  /** 1-based level number shown in the card badge. */
  readonly number: number;
  /** False when the level id has no definition in `src/data`. */
  readonly available: boolean;
  /** False until the previous level has at least one star (spec 8.7 campaign path). */
  readonly unlocked: boolean;
  /** Best recorded stars, 0 when the level was never won. */
  readonly stars: 0 | 1 | 2 | 3;
  /** True for the first unlocked level without a star ("Start here"). */
  readonly next: boolean;
}

/** Builds the level select cards from the save's stars and the campaign order. */
export function levelCards(
  levels: readonly ShellLevel[],
  save: SaveData,
): readonly LevelCardView[] {
  const nextId = levels.find((level) => {
    const definition = levelById[level.id];
    return (
      definition !== undefined &&
      isLevelUnlocked(save, level.id) &&
      starsForLevel(save, level.id) === 0
    );
  })?.id;
  return levels.map((level) => ({
    id: level.id,
    name: level.name,
    number: level.index,
    available: levelById[level.id] !== undefined,
    unlocked: isLevelUnlocked(save, level.id),
    stars: starsForLevel(save, level.id),
    next: level.id === nextId,
  }));
}
