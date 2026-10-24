import type { EnemyDef } from '../schemas';

/**
 * Shieldbearer (spec 6.1, 6.2). A Light body behind an Armored shield that faces
 * right: `straight` and `diagonal` projectiles hit the shield first, every other
 * damage source hits the body. When the 600-point shield breaks it drops and the
 * body continues.
 */
export const shieldbearer: EnemyDef = {
  id: 'shieldbearer',
  name: 'Shieldbearer',
  hp: 2000,
  armor: 'light',
  speed: 0.1,
  biteDamage: 50,
  biteIntervalS: 0.5,
  isFlying: false,
  special: 'directional_shield',
  shieldHp: 1200,
  shieldArmor: 'armored',
  isBoss: false,
  milestone: 'M2',
};
