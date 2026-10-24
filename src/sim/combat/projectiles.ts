import { enemyById, rules } from '../../data';
import { ENEMY_SPAWN_X } from '../grid';
import type { DefenderState, EnemyState, ProjectileState, SimEvent, SimState } from '../types';
import { applyArmorMultiplier, scaleDamage, type DamageType } from './damage';

/** Tiles a moving projectile covers per tick (spec 4.3: 6 tiles/s at 30 ticks/s). */
const PROJECTILE_TILES_PER_TICK =
  rules.combat.straightProjectileSpeedTilesPerS / rules.tick.tickRate;

/** The patterns whose projectile flies as an arc for a fixed time and then lands (spec 4.3). */
const ARC_PATTERNS = new Set<string>(['lob', 'splash']);

/** The fields of a new projectile; `spawnProjectile` adds the id, the origin x and the event. */
export interface ProjectileOptions {
  kind: string;
  lane: number;
  x: number;
  damage: number;
  damageType: DamageType;
  hitsFlying?: boolean;
  targetId?: number | null;
  landTick?: number | null;
  splashRadius?: number | null;
  targetLane?: number | null;
  switchAtX?: number | null;
}

/** Adds a projectile to the state, allocates its id and emits `projectileSpawned` (spec 11.3). */
export function spawnProjectile(
  state: SimState,
  defender: DefenderState,
  options: ProjectileOptions,
  events: SimEvent[],
): ProjectileState {
  const projectile: ProjectileState = {
    id: state.nextId,
    kind: options.kind,
    lane: options.lane,
    x: options.x,
    originX: options.x,
    sourceId: defender.id,
    damage: options.damage,
    damageType: options.damageType,
    hitsFlying: options.hitsFlying === true,
    targetId: options.targetId ?? null,
    landTick: options.landTick ?? null,
    splashRadius: options.splashRadius ?? null,
    targetLane: options.targetLane ?? null,
    switchAtX: options.switchAtX ?? null,
  };
  state.nextId += 1;
  state.projectiles.push(projectile);
  events.push({
    type: 'projectileSpawned',
    id: projectile.id,
    kind: projectile.kind,
    x: projectile.x,
    lane: projectile.lane,
  });
  return projectile;
}

/**
 * Finds the first enemy a moving projectile reaches this tick (spec 4.3). Only
 * enemies the projectile passes this tick (previousX < x <= x) count, so it never
 * hits an enemy behind the defender that fired it. Flying enemies only count when
 * the projectile has `hitsFlying` (spec 4.4 rule 4).
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
    if (enemyDef?.isFlying === true && !projectile.hitsFlying) {
      continue;
    }
    if (hit === undefined || enemy.x < hit.x || (enemy.x === hit.x && enemy.id < hit.id)) {
      hit = enemy;
    }
  }
  return hit;
}

/** Applies one rounded hit to an enemy and emits the 11.3 hit event (spec 4.2). */
function applyHit(
  enemy: EnemyState,
  projectile: ProjectileState,
  events: SimEvent[],
  ratio = 1,
): void {
  const enemyDef = enemyById[enemy.enemyId];
  if (enemyDef === undefined) {
    return;
  }
  const fullAmount = applyArmorMultiplier(projectile.damage, projectile.damageType, enemyDef.armor);
  const amount = ratio === 1 ? fullAmount : scaleDamage(fullAmount, ratio);
  enemy.hp -= amount;
  events.push({
    type: 'hit',
    targetId: enemy.id,
    amount,
    damageType: projectile.damageType,
    crit: false,
  });
}

/**
 * Lands a lob/splash arc (spec 4.3): full damage to the target and the 50 %
 * splash ratio from the rules to every other enemy inside the splash radius.
 * If the target died during the flight the arc lands without effect.
 */
function resolveArcImpact(state: SimState, projectile: ProjectileState, events: SimEvent[]): void {
  if (projectile.targetId === null) {
    return;
  }
  const target = state.enemies.find((enemy) => enemy.id === projectile.targetId);
  if (target === undefined) {
    return;
  }
  const impactX = target.x;
  applyHit(target, projectile, events);
  const splashRadius = projectile.splashRadius;
  if (splashRadius === null) {
    return;
  }
  const splashTargets = state.enemies
    .filter(
      (enemy) =>
        enemy.id !== target.id &&
        enemy.lane === projectile.lane &&
        Math.abs(enemy.x - impactX) <= splashRadius,
    )
    .sort((first, second) => first.id - second.id);
  for (const enemy of splashTargets) {
    applyHit(enemy, projectile, events, rules.combat.splashSecondaryDamageRatio);
  }
}

/** Keeps the arc's x on its target while it flies, for the renderer (spec 4.3). */
function followArcTarget(state: SimState, projectile: ProjectileState): void {
  if (projectile.targetId === null) {
    return;
  }
  const target = state.enemies.find((enemy) => enemy.id === projectile.targetId);
  if (target !== undefined) {
    projectile.x = target.x;
  }
}

/** Moves one straight/diagonal projectile and resolves the lane switch and the hit (spec 4.3). */
function updateMovingProjectile(
  state: SimState,
  projectile: ProjectileState,
  events: SimEvent[],
): boolean {
  const previousX = projectile.x;
  projectile.x += PROJECTILE_TILES_PER_TICK;
  if (
    projectile.targetLane !== null &&
    projectile.switchAtX !== null &&
    projectile.x >= projectile.switchAtX
  ) {
    projectile.lane = projectile.targetLane;
    projectile.targetLane = null;
    projectile.switchAtX = null;
  }
  const hitEnemy = findHitEnemy(state.enemies, projectile, previousX);
  if (hitEnemy !== undefined) {
    applyHit(hitEnemy, projectile, events);
    return true;
  }
  return projectile.x > ENEMY_SPAWN_X;
}

/** Phase 5 (spec 11.3): moves the projectiles and resolves their hits and landings (spec 4.3). */
export function updateProjectiles(state: SimState, events: SimEvent[]): void {
  let index = 0;
  while (index < state.projectiles.length) {
    const projectile = state.projectiles[index];
    if (projectile === undefined) {
      index += 1;
      continue;
    }

    if (ARC_PATTERNS.has(projectile.kind)) {
      if (projectile.landTick !== null && state.tick >= projectile.landTick) {
        resolveArcImpact(state, projectile, events);
        removeProjectile(state, index, projectile, events);
        continue;
      }
      followArcTarget(state, projectile);
      index += 1;
      continue;
    }

    if (updateMovingProjectile(state, projectile, events)) {
      removeProjectile(state, index, projectile, events);
      continue;
    }
    index += 1;
  }
}

/** Removes one projectile and emits `projectileEnded` (spec 11.3). */
function removeProjectile(
  state: SimState,
  index: number,
  projectile: ProjectileState,
  events: SimEvent[],
): void {
  state.projectiles.splice(index, 1);
  events.push({ type: 'projectileEnded', id: projectile.id });
}
