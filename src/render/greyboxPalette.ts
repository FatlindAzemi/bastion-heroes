import { defenderById, enemyById } from '../data';
import type { DefenderDef, EnemyDef } from '../data';

/**
 * Greybox colours from the spec 9.4 palette. Unit colours are derived from the data
 * layer (`defenderById` / `enemyById`) so every id keeps one stable colour; the final
 * per-character palette textures arrive with the models in M3 (issues 3.4-3.7).
 */
export const GREYBOX_COLORS = {
  sky: 0x9fd8ff,
  grassLight: 0x7ed957,
  grassDark: 0x6cc644,
  dirt: 0xd9a066,
  stone: 0x8a9ba8,
  stoneDark: 0x6b7b88,
  wood: 0x6f4526,
  moss: 0x2e7d32,
  bone: 0xefe6d2,
  violet: 0x7c4dff,
  gloom: 0x2b1b3d,
  gloomPurple: 0x4a2f66,
  eyeGlow: 0x3cf2ff,
  teal: 0x3bf0c8,
  white: 0xf4fbff,
  pierce: 0x22d3ee,
  blast: 0xff8a2b,
  arcane: 0x7c4dff,
} as const;

/** One tile of a faction palette: main, accent and extra colour of spec 9.4. */
type FactionPalette = readonly [number, number, number];

/** Faction palettes of spec 9.4: main, accent and extra colours. */
const FACTION_PALETTES: Readonly<Record<DefenderDef['faction'], FactionPalette>> = {
  forge: [0xc8743a, 0xff8a2b, 0x8a9ba8], // Copper, orange, steel
  wildgrove: [0x5fbf4a, 0xe5483b, 0x2e7d32], // Leaf green, mushroom red, moss
  neon: [0x22d3ee, 0xe040fb, 0x7c4dff], // Cyan, magenta, violet
  frost: [0x9be7ff, 0xf4fbff, 0x2f6fdb], // Ice blue, snow white, deep blue
  hollow: [0xefe6d2, 0x6a3fa0, 0x7cff6b], // Bone, royal purple, soul green
};

/**
 * Greybox palette slot per rarity: common units use the faction main colour, rare units
 * the neutral extra colour and epic units the loud accent colour. Final models replace
 * this with their own palette textures in M3.
 */
const RARITY_PALETTE_SLOTS: Readonly<Record<DefenderDef['rarity'], 0 | 1 | 2>> = {
  common: 0,
  rare: 2,
  epic: 1,
  legendary: 0,
  mythic: 1,
};

/** Body colours of the Gloom by armor type, from the dark purples of spec 9.4. */
const ARMOR_COLORS: Readonly<Record<EnemyDef['armor'], number>> = {
  light: 0x4a2f66, // Dusk purple
  armored: 0x2b1b3d, // Shadow
  spectral: 0x7c4dff, // Violet placeholder until the M3 spectral model
};

/** Returns the greybox body colour of a defender id (spec 9.4 faction palette). */
export function defenderColor(defenderId: string): number {
  const defender = defenderById[defenderId];
  if (defender === undefined) {
    return GREYBOX_COLORS.bone;
  }
  return FACTION_PALETTES[defender.faction][RARITY_PALETTE_SLOTS[defender.rarity]];
}

/** Returns the greybox body colour of an enemy id (spec 9.4 "The Gloom"). */
export function enemyColor(enemyId: string): number {
  const enemy = enemyById[enemyId];
  if (enemy === undefined) {
    return GREYBOX_COLORS.gloom;
  }
  return ARMOR_COLORS[enemy.armor];
}

/**
 * Returns the greybox colour of a projectile from its kind string (spec 4.1 damage
 * types). Final projectile VFX arrive with the art pass in M3 (spec 9.7).
 */
export function projectileColor(kind: string): number {
  if (/(bolt|arrow|pierce|dart|spark)/.test(kind)) {
    return GREYBOX_COLORS.pierce;
  }
  if (/(flask|bomb|blast|lob|splash)/.test(kind)) {
    return GREYBOX_COLORS.blast;
  }
  if (/(rune|beam|arcane|frost)/.test(kind)) {
    return GREYBOX_COLORS.arcane;
  }
  return GREYBOX_COLORS.bone;
}
