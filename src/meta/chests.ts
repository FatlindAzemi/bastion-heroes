/**
 * Local chest opening of spec 8.4: seeded rarity rolls, the shard share per
 * stack, card unlocks for new heroes and the 40-chest Legendary pity. One pure
 * transaction consumes a chest, updates the save and returns the flip results
 * the chest screen animates.
 */
import { defenders } from '../data';
import {
  RARITY_ORDER,
  chestById,
  chestShardDivisors,
  economy,
  type ChestDef,
  type ChestId,
  type Rarity,
} from '../data/economy';
import type { DefenderDef } from '../data/schemas';
import { createMetaRng } from './rng';
import { cloneSave, type SaveData } from './save';

/** One card stack that flies out of an opened chest. */
export interface ChestOpenStack {
  readonly cardId: string;
  readonly rarity: Rarity;
  readonly shards: number;
  /** True when this stack unlocked a card the player did not own before. */
  readonly isNew: boolean;
}

/** Why a gem chest purchase did or did not happen. */
export type ChestPurchaseResult = 'ok' | 'notForSale' | 'notEnoughGems';

/** The full result of one chest opening. */
export interface ChestOpenResult {
  readonly chestId: ChestId;
  readonly name: string;
  readonly gold: number;
  readonly stacks: readonly ChestOpenStack[];
  /** True when the pity counter forced the guaranteed Legendary stack. */
  readonly pityForced: boolean;
  readonly pityAfter: number;
}

/** Cumulative rarity roll against the published odds (exported for the odds test). */
export function rollRarity(odds: ChestDef['odds'], random: () => number): Rarity {
  const roll = random();
  let cumulative = 0;
  for (const rarity of RARITY_ORDER) {
    cumulative += odds[rarity];
    if (roll < cumulative) {
      return rarity;
    }
  }
  return 'common';
}

/** All cards of one rarity, used for the uniform pick of spec 8.4 rule 3. */
function cardsOfRarity(rarity: Rarity): readonly DefenderDef[] {
  return defenders.filter((defender) => defender.rarity === rarity);
}

/** Falls back to the next lower rarity when the M2 roster has no card of that rarity. */
function resolveCardPool(rarity: Rarity): {
  readonly rarity: Rarity;
  readonly pool: readonly DefenderDef[];
} {
  const start = RARITY_ORDER.indexOf(rarity);
  for (let index = start; index < RARITY_ORDER.length; index += 1) {
    const candidate = RARITY_ORDER[index];
    if (candidate === undefined) {
      continue;
    }
    const pool = cardsOfRarity(candidate);
    if (pool.length > 0) {
      return { rarity: candidate, pool };
    }
  }
  return { rarity, pool: defenders };
}

/** The shard share of one stack (spec 8.4 rule 4). */
function shardsForStack(
  totalBudget: number,
  stackIndex: number,
  stacks: number,
  rarity: Rarity,
): number {
  const base = Math.floor(totalBudget / stacks);
  const remainder = totalBudget - base * stacks;
  const share = base + (stackIndex < remainder ? 1 : 0);
  return Math.max(1, Math.floor(share / chestShardDivisors[rarity]));
}

/** Picks one card uniformly from the resolved pool. */
function pickCard(pool: readonly DefenderDef[], random: () => number): DefenderDef {
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index] ?? defenders[0]!;
}

/** True for a chest that advances/resets the pity counter (silver or better). */
function isPityChest(chestId: ChestId): boolean {
  return chestId !== 'wooden';
}

/**
 * Buys a gem-priced chest (Magic or Legendary, spec 8.4 / 8.8) and adds it to the
 * inventory. Wooden, Silver and Gold chests are campaign rewards and not for sale.
 */
export function buyChest(
  save: SaveData,
  chestId: ChestId,
): { readonly save: SaveData; readonly result: ChestPurchaseResult } {
  const definition = chestById[chestId];
  if (definition?.gemPrice === undefined) {
    return { save, result: 'notForSale' };
  }
  if (save.gems < definition.gemPrice) {
    return { save, result: 'notEnoughGems' };
  }
  const next = cloneSave(save);
  next.gems -= definition.gemPrice;
  next.chests[chestId] = (next.chests[chestId] ?? 0) + 1;
  return { save: next, result: 'ok' };
}

/**
 * Opens one chest from the inventory. Returns null when the player has none.
 * `seed` makes the roll deterministic for tests; the game passes Date.now().
 */
export function openChest(
  save: SaveData,
  chestId: ChestId,
  seed: number,
): { readonly save: SaveData; readonly result: ChestOpenResult } | null {
  const definition = chestById[chestId];
  const owned = save.chests[chestId] ?? 0;
  if (definition === undefined || owned <= 0) {
    return null;
  }
  const random = createMetaRng(seed);
  const next = cloneSave(save);
  next.chests[chestId] = owned - 1;
  const pityEligible = isPityChest(chestId);
  const pityForced = pityEligible && next.pity.sinceLegendary + 1 >= economy.pityThreshold;
  const stackCount =
    definition.stacks[0] + Math.floor(random() * (definition.stacks[1] - definition.stacks[0] + 1));
  const stacks: ChestOpenStack[] = [];
  let legendaryFound = pityForced;

  for (let index = 0; index < stackCount; index += 1) {
    const forced = pityForced && index === 0;
    const rolled = forced ? 'legendary' : rollRarity(definition.odds, random);
    const resolved = resolveCardPool(rolled);
    const card = pickCard(resolved.pool, random);
    const rolledShards = shardsForStack(definition.shardBudget, index, stackCount, resolved.rarity);
    const owner = next.cards[card.id];
    let shards = rolledShards;
    let isNew = false;
    if (owner === undefined) {
      isNew = true;
      shards = Math.max(0, rolledShards - 1);
      next.cards[card.id] = { level: 1, shards };
    } else {
      owner.shards += rolledShards;
    }
    if (resolved.rarity === 'legendary' || resolved.rarity === 'mythic') {
      legendaryFound = true;
    }
    stacks.push({ cardId: card.id, rarity: resolved.rarity, shards, isNew });
  }

  next.gold += definition.gold;
  next.pity.sinceLegendary = legendaryFound
    ? 0
    : pityEligible
      ? next.pity.sinceLegendary + 1
      : next.pity.sinceLegendary;

  return {
    save: next,
    result: {
      chestId,
      name: definition.name,
      gold: definition.gold,
      stacks,
      pityForced,
      pityAfter: next.pity.sinceLegendary,
    },
  };
}
