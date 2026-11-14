import {
  defenderSnapshot,
  enemySnapshot,
  firePatchSnapshot,
  fnv1a,
  projectileSnapshot,
} from '../hash';
import { DUEL_SIDES } from './sides';
import type { DuelRaiderState, DuelSideState, DuelState, DuelSummonState } from './types';

/**
 * The stable Duel state hash (spec 11.6, 19.4): the value clients send every 30
 * ticks and the golden Duel replays compare.
 *
 * Same algorithm as the campaign `hashState`: FNV-1a (32 bit) over the JSON of an
 * explicitly canonicalised snapshot. Every mutable field of `DuelState` is listed
 * in a fixed order (the unit fields are shared with the campaign hash, plus the
 * owning side), so the hash never depends on object key order. Only the `next()`
 * method of the rng is left out; its `state` is included. The state holds only
 * public information (spec 19.3), so hands and private seeds never reach the hash.
 *
 * Any rules or data change alters these hashes; the golden replays in
 * `tests/sim/duel/replays/` are regenerated only in the pull request that causes
 * it, with the reason stated in the PR (spec 11.6).
 *
 * Returns 8 lowercase hex characters.
 */
export function hashDuelState(state: Readonly<DuelState>): string {
  return fnv1a(JSON.stringify(duelSnapshot(state)));
}

/** The canonical snapshot of a Duel state in a fixed field order. */
function duelSnapshot(state: Readonly<DuelState>): unknown {
  return {
    seed: state.seed,
    tick: state.tick,
    rngState: state.rng.state,
    nextId: state.nextId,
    phase: state.phase,
    phaseEndTick: state.phaseEndTick,
    incomeIntervalTicks: state.incomeIntervalTicks,
    nextIncomeTick: state.nextIncomeTick,
    sides: DUEL_SIDES.map((side) => sideSnapshot(state.sides[side])),
    defenders: state.defenders.map((defender) => [defender.side, ...defenderSnapshot(defender)]),
    enemies: state.enemies.map(raiderSnapshot),
    summons: state.summons.map(summonSnapshot),
    projectiles: state.projectiles.map((projectile) => [
      projectile.side ?? null,
      ...projectileSnapshot(projectile),
    ]),
    firePatches: state.firePatches.map((patch) => [
      patch.side ?? null,
      ...firePatchSnapshot(patch),
    ]),
    result: state.result === null ? null : [state.result.winner, state.result.reason],
  };
}

/** Essence, gate and traps of one player (spec 19.3). */
function sideSnapshot(side: Readonly<DuelSideState>): unknown[] {
  return [side.essence, side.gateHealth, side.traps.map((trap) => [trap.used, trap.rollerX])];
}

/** A raider: its side, the raider that blocks it (spec 18.6) and the campaign enemy fields. */
function raiderSnapshot(raider: Readonly<DuelRaiderState>): unknown[] {
  return [raider.side, raider.blockedByEnemyId ?? null, ...enemySnapshot(raider)];
}

/** A raider of a played card that is still being summoned (spec 18.5). */
function summonSnapshot(summon: Readonly<DuelSummonState>): unknown[] {
  return [
    summon.side,
    summon.enemyId,
    summon.lane,
    summon.appearTick,
    summon.activeAtTick,
    summon.raider === null ? null : raiderSnapshot(summon.raider),
  ];
}
