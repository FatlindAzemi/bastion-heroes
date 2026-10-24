import type { EnemyDef } from '../../data';
import { applyArmorMultiplier } from '../combat/damage';
import type { EnemyState, ProjectileState, SimEvent } from '../types';

/** Projectile kinds that hit the right-facing shield first (spec 6.2). */
const SHIELD_BLOCKING_PROJECTILES = new Set<string>(['straight', 'diagonal']);

/** True when this projectile hits the shield instead of the body (spec 6.2 Shieldbearer). */
export function shieldBlocksProjectile(projectile: Pick<ProjectileState, 'kind'>): boolean {
  return SHIELD_BLOCKING_PROJECTILES.has(projectile.kind);
}

/** True when the enemy still has a shield from its data (spec 6.2 Shieldbearer). */
export function hasShield(enemy: EnemyState, enemyDef: EnemyDef): boolean {
  return enemy.shieldHp > 0 && enemyDef.shieldHp !== undefined;
}

/**
 * Applies one projectile hit to a shield (spec 6.2): the shield takes the
 * damage with its own armor type, overflow is lost, and the body, its statuses
 * and the combos stay untouched. The shield drops harmlessly at 0.
 */
export function absorbShieldHit(
  enemy: EnemyState,
  enemyDef: EnemyDef,
  projectile: ProjectileState,
  events: SimEvent[],
): void {
  const shieldArmor = enemyDef.shieldArmor ?? enemyDef.armor;
  const amount = applyArmorMultiplier(projectile.damage, projectile.damageType, shieldArmor);
  enemy.shieldHp = Math.max(0, enemy.shieldHp - amount);
  events.push({
    type: 'hit',
    targetId: enemy.id,
    amount,
    damageType: projectile.damageType,
    crit: false,
  });
}
