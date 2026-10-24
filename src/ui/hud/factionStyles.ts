/**
 * Faction colours of spec 9.4 and rarity colours of spec 8.2 for the card and HUD
 * visuals (issue #76). Final card art is the M3 portrait set of issue #66.
 */
const FACTION_COLORS: Readonly<Record<string, string>> = {
  forge: '#c8743a',
  wildgrove: '#5fbf4a',
  neon: '#22d3ee',
  frost: '#9be7ff',
  hollow: '#efe6d2',
};

const FALLBACK_FACTION_COLOR = '#8a9ba8';

const RARITY_COLORS: Readonly<Record<string, string>> = {
  common: '#6fa8dc',
  rare: '#f6a13a',
  epic: '#a64dff',
  legendary: '#ffd54a',
  mythic: '#c99a2e',
};

const FALLBACK_RARITY_COLOR = '#6fa8dc';

/** Returns the greybox portrait colour of a faction (spec 9.4). */
export function factionColor(faction: string): string {
  return FACTION_COLORS[faction] ?? FALLBACK_FACTION_COLOR;
}

/** Returns the card frame colour of a rarity (spec 8.2). */
export function rarityColor(rarity: string): string {
  return RARITY_COLORS[rarity] ?? FALLBACK_RARITY_COLOR;
}

/**
 * Card gradient in the rarity colour (spec 9.8 card visual): the rarity colour
 * fades into the dark UI shadow behind the portrait.
 */
export function rarityGradient(rarity: string): string {
  const color = rarityColor(rarity);
  return `linear-gradient(160deg, ${color} 0%, ${color}66 42%, #1b1b2f 100%)`;
}
