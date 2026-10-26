/**
 * Level rewards of spec 7.3 and 8.1: first-clear gold, replay gold, the star gem
 * bonuses, card unlocks, first-clear chests and the daily quest payout. One pure
 * call updates the whole save and returns a summary the result screen renders.
 */
import { defenderById } from '../data';
import { economy, type ChestId } from '../data/economy';
import type { LevelDef } from '../data/schemas';
import { cloneSave, type SaveData } from './save';
import { applyRunToQuests, type QuestRunSummary } from './quests';

/** The reward view a result screen shows. */
export interface LevelRewardSummary {
  readonly gold: number;
  readonly gems: number;
  readonly questGold: number;
  readonly questGems: number;
  readonly stars: number;
  readonly previousStars: number;
  readonly bestStars: number;
  readonly unlockedDefenderId: string | null;
  readonly chest: ChestId | null;
  readonly questChest: ChestId | null;
  readonly completedQuests: readonly string[];
}

/** Adds gold and gems to the next save. */
function addCurrency(save: SaveData, gold: number, gems: number): void {
  save.gold += gold;
  save.gems += gems;
}

/** Grants a first-clear card unlock; an already-owned card becomes bonus shards. */
function grantUnlock(save: SaveData, defenderId: string | null): void {
  if (defenderId === null || defenderById[defenderId] === undefined) {
    return;
  }
  const owned = save.cards[defenderId];
  if (owned === undefined) {
    save.cards[defenderId] = { level: 1, shards: 0 };
  } else {
    owned.shards += economy.duplicateUnlockShards;
  }
}

/** Adds one chest to the inventory. */
function grantChest(save: SaveData, chestId: ChestId | null): void {
  if (chestId === null) {
    return;
  }
  save.chests[chestId] = (save.chests[chestId] ?? 0) + 1;
}

/**
 * Applies one finished run to the save. A win pays level gold, first-time star
 * gems, the first-clear unlock/chest and records the best stars; quests track
 * both wins and losses (combos and defeats still count).
 */
export function applyLevelResult(
  save: SaveData,
  level: LevelDef,
  outcome: 'won' | 'lost',
  stars: number,
  summary: QuestRunSummary,
  date: string,
): { readonly save: SaveData; readonly rewards: LevelRewardSummary } {
  const next = cloneSave(save);
  const previousStars = (save.levels[level.id]?.stars ?? 0) as 0 | 1 | 2 | 3;
  const won = outcome === 'won';
  const clampedStars = Math.max(0, Math.min(3, Math.floor(stars)));
  const bestStars = won ? Math.max(previousStars, clampedStars) : previousStars;
  const firstClear = won && previousStars === 0;
  const gold = won
    ? firstClear
      ? level.rewards.gold
      : Math.floor(level.rewards.gold * economy.replayGoldRatio)
    : 0;
  const gemStars = won ? Math.max(previousStars, clampedStars) : previousStars;
  const gems =
    (previousStars < 2 && gemStars >= 2 ? economy.starGemBonus : 0) +
    (previousStars < 3 && gemStars >= 3 ? economy.starGemBonus : 0);
  const unlockedDefenderId = firstClear ? (level.rewards.unlockDefender ?? null) : null;
  const chest = firstClear ? (level.rewards.firstClearChest ?? null) : null;

  addCurrency(next, gold, gems);
  grantUnlock(next, unlockedDefenderId);
  grantChest(next, chest);
  if (won) {
    next.levels[level.id] = { stars: bestStars };
    next.stats.levelsWon += 1;
  }
  next.stats.enemiesDefeated += summary.enemiesDefeated;
  next.stats.combos += summary.combosTriggered;

  const questResult = applyRunToQuests(next.dailyQuests, summary, date);
  next.dailyQuests = questResult.state;
  addCurrency(next, questResult.reward.gold, questResult.reward.gems);
  grantChest(next, questResult.reward.chest);

  return {
    save: next,
    rewards: {
      gold,
      gems,
      questGold: questResult.reward.gold,
      questGems: questResult.reward.gems,
      stars: clampedStars,
      previousStars,
      bestStars,
      unlockedDefenderId,
      chest,
      questChest: questResult.reward.chest,
      completedQuests: questResult.reward.completed,
    },
  };
}
