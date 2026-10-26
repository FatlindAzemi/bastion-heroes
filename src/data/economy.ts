/**
 * Meta-economy definitions (spec 7.3, 8.1 to 8.5). Every cost, reward and chest
 * number of the collection layer lives here, never in `src/meta/` or the UI
 * (spec 1.1 rule 7).
 */
import type { DefenderDef } from './schemas';

/** The five card rarities of spec 8.2, from most to least common. */
export type Rarity = DefenderDef['rarity'];

/** Rarity order used for sorting (Mythic first) and the chest fallback rule. */
export const RARITY_ORDER: readonly Rarity[] = ['mythic', 'legendary', 'epic', 'rare', 'common'];

/** The chest ids of spec 8.4. */
export type ChestId = 'wooden' | 'silver' | 'gold' | 'magic' | 'legendary';

/** Drop odds per rarity as fractions that add up to 1. */
export type ChestOdds = Readonly<Record<Rarity, number>>;

/** One chest definition of spec 8.4. */
export interface ChestDef {
  readonly id: ChestId;
  readonly name: string;
  /** Gold added to the player's balance when the chest opens. */
  readonly gold: number;
  /** Total shards split across the stacks, before the rarity divisor. */
  readonly shardBudget: number;
  /** Minimum and maximum number of card stacks inside the chest. */
  readonly stacks: readonly [number, number];
  /** Published odds, always shown in the chest info panel (spec 8.4 rule 7). */
  readonly odds: ChestOdds;
  /** Gems needed to buy the chest in the chest screen (spec 8.4 sources, 8.8). */
  readonly gemPrice?: number;
}

/** The five chest definitions of spec 8.4, in inventory order. */
export const chestDefinitions: readonly ChestDef[] = [
  {
    id: 'wooden',
    name: 'Wooden Chest',
    gold: 40,
    shardBudget: 6,
    stacks: [1, 2],
    odds: { common: 0.85, rare: 0.14, epic: 0.01, legendary: 0, mythic: 0 },
  },
  {
    id: 'silver',
    name: 'Silver Chest',
    gold: 100,
    shardBudget: 15,
    stacks: [2, 3],
    odds: { common: 0.7, rare: 0.25, epic: 0.045, legendary: 0.005, mythic: 0 },
  },
  {
    id: 'gold',
    name: 'Gold Chest',
    gold: 300,
    shardBudget: 40,
    stacks: [3, 3],
    odds: { common: 0.55, rare: 0.32, epic: 0.11, legendary: 0.018, mythic: 0.002 },
  },
  {
    id: 'magic',
    name: 'Magic Chest',
    gold: 1000,
    shardBudget: 120,
    stacks: [4, 4],
    odds: { common: 0.4, rare: 0.35, epic: 0.2, legendary: 0.045, mythic: 0.005 },
    gemPrice: 500,
  },
  {
    id: 'legendary',
    name: 'Legendary Chest',
    gold: 0,
    shardBudget: 1,
    stacks: [1, 1],
    odds: { common: 0, rare: 0, epic: 0, legendary: 0.9, mythic: 0.1 },
    gemPrice: 1500,
  },
];

/** Chest definitions by id. */
export const chestById: Readonly<Record<ChestId, ChestDef>> = Object.fromEntries(
  chestDefinitions.map((chest) => [chest.id, chest] as const),
) as Record<ChestId, ChestDef>;

/** Card level cap of spec 8.3. */
export const MAX_CARD_LEVEL = 10;

/** Shards needed to reach the target level, before the rarity multiplier (spec 8.3). */
export const upgradeShardCosts: Readonly<Record<number, number>> = {
  2: 2,
  3: 4,
  4: 10,
  5: 20,
  6: 50,
  7: 100,
  8: 200,
  9: 400,
  10: 800,
};

/** Gold needed to reach the target level, the same for every rarity (spec 8.3). */
export const upgradeGoldCosts: Readonly<Record<number, number>> = {
  2: 20,
  3: 50,
  4: 150,
  5: 400,
  6: 1000,
  7: 2000,
  8: 4000,
  9: 8000,
  10: 20000,
};

/** Rarity divisor of the shard cost: Rare x0.5, Epic x0.2, Legendary x0.1, Mythic x0.05. */
export const rarityShardMultipliers: Readonly<Record<Rarity, number>> = {
  common: 1,
  rare: 0.5,
  epic: 0.2,
  legendary: 0.1,
  mythic: 0.05,
};

/** Rarity divisor of a chest stack's shard share (spec 8.4 rule 4). */
export const chestShardDivisors: Readonly<Record<Rarity, number>> = {
  common: 1,
  rare: 3,
  epic: 10,
  legendary: 1,
  mythic: 1,
};

/** Meta rewards and starting values of spec 7.3 and 8.5. */
export const economy = {
  /** A replay of a won level pays half the gold (spec 7.3). */
  replayGoldRatio: 0.5,
  /** First time reaching 2 and 3 stars each gives this many gems (spec 8.1). */
  starGemBonus: 25,
  /** A first-clear card unlock on an already-owned card becomes bonus shards. */
  duplicateUnlockShards: 2,
  /** Gold and gems per completed daily quest (spec 8.5). */
  questReward: { gold: 50, gems: 10 },
  /** Completing all three daily quests gives one wooden chest (spec 8.5). */
  questChest: 'wooden' as ChestId,
  /** Number of daily quests drawn each day (spec 8.5). */
  dailyQuestCount: 3,
  /** Silver-or-better chests needed to force a Legendary drop (spec 8.4 rule 6). */
  pityThreshold: 40,
  /** The cards a new player owns at level 1. The campaign unlocks the rest. */
  startingCards: ['sparkbolt_gremlin', 'pyro_fox', 'frost_witch'] as const,
  /** The welcome chest a new player can open to learn the chest screen. */
  startingChests: { wooden: 1 } as Readonly<Partial<Record<ChestId, number>>>,
} as const;

/** Which run statistic a daily quest tracks (spec 8.5). */
export type QuestMetric =
  'levelsWon' | 'combos' | 'mergesTo3' | 'trapFreeWins' | 'enemiesDefeated' | 'commonOnlyWins';

/** One quest of the daily pool (spec 8.5). */
export interface QuestDef {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly target: number;
  readonly metric: QuestMetric;
}

/** The six-quest pool of spec 8.5. */
export const questPool: readonly QuestDef[] = [
  {
    id: 'win_three',
    title: 'Hold the line',
    description: 'Win 3 levels',
    target: 3,
    metric: 'levelsWon',
  },
  {
    id: 'trigger_combos',
    title: 'Elementalist',
    description: 'Trigger 5 combos',
    target: 5,
    metric: 'combos',
  },
  {
    id: 'merge_star3',
    title: 'Perfect merge',
    description: 'Merge a defender to ★3',
    target: 1,
    metric: 'mergesTo3',
  },
  {
    id: 'trap_free_win',
    title: 'Untouched',
    description: 'Win a level without using a trap',
    target: 1,
    metric: 'trapFreeWins',
  },
  {
    id: 'defeat_enemies',
    title: 'Gloom sweeper',
    description: 'Defeat 100 enemies',
    target: 100,
    metric: 'enemiesDefeated',
  },
  {
    id: 'common_only_win',
    title: 'Common courage',
    description: 'Win a level using only Common cards',
    target: 1,
    metric: 'commonOnlyWins',
  },
];

/** Quest definitions by id. */
export const questById: Readonly<Record<string, QuestDef>> = Object.fromEntries(
  questPool.map((quest) => [quest.id, quest] as const),
);

/**
 * Shard cost to upgrade a card of `rarity` to `targetLevel` (spec 8.3): the
 * Common table times the rarity multiplier, rounded up, at least one shard.
 */
export function upgradeShardCost(rarity: Rarity, targetLevel: number): number {
  const common = upgradeShardCosts[targetLevel];
  if (common === undefined) {
    return 0;
  }
  return Math.max(1, Math.ceil(common * rarityShardMultipliers[rarity]));
}

/** Gold cost to upgrade a card to `targetLevel` (spec 8.3). */
export function upgradeGoldCost(targetLevel: number): number {
  return upgradeGoldCosts[targetLevel] ?? 0;
}
