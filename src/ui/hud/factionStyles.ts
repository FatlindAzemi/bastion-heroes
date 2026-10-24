/**
 * Placeholder colours for the greybox HUD: faction colours of spec 9.4 and rarity frame
 * colours of spec 8.2. Final card art and portraits arrive with M3 issue 3.11.
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
