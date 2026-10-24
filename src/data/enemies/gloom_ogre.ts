import type { EnemyDef } from '../schemas';

/**
 * Gloom Ogre (spec 6.1, 6.2). Very slow Armored tank that smashes a defender for
 * 200 every 1.0 s. At 50 % health it throws one Gloomling 3 tiles forward, so it
 * lands behind the first defender of its lane.
 */
export const gloomOgre: EnemyDef = {
  id: 'gloom_ogre',
  name: 'Gloom Ogre',
  hp: 1500,
  armor: 'armored',
  speed: 0.075,
  biteDamage: 70,
  biteIntervalS: 1,
  isFlying: false,
  special: 'gloom_ogre_throw',
  throwAtHealthRatio: 0.5,
  throwEnemyId: 'gloomling',
  throwDistanceTiles: 3,
  isBoss: false,
  milestone: 'M2',
};
