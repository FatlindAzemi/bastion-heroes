import { enemyById, rules } from '../../data';
import type { DefenderDef, LevelDef } from '../../data';
import { isActiveLane, isInBounds, terrainAt } from '../grid';
import { ticksFromSeconds } from '../placement';
import type {
  DefenderState,
  EnemyState,
  EnemyStatusState,
  SimEvent,
  SimState,
  StatusKind,
} from '../types';

/** An application of one status effect (spec 4.5). */
export interface StatusApplication {
  kind: StatusKind;
  /** Duration in seconds; omitted uses the 4.5 default from the rules. */
  durationS?: number;
  /** Poison only: stacks added by this application (default 1). */
  stacks?: number;
  /** Knockback only: tiles the enemy is pushed to the right. */
  distanceTiles?: number;
}

/** The status one defender attack applies from `statusOnHit` (spec 4.5, 5.2). */
export interface AttackStatus {
  kind: StatusKind;
  durationS: number;
  stacks: number;
}

const STATUS_KINDS: readonly StatusKind[] = [
  'slow',
  'freeze',
  'burn',
  'poison',
  'stun',
  'knockback',
  'wet',
];

/** Parses a data status name; unknown names apply nothing (statusOnHit is free text in 11.5). */
function parseStatusKind(name: string): StatusKind | null {
  return (STATUS_KINDS as readonly string[]).includes(name) ? (name as StatusKind) : null;
}

/** The 4.5 default duration in seconds of a status, when the rules define one. */
function defaultDurationSeconds(kind: StatusKind): number | null {
  switch (kind) {
    case 'slow':
      return rules.status.slow.durationS;
    case 'freeze':
      return rules.status.freeze.durationS;
    case 'burn':
      return rules.status.burn.durationS;
    case 'poison':
      return rules.status.poison.durationS;
    case 'knockback':
      return rules.status.knockback.durationS;
    default:
      return null;
  }
}

/** The duration of one application in ticks (falling back to the 4.5 default). */
function durationTicksOf(kind: StatusKind, durationS: number | undefined): number {
  const seconds = durationS ?? defaultDurationSeconds(kind) ?? 0;
  return ticksFromSeconds(seconds);
}

/** Finds one active status entry, if present (spec 4.5). */
export function findStatus(enemy: EnemyState, kind: StatusKind): EnemyStatusState | undefined {
  return enemy.statuses.find((status) => status.kind === kind);
}

/** True when the status is currently active on the enemy (spec 4.5). */
export function hasStatus(enemy: EnemyState, kind: StatusKind): boolean {
  return findStatus(enemy, kind) !== undefined;
}

/** Removes one status completely (used by the Steam and Shatter combos of 4.6). */
export function removeStatus(enemy: EnemyState, kind: StatusKind): void {
  enemy.statuses = enemy.statuses.filter((status) => status.kind !== kind);
}

/** Freeze and stun stop movement and attacks (spec 4.5). */
export function isEnemyIncapacitated(enemy: EnemyState): boolean {
  return hasStatus(enemy, 'freeze') || hasStatus(enemy, 'stun');
}

/** Move speed multiplier of the enemy from its statuses (spec 4.5: Slow halves it). */
export function enemyMoveSpeedMultiplier(enemy: EnemyState): number {
  return hasStatus(enemy, 'slow') ? rules.status.slow.moveSpeedMultiplier : 1;
}

/** Attack speed multiplier of the enemy from its statuses (spec 4.5: Slow halves it). */
export function enemyAttackSpeedMultiplier(enemy: EnemyState): number {
  return hasStatus(enemy, 'slow') ? rules.status.slow.attackSpeedMultiplier : 1;
}

/** Bosses receive Slow instead of Freeze and are immune to Stun and Knockback (spec 4.5, 6.3). */
function bossAdjustedKind(kind: StatusKind, isBoss: boolean): StatusKind | null {
  if (!isBoss) {
    return kind;
  }
  if (kind === 'freeze') {
    return 'slow';
  }
  if (kind === 'stun' || kind === 'knockback') {
    return null;
  }
  return kind;
}

/**
 * Applies one status effect (spec 4.5). Durations refresh without shortening an
 * existing effect; the attack-speed half of Slow also stretches the pending bite
 * timer so the attack speed actually halves. `statusApplied` is emitted for every
 * (re)application except Knockback, whose status is not in the 11.3 event union
 * (it is an instant push, exposed through the state instead).
 */
export function applyStatus(
  tick: number,
  enemy: EnemyState,
  application: StatusApplication,
  events: SimEvent[],
): void {
  const enemyDef = enemyById[enemy.enemyId];
  if (enemyDef === undefined) {
    return;
  }
  const kind = bossAdjustedKind(application.kind, enemyDef.isBoss);
  if (kind === null || kind === 'wet') {
    // Wet is terrain-driven only (see updateStatusEffects); boss-immune statuses are ignored.
    return;
  }

  if (kind === 'poison') {
    applyPoison(tick, enemy, application);
  } else if (kind === 'burn') {
    applyBurn(tick, enemy, application);
  } else if (kind === 'knockback') {
    applyKnockback(tick, enemy, application);
  } else {
    applyTimedStatus(tick, enemy, kind, application);
  }

  if (kind !== 'knockback') {
    events.push({ type: 'statusApplied', targetId: enemy.id, status: kind });
  }
}

/** Slow, Freeze and Stun: one entry that refreshes its duration (spec 4.5). */
function applyTimedStatus(
  tick: number,
  enemy: EnemyState,
  kind: StatusKind,
  application: StatusApplication,
): void {
  const durationTicks = durationTicksOf(kind, application.durationS);
  if (durationTicks <= 0) {
    return;
  }
  const expiresAtTick = tick + durationTicks;
  const existing = findStatus(enemy, kind);
  if (existing !== undefined) {
    existing.expiresAtTick = Math.max(existing.expiresAtTick, expiresAtTick);
    return;
  }
  if (kind === 'slow' && enemy.nextBiteTick !== null) {
    // Attack speed halves: the pending bite takes twice as long (spec 4.5, 4.7).
    const remaining = enemy.nextBiteTick - tick;
    if (remaining > 0) {
      enemy.nextBiteTick = tick + Math.round(remaining / rules.status.slow.attackSpeedMultiplier);
    }
  }
  enemy.statuses.push({
    kind,
    expiresAtTick,
    nextTickAt: null,
    knockbackTilesPerTick: 0,
  });
}

/** Burn: periodic damage, no stacking, refreshing the duration (spec 4.5). */
function applyBurn(tick: number, enemy: EnemyState, application: StatusApplication): void {
  const durationTicks = durationTicksOf('burn', application.durationS);
  if (durationTicks <= 0) {
    return;
  }
  const intervalTicks = ticksFromSeconds(rules.status.burn.intervalS);
  const existing = findStatus(enemy, 'burn');
  if (existing !== undefined) {
    existing.expiresAtTick = Math.max(existing.expiresAtTick, tick + durationTicks);
    return;
  }
  enemy.statuses.push({
    kind: 'burn',
    expiresAtTick: tick + durationTicks,
    nextTickAt: tick + intervalTicks,
    knockbackTilesPerTick: 0,
  });
}

/** Poison: up to three independent stacks, each refreshing its own duration (spec 4.5). */
function applyPoison(tick: number, enemy: EnemyState, application: StatusApplication): void {
  const durationTicks = durationTicksOf('poison', application.durationS);
  if (durationTicks <= 0) {
    return;
  }
  const intervalTicks = ticksFromSeconds(rules.status.poison.intervalS);
  const currentStacks = enemy.statuses.filter((status) => status.kind === 'poison');
  const requestedStacks = Math.max(1, Math.round(application.stacks ?? 1));
  if (currentStacks.length >= rules.status.poison.maxStacks) {
    // At the stack cap the application refreshes the stack that would expire first.
    const expiringSoonest = currentStacks.reduce((first, second) =>
      first.expiresAtTick <= second.expiresAtTick ? first : second,
    );
    expiringSoonest.expiresAtTick = Math.max(expiringSoonest.expiresAtTick, tick + durationTicks);
    return;
  }
  const addedStacks = Math.min(
    requestedStacks,
    rules.status.poison.maxStacks - currentStacks.length,
  );
  for (let index = 0; index < addedStacks; index += 1) {
    enemy.statuses.push({
      kind: 'poison',
      expiresAtTick: tick + durationTicks,
      nextTickAt: tick + intervalTicks,
      knockbackTilesPerTick: 0,
    });
  }
}

/** Knockback: pushed right by the given tiles over the 4.5 duration (bosses are immune). */
function applyKnockback(tick: number, enemy: EnemyState, application: StatusApplication): void {
  const durationTicks = durationTicksOf('knockback', application.durationS);
  const distanceTiles = application.distanceTiles;
  if (durationTicks <= 0 || distanceTiles === undefined || distanceTiles <= 0) {
    return;
  }
  const knockbackTilesPerTick = distanceTiles / durationTicks;
  const existing = findStatus(enemy, 'knockback');
  if (existing !== undefined) {
    existing.expiresAtTick = tick + durationTicks;
    existing.knockbackTilesPerTick = knockbackTilesPerTick;
    return;
  }
  enemy.statuses.push({
    kind: 'knockback',
    expiresAtTick: tick + durationTicks,
    nextTickAt: null,
    knockbackTilesPerTick,
  });
}

/**
 * Returns the status of the next defender attack from `statusOnHit`, with the
 * `freezeEveryNthAttack` override (Frost Witch: every 4th attack Freezes instead
 * of Slowing, spec 5.2). Increments the per-defender attack counter when the
 * defender has any status-on-hit behaviour; returns null otherwise.
 */
export function beginDefenderAttack(
  defender: DefenderState,
  defenderDef: DefenderDef,
): AttackStatus | null {
  const statusOnHit = defenderDef.statusOnHit;
  const everyNth = defenderDef.freezeEveryNthAttack;
  if (statusOnHit === undefined && everyNth === undefined) {
    return null;
  }
  defender.attackCount += 1;
  if (statusOnHit === undefined) {
    return null;
  }
  const kind = parseStatusKind(statusOnHit.status);
  if (kind === null) {
    return null;
  }
  const freezeThisAttack =
    everyNth !== undefined && everyNth > 0 && defender.attackCount % everyNth === 0;
  return {
    kind: freezeThisAttack ? 'freeze' : kind,
    durationS: freezeThisAttack ? rules.status.freeze.durationS : statusOnHit.durationS,
    stacks: Math.max(1, Math.round(Math.abs(statusOnHit.value))),
  };
}

/** Applies the status of one defender attack to an enemy it hit (spec 4.5, 5.2). */
export function applyAttackStatus(
  tick: number,
  enemy: EnemyState,
  attackStatus: AttackStatus,
  events: SimEvent[],
): void {
  applyStatus(
    tick,
    enemy,
    {
      kind: attackStatus.kind,
      durationS: attackStatus.durationS,
      stacks: attackStatus.stacks,
    },
    events,
  );
}

/** Phase 6 (spec 11.3): ticks the periodic status damage and expires statuses (spec 4.5). */
export function updateStatusEffects(state: SimState, level: LevelDef, events: SimEvent[]): void {
  const enemies = [...state.enemies].sort((first, second) => first.id - second.id);
  for (const enemy of enemies) {
    updateWetStatus(state.tick, level, enemy, events);
    for (const status of [...enemy.statuses]) {
      tickPeriodicDamage(state.tick, enemy, status, events);
    }
    expireStatuses(state.tick, enemy);
  }
}

/** Sets/clears the terrain-driven Wet status (spec 4.5): while the enemy stands on water. */
function updateWetStatus(
  tick: number,
  level: LevelDef,
  enemy: EnemyState,
  events: SimEvent[],
): void {
  const column = Math.floor(enemy.x / rules.grid.tileSize);
  const onWater =
    isInBounds(enemy.lane, column) &&
    isActiveLane(level, enemy.lane) &&
    terrainAt(level, enemy.lane, column) === 'water';
  const wet = findStatus(enemy, 'wet');
  if (!onWater) {
    if (wet !== undefined) {
      enemy.statuses = enemy.statuses.filter((status) => status.kind !== 'wet');
    }
    return;
  }
  if (wet !== undefined) {
    wet.expiresAtTick = tick + 1;
    return;
  }
  enemy.statuses.push({
    kind: 'wet',
    expiresAtTick: tick + 1,
    nextTickAt: null,
    knockbackTilesPerTick: 0,
  });
  events.push({ type: 'statusApplied', targetId: enemy.id, status: 'wet' });
}

/** Burn and poison damage, ignoring armor (spec 4.5; the 4.1 types do not apply). */
function tickPeriodicDamage(
  tick: number,
  enemy: EnemyState,
  status: EnemyStatusState,
  events: SimEvent[],
): void {
  if (status.nextTickAt === null || tick < status.nextTickAt) {
    return;
  }
  if (status.kind === 'burn') {
    const amount = rules.status.burn.damage;
    enemy.hp -= amount;
    // Burn is Blast-typed in 4.5 but ignores the armor table.
    events.push({
      type: 'hit',
      targetId: enemy.id,
      amount,
      damageType: rules.status.burn.damageType,
      crit: false,
    });
    status.nextTickAt += ticksFromSeconds(rules.status.burn.intervalS);
  } else if (status.kind === 'poison') {
    const amount = Math.round(enemy.maxHp * rules.status.poison.maxHealthRatio);
    enemy.hp -= amount;
    // Poison has no 4.1 damage type and ignores armor; `blast` is only the display type.
    events.push({ type: 'hit', targetId: enemy.id, amount, damageType: 'blast', crit: false });
    status.nextTickAt += ticksFromSeconds(rules.status.poison.intervalS);
  }
}

/** Removes expired statuses; a Slow that ends halves the pending bite timer back (spec 4.5). */
function expireStatuses(tick: number, enemy: EnemyState): void {
  const expired: StatusKind[] = [];
  enemy.statuses = enemy.statuses.filter((status) => {
    if (status.kind === 'wet' || tick < status.expiresAtTick) {
      return true;
    }
    expired.push(status.kind);
    return false;
  });
  if (expired.includes('slow') && enemy.nextBiteTick !== null) {
    const remaining = enemy.nextBiteTick - tick;
    if (remaining > 0) {
      enemy.nextBiteTick = tick + Math.round(remaining * rules.status.slow.attackSpeedMultiplier);
    }
  }
}
