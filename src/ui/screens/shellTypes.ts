/**
 * Public API view types of the playable shell of issue #113: the level list, the
 * result overlay and the handles `src/main.ts` needs to mount and dispose them.
 * They stay free of simulation imports, like the existing screen types.
 */
import type { LevelRewardSummary, SaveData } from '../../meta';
import type { LoadoutChoice } from './types';

/** One level as the level select needs it; `index` is the 1-based level number. */
export interface ShellLevel {
  readonly id: string;
  readonly name: string;
  readonly index: number;
}

/** Every screen the shell can open directly (M4 meta screens included). */
export type ShellScreenName = 'title' | 'levels' | 'collection' | 'chests' | 'settings' | 'quests';

/** Options `src/main.ts` passes to `mountShell` (issue #113, M4). */
export interface ShellOptions {
  /** The World 1 levels shown by the level select, in order. */
  readonly levels: readonly ShellLevel[];
  /** The live M4 save: card ownership, stars, wallets, chests, settings, quests. */
  readonly save: SaveData;
  /** Called by "Fight!": starts the level with the chosen 6-card loadout. */
  readonly onFight: (levelId: string, loadout: readonly LoadoutChoice[]) => void;
  /** Persists a changed save after an upgrade, chest opening or settings change. */
  readonly onSave: (save: SaveData) => void;
  /** Start screen of the shell; defaults to the title screen. */
  readonly initialScreen?: ShellScreenName;
  /** Opens this level's Scouting screen instead of the initial menu screen. */
  readonly initialLevelId?: string;
}

/** The mounted shell; `dispose` removes the title / level select screens. */
export interface ShellHandle {
  dispose(): void;
}

/** Victory or defeat of a finished level run (spec 3.9). */
export type ResultOutcome = 'won' | 'lost';

/** Star rating of a finished level run, 0..3 (spec 3.11). */
export type ResultStars = 0 | 1 | 2 | 3;

/** Options `src/main.ts` passes to `mountResult` (issue #113, M4 rewards). */
export interface ResultOptions {
  readonly outcome: ResultOutcome;
  readonly stars: ResultStars;
  readonly levelName: string;
  /** Gold, gems, unlocks and chests the finished run paid (absent in debug previews). */
  readonly rewards?: LevelRewardSummary;
  /** Name of the follow-up level; the Next Level button appears when set with `onNext`. */
  readonly nextLevelName?: string;
  /** Opens the next level's Scouting screen after a win. */
  readonly onNext?: () => void;
  /** Number of unopened chests; shows the Open Chests shortcut while above zero. */
  readonly chestCount?: number;
  /** Opens the chest screen after a run that paid a chest. */
  readonly onOpenChests?: () => void;
  /** Retries the level with the same loadout. */
  readonly onRetry: () => void;
  /** Returns to the level select. */
  readonly onLevels: () => void;
}

/** The mounted result overlay. */
export interface ResultHandle {
  dispose(): void;
}
