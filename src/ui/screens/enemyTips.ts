/**
 * Short scouting tips for the Scout screen (spec 3.12 rule 1, issue #49). They
 * paraphrase the behavior and counter column of spec 6.2 and deliberately name
 * no game numbers (health, damage, shield values), so the screen can never
 * disagree with the balance data.
 */

const ENEMY_TIPS: Readonly<Record<string, string>> = {
  gloomling: 'The baseline walker. Any damage type works.',
  pothead: 'Armored pot. Pierce is weak against it; Blast hurts it.',
  shieldbearer: 'Front shots bounce off the shield. Lob, splash and beams hit the body.',
  shade_wisp: 'Spectral. Blast is weak against it; Arcane is strong.',
  bat_swarm: 'Flies over ground defenders and walls. Bring anti-air.',
  gloom_priest: 'Heals the enemies around it. Burst it down or focus it first.',
  gloom_ogre: 'Armored tank that smashes walls and throws Gloomlings. Slow it and bring Blast.',
  burrower: 'Digs underground and cannot be hit until it surfaces near the base.',
  shadow_hound: 'Fast and jumps over the first defender. Slow it or use two rows.',
  morvak: 'Armored boss with three phases. Bring a full, mixed loadout.',
};

/** Fallback for an enemy id without a tip yet (future worlds, spec 7.4). */
const FALLBACK_TIP = 'No scouting tip yet. Watch it in battle.';

/** Returns the short scouting tip of an enemy id (spec 6.2). */
export function enemyTip(enemyId: string): string {
  return ENEMY_TIPS[enemyId] ?? FALLBACK_TIP;
}
