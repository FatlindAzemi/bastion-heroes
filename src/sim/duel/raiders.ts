import { duelRules, enemyById } from '../../data';
import type { EnemyDef } from '../../data';
import {
  biteDefender,
  findBlockingDefender,
  updateKnockback,
  walkForward,
} from '../combat/enemyActions';
import { enemyAttackSpeedMultiplier, hasStatus, isEnemyIncapacitated } from '../combat/status';
import { updateEnemySpecial } from '../enemies/dispatch';
import { ticksFromSeconds } from '../time';
import type { DefenderState, SimEvent } from '../types';
import type { DuelEventLog } from './events';
import { updateSummons } from './summons';
import type { DuelRaiderState, DuelState } from './types';

/** A raider that acts this tick, with its section 6 definition. */
interface ActingRaider {
  raider: DuelRaiderState;
  def: EnemyDef;
}

/** What one raider does in this tick; decided for all raiders before any of them acts. */
type RaiderAction =
  | { kind: 'knockback' }
  | { kind: 'idle' }
  | { kind: 'walk' }
  | { kind: 'fight'; opponent: DuelRaiderState }
  | { kind: 'eat'; defender: DefenderState };

/** True when the raider stands on the ground and is alive, so it blocks enemy ground raiders. */
function isLivingGroundRaider(raider: DuelRaiderState): boolean {
  return raider.hp > 0 && enemyById[raider.enemyId]?.isFlying !== true;
}

/**
 * Finds the enemy ground raider this ground raider fights (spec 18.6): same lane,
 * other side, within the raider block distance in either direction. The nearest
 * one wins, the smallest id on a tie. The rule is symmetric, so two raiders
 * always block each other on the same tick.
 */
export function findOpposingRaider(
  state: Readonly<DuelState>,
  raider: DuelRaiderState,
): DuelRaiderState | undefined {
  let opponent: DuelRaiderState | undefined;
  let opponentDistance = Infinity;
  for (const other of state.enemies) {
    if (other.side === raider.side || other.lane !== raider.lane || !isLivingGroundRaider(other)) {
      continue;
    }
    const distance = Math.abs(other.x - raider.x);
    if (distance > duelRules.raiders.raiderBlockDistance) {
      continue;
    }
    const isNearer =
      opponent === undefined ||
      distance < opponentDistance ||
      (distance === opponentDistance && other.id < opponent.id);
    if (isNearer) {
      opponent = other;
      opponentDistance = distance;
    }
  }
  return opponent;
}

/**
 * Decides what a raider does this tick from the positions at the start of the
 * raider phase (spec 18.6, 3.8, 4.5). Knockback and Freeze/Stun come first.
 * Flying raiders are never blocked and never fight. A ground raider fights an
 * enemy ground raider in reach before it eats a defender, because two raiders
 * that meet "fight until one dies"; otherwise an enemy ground defender blocks it.
 */
function planRaiderAction(state: DuelState, { raider, def }: ActingRaider): RaiderAction {
  if (hasStatus(raider, 'knockback')) {
    return { kind: 'knockback' };
  }
  if (isEnemyIncapacitated(raider)) {
    return { kind: 'idle' };
  }
  if (def.isFlying) {
    return { kind: 'walk' };
  }
  const opponent = findOpposingRaider(state, raider);
  if (opponent !== undefined) {
    return { kind: 'fight', opponent };
  }
  const defender = findBlockingDefender(state, raider);
  return defender === undefined ? { kind: 'walk' } : { kind: 'eat', defender };
}

/**
 * True when a blocked raider attacks on this tick (spec 4.7): immediately when it
 * gets blocked, then every attack interval; Slow makes the interval longer (4.5).
 * A raider without an attack never does.
 */
function isAttackDue(state: DuelState, { raider, def }: ActingRaider): boolean {
  if (def.biteIntervalS === undefined || def.biteDamage <= 0) {
    return false;
  }
  if (raider.nextBiteTick !== null && state.tick < raider.nextBiteTick) {
    return false;
  }
  const intervalS = def.biteIntervalS / enemyAttackSpeedMultiplier(raider);
  raider.nextBiteTick = state.tick + ticksFromSeconds(intervalS);
  return true;
}

/**
 * Hits an enemy raider with the attack damage (spec 18.6). Raider attacks ignore
 * the 4.1 table and, as melee, hit the body behind a shield directly (spec 6.2).
 * Like a bite it emits the untyped `attack` event.
 */
function hitRaider(acting: ActingRaider, opponent: DuelRaiderState, events: SimEvent[]): void {
  opponent.hp -= acting.def.biteDamage * duelRules.raiders.attackDamageMultiplier;
  events.push({ type: 'attack', sourceId: acting.raider.id, targetId: opponent.id });
}

/** Carries out the planned action of one raider. */
function applyRaiderAction(
  state: DuelState,
  acting: ActingRaider,
  action: RaiderAction,
  events: SimEvent[],
): void {
  const { raider, def } = acting;
  switch (action.kind) {
    case 'knockback':
      updateKnockback(raider);
      return;
    case 'idle':
      // Frozen or stunned: no movement and no attacks (spec 4.5).
      return;
    case 'walk':
      raider.blockedByEnemyId = null;
      walkForward(raider, def.speed * duelRules.raiders.speedMultiplier);
      return;
    case 'fight':
      raider.blockedByDefenderId = null;
      raider.blockedByEnemyId = action.opponent.id;
      if (isAttackDue(state, acting)) {
        hitRaider(acting, action.opponent, events);
      }
      return;
    case 'eat':
      raider.blockedByEnemyId = null;
      raider.blockedByDefenderId = action.defender.id;
      if (isAttackDue(state, acting)) {
        biteDefender(raider, action.defender, events, duelRules.raiders.attackDamageMultiplier);
      }
      return;
  }
}

/** The living active raiders of both sides with their definitions, sorted by id. */
function actingRaiders(state: DuelState): ActingRaider[] {
  const acting: ActingRaider[] = [];
  for (const raider of [...state.enemies].sort((first, second) => first.id - second.id)) {
    const def = enemyById[raider.enemyId];
    // A raider that died earlier in this tick no longer acts; it is removed in step 7.
    if (def !== undefined && raider.hp > 0) {
      acting.push({ raider, def });
    }
  }
  return acting;
}

/**
 * Tick step 6 (spec 19.11): raiders are summoned, then move, block and fight,
 * sorted by id (spec 18.5, 18.6).
 *
 * The section 6 specials tick first (priest heal, ogre throw, pot), also while a
 * raider is blocked or frozen. Then every raider's action is decided from the
 * same positions before any raider moves or attacks, so the result does not
 * depend on which side owns the smaller ids: two raiders that meet block each
 * other on the same tick and their hits land together. A raider thrown by an
 * ogre acts from the next tick on.
 */
export function updateRaiders(state: DuelState, log: DuelEventLog): void {
  updateSummons(state, log);
  const acting = actingRaiders(state);
  log.emitShared((events) => {
    for (const { raider, def } of acting) {
      updateEnemySpecial(state, raider, def, events);
    }
  });
  const actions = acting.map((entry) => planRaiderAction(state, entry));
  log.emitShared((events) => {
    acting.forEach((entry, index) => {
      const action = actions[index];
      if (action !== undefined) {
        applyRaiderAction(state, entry, action, events);
      }
    });
  });
}
