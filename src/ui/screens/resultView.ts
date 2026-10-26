/**
 * Pure text, star and reward projection of the result overlay (issue #113, M4),
 * unit-tested in `tests/ui/resultView.test.ts`.
 */
import { defenderById } from '../../data';
import { chestById } from '../../data/economy';
import type { LevelRewardSummary } from '../../meta';
import { formatAmount } from './format';
import type { ResultOutcome, ResultStars } from './shellTypes';

/** Everything the result panel renders for one finished level. */
export interface ResultView {
  readonly won: boolean;
  readonly heading: string;
  readonly subtitle: string;
  /** Exactly three flags, one per star; true for every earned star. */
  readonly starStates: readonly boolean[];
}

/** Icon used by one reward row (kept separate from the SVG component). */
export type ResultRewardIcon = 'goldCoin' | 'gem' | 'timer' | 'cards' | 'chest';

/** One reward line of the result panel. */
export interface ResultRewardRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly icon: ResultRewardIcon;
}

const SUBTITLES: Readonly<Record<ResultOutcome, string>> = {
  won: 'The Bastion stands.',
  lost: 'The Gloom broke through.',
};

/** Maps the level result into the result panel texts and the three star states. */
export function resultView(outcome: ResultOutcome, stars: ResultStars): ResultView {
  const won = outcome === 'won';
  const earned = Math.min(3, Math.max(0, stars));
  return {
    won,
    heading: won ? 'Victory!' : 'Defeat',
    subtitle: SUBTITLES[outcome],
    starStates: [earned >= 1, earned >= 2, earned >= 3],
  };
}

/**
 * Projects the reward summary into compact rows: level gold and star gems, the
 * daily-quest payout, a first-clear card and the chests the run paid. Missing or
 * zero rewards never produce an empty row.
 */
export function resultRewardRows(
  rewards: LevelRewardSummary | undefined,
): readonly ResultRewardRow[] {
  if (rewards === undefined) {
    return [];
  }
  const rows: ResultRewardRow[] = [];
  if (rewards.gold > 0) {
    rows.push({
      id: 'gold',
      label: 'Level gold',
      value: `+${formatAmount(rewards.gold)}`,
      icon: 'goldCoin',
    });
  }
  if (rewards.gems > 0) {
    rows.push({
      id: 'gems',
      label: 'Star bonus',
      value: `+${formatAmount(rewards.gems)}`,
      icon: 'gem',
    });
  }
  if (rewards.questGold > 0 || rewards.questGems > 0) {
    rows.push({
      id: 'quests',
      label: rewards.completedQuests.length > 0 ? 'Daily quests' : 'Quest reward',
      value: `+${formatAmount(rewards.questGold)} gold · +${formatAmount(rewards.questGems)} gems`,
      icon: 'timer',
    });
  }
  const unlocked =
    rewards.unlockedDefenderId === null ? undefined : defenderById[rewards.unlockedDefenderId];
  if (unlocked !== undefined) {
    rows.push({ id: 'unlock', label: 'New card', value: unlocked.name, icon: 'cards' });
  }
  const chest = rewards.chest === null ? undefined : chestById[rewards.chest];
  if (chest !== undefined) {
    rows.push({ id: 'chest', label: 'First clear', value: chest.name, icon: 'chest' });
  }
  const questChest = rewards.questChest === null ? undefined : chestById[rewards.questChest];
  if (questChest !== undefined) {
    rows.push({ id: 'quest-chest', label: 'All quests', value: questChest.name, icon: 'chest' });
  }
  return rows;
}
