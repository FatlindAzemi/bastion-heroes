import { enemyById, rules } from '../../data';
import { ticksFromSeconds } from '../placement';
import type { ComboId, ElementKind, EnemyState, SimEvent, SimState } from '../types';
import { applyArmorMultiplier, type DamageType } from './damage';
import { applyStatus, hasStatus, removeStatus } from './status';

/** Distance between two enemies in tile units (x along the lane, lane across; spec 3.1). */
function distanceBetween(first: EnemyState, second: EnemyState): number {
  return Math.hypot(first.x - second.x, first.lane - second.lane);
}

/** The enemies within `radiusTiles` of the target, in id order (spec 4.6). */
function enemiesWithin(state: SimState, target: EnemyState, radiusTiles: number): EnemyState[] {
  return state.enemies
    .filter((enemy) => distanceBetween(enemy, target) <= radiusTiles)
    .sort((first, second) => first.id - second.id);
}

/** True when the per-enemy per-combo cooldown allows another trigger (spec 4.6: 2.0 s). */
function canTrigger(target: EnemyState, combo: ComboId, tick: number): boolean {
  return tick >= target.comboCooldowns[combo];
}

/** Marks the combo as triggered for this enemy and emits the `combo` event (spec 11.3, 4.6). */
function markTriggered(target: EnemyState, combo: ComboId, tick: number, events: SimEvent[]): void {
  target.comboCooldowns[combo] = tick + ticksFromSeconds(rules.combos.sameComboCooldownS);
  events.push({ type: 'combo', combo, x: target.x, lane: target.lane });
}

/** Applies combo damage with the 4.2 armor multiplier and emits the hit event (spec 4.6). */
function applyComboDamage(
  enemy: EnemyState,
  amount: number,
  damageType: DamageType,
  events: SimEvent[],
): void {
  const enemyDef = enemyById[enemy.enemyId];
  if (enemyDef === undefined) {
    return;
  }
  const finalAmount = applyArmorMultiplier(amount, damageType, enemyDef.armor);
  enemy.hp -= finalAmount;
  events.push({ type: 'hit', targetId: enemy.id, amount: finalAmount, damageType, crit: false });
}

/**
 * Shatter (spec 4.6): Pierce damage on a Frozen enemy doubles that hit and ends
 * the Freeze. Called before the base hit damage is applied, so the order is
 * "Freeze ends, then the doubled hit lands". Returns the hit multiplier (1 or 2).
 */
export function applyShatter(
  tick: number,
  damageType: DamageType,
  target: EnemyState,
  events: SimEvent[],
): number {
  if (
    damageType !== 'pierce' ||
    !hasStatus(target, 'freeze') ||
    !canTrigger(target, 'shatter', tick)
  ) {
    return 1;
  }
  markTriggered(target, 'shatter', tick, events);
  removeStatus(target, 'freeze');
  return rules.combos.shatter.damageMultiplier;
}

/**
 * Steam Burst (spec 4.6): a fire attack on a Slowed/Frozen enemy removes both,
 * deals its Blast burst to every enemy within the radius and stuns them.
 */
function applySteam(
  state: SimState,
  tick: number,
  element: ElementKind,
  target: EnemyState,
  events: SimEvent[],
): void {
  if (element !== 'fire' || (!hasStatus(target, 'slow') && !hasStatus(target, 'freeze'))) {
    return;
  }
  if (!canTrigger(target, 'steam', tick)) {
    return;
  }
  markTriggered(target, 'steam', tick, events);
  removeStatus(target, 'slow');
  removeStatus(target, 'freeze');

  const steam = rules.combos.steam;
  for (const enemy of enemiesWithin(state, target, steam.radiusTiles)) {
    applyComboDamage(enemy, steam.burstDamage, steam.burstDamageType, events);
    applyStatus(tick, enemy, { kind: 'stun', durationS: steam.stunDurationS }, events);
  }
}

/** Toxic Spread (spec 4.6): Blast damage on a Poisoned enemy gives all enemies in the radius a stack. */
function applyToxic(
  state: SimState,
  tick: number,
  damageType: DamageType,
  target: EnemyState,
  events: SimEvent[],
): void {
  if (
    damageType !== 'blast' ||
    !hasStatus(target, 'poison') ||
    !canTrigger(target, 'toxic', tick)
  ) {
    return;
  }
  markTriggered(target, 'toxic', tick, events);
  const toxic = rules.combos.toxic;
  for (const enemy of enemiesWithin(state, target, toxic.radiusTiles)) {
    applyStatus(tick, enemy, { kind: 'poison', stacks: toxic.poisonStacks }, events);
  }
}

/** Chain Shock (spec 4.6): a storm attack on a Wet enemy jumps damage to the other Wet enemies. */
function applyChain(
  state: SimState,
  tick: number,
  element: ElementKind,
  target: EnemyState,
  events: SimEvent[],
): void {
  if (element !== 'storm' || !hasStatus(target, 'wet') || !canTrigger(target, 'chain', tick)) {
    return;
  }
  markTriggered(target, 'chain', tick, events);
  const chain = rules.combos.chain;
  const otherWetEnemies = enemiesWithin(state, target, chain.radiusTiles).filter(
    (enemy) => enemy.id !== target.id && hasStatus(enemy, 'wet'),
  );
  for (const enemy of otherWetEnemies) {
    applyComboDamage(enemy, chain.jumpDamage, chain.jumpDamageType, events);
  }
}

/**
 * The after-hit combos of spec 4.6 (Steam, Toxic, Chain). Called once per enemy
 * a hit damaged, after the base damage and the defender's statusOnHit landed.
 * Each combo is gated by the enemy's own 2.0 s per-combo cooldown. Combo damage
 * never re-triggers combos and statuses applied by a combo never trigger one
 * either, so there is no recursion.
 */
export function applyAfterHitCombos(
  state: SimState,
  tick: number,
  element: ElementKind,
  damageType: DamageType,
  target: EnemyState,
  events: SimEvent[],
): void {
  applySteam(state, tick, element, target, events);
  applyToxic(state, tick, damageType, target, events);
  applyChain(state, tick, element, target, events);
}
