/**
 * Daily quests of spec 8.5: three quests are drawn per local day, progress is
 * tracked from level results, and completing one pays 50 gold + 10 gems. All
 * three together grant a wooden chest. Pure functions only, so the draw and the
 * rewards are unit-testable with a fixed date.
 */
import { z } from 'zod';

import { economy, questById, questPool, type QuestMetric } from '../data/economy';
import type { ChestId } from '../data/economy';
import { hashSeed, createMetaRng } from './rng';

/** One quest's progress in the save file. */
export const DailyQuestSchema = z.object({
  id: z.string(),
  progress: z.number().int().nonnegative(),
  done: z.boolean(),
});

/** The daily quest block of the save (spec 8.7 plus the all-done reward flag). */
export const DailyQuestsSchema = z.object({
  date: z.string(),
  quests: z.array(DailyQuestSchema),
  allDoneRewarded: z.boolean(),
});

/** Parsed daily quest state. */
export type DailyQuests = z.infer<typeof DailyQuestsSchema>;

/** The run facts a level result hands to the quest tracker. */
export interface QuestRunSummary {
  readonly won: boolean;
  readonly stars: number;
  readonly enemiesDefeated: number;
  readonly combosTriggered: number;
  readonly mergesTo3: number;
  readonly trapUsed: boolean;
  readonly onlyCommonCards: boolean;
}

/** What the quest tracker paid out for one run. */
export interface QuestReward {
  readonly completed: readonly string[];
  readonly gold: number;
  readonly gems: number;
  readonly chest: ChestId | null;
}

const EMPTY_REWARD: QuestReward = { completed: [], gold: 0, gems: 0, chest: null };

/** Draws the three quests of one local day, deterministically from the date. */
export function createDailyQuests(date: string): DailyQuests {
  const random = createMetaRng(hashSeed(`daily-${date}`));
  const pool = [...questPool];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = pool[index];
    const swap = pool[swapIndex];
    if (current !== undefined && swap !== undefined) {
      pool[index] = swap;
      pool[swapIndex] = current;
    }
  }
  return {
    date,
    quests: pool.slice(0, economy.dailyQuestCount).map((quest) => ({
      id: quest.id,
      progress: 0,
      done: false,
    })),
    allDoneRewarded: false,
  };
}

/** Resets the quest block when the local day changed, otherwise keeps progress. */
export function ensureDailyQuests(state: DailyQuests, date: string): DailyQuests {
  return state.date === date ? state : createDailyQuests(date);
}

/** Maps a run summary onto the metric deltas a quest tracks. */
function metricDeltas(summary: QuestRunSummary): Readonly<Record<QuestMetric, number>> {
  return {
    levelsWon: summary.won ? 1 : 0,
    combos: summary.combosTriggered,
    mergesTo3: summary.mergesTo3,
    trapFreeWins: summary.won && !summary.trapUsed ? 1 : 0,
    enemiesDefeated: summary.enemiesDefeated,
    commonOnlyWins: summary.won && summary.onlyCommonCards ? 1 : 0,
  };
}

/**
 * Applies one level result to the daily quests. Newly completed quests pay their
 * reward exactly once; all three completed pay one wooden chest exactly once.
 */
export function applyRunToQuests(
  state: DailyQuests,
  summary: QuestRunSummary,
  date: string,
): { readonly state: DailyQuests; readonly reward: QuestReward } {
  const daily = ensureDailyQuests(state, date);
  const deltas = metricDeltas(summary);
  const completed: string[] = [];
  let allDone = true;

  const quests = daily.quests.map((progress) => {
    const definition = questById[progress.id];
    if (definition === undefined || progress.done) {
      allDone = allDone && progress.done;
      return progress;
    }
    const target = definition.target;
    const nextProgress = Math.min(target, progress.progress + deltas[definition.metric]);
    const done = nextProgress >= target;
    if (done) {
      completed.push(definition.id);
    } else {
      allDone = false;
    }
    return { ...progress, progress: nextProgress, done };
  });

  const allDoneReward =
    allDone && !daily.allDoneRewarded && quests.length > 0 ? economy.questChest : null;
  const nextState: DailyQuests = {
    date: daily.date,
    quests,
    allDoneRewarded: daily.allDoneRewarded || allDoneReward !== null,
  };
  if (completed.length === 0 && allDoneReward === null) {
    return { state: nextState, reward: EMPTY_REWARD };
  }
  return {
    state: nextState,
    reward: {
      completed,
      gold: completed.length * economy.questReward.gold,
      gems: completed.length * economy.questReward.gems,
      chest: allDoneReward,
    },
  };
}

/** The completed quest count of the current day. */
export function completedQuestCount(state: DailyQuests): number {
  return state.quests.filter((quest) => quest.done).length;
}
