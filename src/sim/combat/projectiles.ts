import { enemyById, rules } from '../../data';
import { ENEMY_SPAWN_X } from '../grid';
import type { EnemyState, ProjectileState, SimEvent, SimState } from '../types';
import { applyArmorMultiplier } from './damage';

/** Tiles a straight projectile moves per tick (spec 4.3: 6 tiles/s at 30 ticks/s). */
const STRAIGHT_PROJECTILE_TILES_PER_TICK =
  rules.combat.straightProjectileSpeedTilesPerS / rules.tick.tickRate;

/**
 * Finds the first non-flying enemy a projectile reaches in its lane (spec 4.3).
 * Only enemies the projectile passes this tick (previousX < x <= x) count, so a
 * projectile never hits an enemy that is behind the defender that fired it.
 * Ties go to the enemy that spawned first.
 */
function findHitEnemy(
  enemies: readonly EnemyState[],
  projectile: ProjectileState,
  previousX: number,
): EnemyState | undefined {
  let hit: EnemyState | undefined;
  for (const enemy of enemies) {
    if (enemy.lane !== projectile.lane || enemy.x > projectile.x || enemy.x <= previousX) {
      continue;
    }
    const enemyDef = enemyById[enemy.enemyId];
    if (enemyDef?.isFlying === true) {
      continue;
    }
    if (hit === undefined || enemy.x < hit.x || (enemy.x === hit.x && enemy.id < hit.id)) {
      hit = enemy;
    }
  }
  return hit;
}

/** Phase 5 (spec 11.3): moves every projectile right and resolves its first hit (spec 4.3). */
export function updateProjectiles(state: SimState, events: SimEvent[]): void {
  let index = 0;
  while (index < state.projectiles.length) {
    const projectile = state.projectiles[index];
    if (projectile === undefined) {
      index += 1;
      continue;
    }
    const previousX = projectile.x;
    projectile.x += STRAIGHT_PROJECTILE_TILES_PER_TICK;

    const hitEnemy = findHitEnemy(state.enemies, projectile, previousX);
    if (hitEnemy !== undefined) {
      const enemyDef = enemyById[hitEnemy.enemyId];
      if (enemyDef !== undefined) {
        const amount = applyArmorMultiplier(
          projectile.damage,
          projectile.damageType,
          enemyDef.armor,
        );
        hitEnemy.hp -= amount;
        events.push({
          type: 'hit',
          targetId: hitEnemy.id,
          amount,
          damageType: projectile.damageType,
          crit: false,
        });
      }
      state.projectiles.splice(index, 1);
      events.push({ type: 'projectileEnded', id: projectile.id });
      continue;
    }

    if (projectile.x > ENEMY_SPAWN_X) {
      state.projectiles.splice(index, 1);
      events.push({ type: 'projectileEnded', id: projectile.id });
      continue;
    }
    index += 1;
  }
}
