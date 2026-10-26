/**
 * Card upgrades of spec 8.3: shard + gold costs, the level cap and the one pure
 * transaction that spends both. The collection screen reads `cardUpgradeView`
 * and calls `upgradeCard`; all numbers come from `src/data/economy.ts`.
 */
import { defenderById } from '../data';
import { MAX_CARD_LEVEL, upgradeGoldCost, upgradeShardCost } from '../data/economy';
import { cloneSave, type SaveData } from './save';

/** Why an upgrade did or did not happen. */
export type UpgradeResult = 'ok' | 'maxed' | 'locked' | 'notEnoughShards' | 'notEnoughGold';

/** The upgrade state of one card as the collection detail shows it. */
export interface CardUpgradeView {
  readonly defenderId: string;
  readonly level: number;
  readonly maxed: boolean;
  readonly shards: number;
  readonly shardsNeeded: number;
  readonly goldCost: number;
  readonly canUpgrade: boolean;
}

/** Reads the upgrade state of an owned card; null for a locked or unknown card. */
export function cardUpgradeView(save: SaveData, defenderId: string): CardUpgradeView | null {
  const card = save.cards[defenderId];
  const definition = defenderById[defenderId];
  if (card === undefined || definition === undefined) {
    return null;
  }
  const maxed = card.level >= MAX_CARD_LEVEL;
  const shardsNeeded = maxed ? 0 : upgradeShardCost(definition.rarity, card.level + 1);
  const goldCost = maxed ? 0 : upgradeGoldCost(card.level + 1);
  return {
    defenderId,
    level: card.level,
    maxed,
    shards: card.shards,
    shardsNeeded,
    goldCost,
    canUpgrade: !maxed && card.shards >= shardsNeeded && save.gold >= goldCost,
  };
}

/** Spends shards and gold to raise one card by one level. */
export function upgradeCard(
  save: SaveData,
  defenderId: string,
): { readonly save: SaveData; readonly result: UpgradeResult } {
  const view = cardUpgradeView(save, defenderId);
  if (view === null) {
    return { save, result: 'locked' };
  }
  if (view.maxed) {
    return { save, result: 'maxed' };
  }
  if (view.shards < view.shardsNeeded) {
    return { save, result: 'notEnoughShards' };
  }
  if (save.gold < view.goldCost) {
    return { save, result: 'notEnoughGold' };
  }
  const next = cloneSave(save);
  next.gold -= view.goldCost;
  next.cards[defenderId] = {
    level: view.level + 1,
    shards: view.shards - view.shardsNeeded,
  };
  return { save: next, result: 'ok' };
}
