import type { SimState } from './types';

/**
 * The stable state hash used by the replay tests (spec 11.6).
 *
 * Algorithm: FNV-1a (32 bit) over the JSON of an explicitly canonicalised
 * snapshot. Every observable, mutable field of `SimState` is listed in a fixed
 * order, so the hash changes whenever any rule-relevant value changes and never
 * depends on object key order. The only field left out is the `next()` method of
 * the rng; its serialisable `state` is included. Numbers are hashed as raw IEEE
 * 754 doubles via JSON (deterministic across JS engines, no rounding).
 *
 * Any rules or data change alters these hashes; the golden replays in
 * `tests/sim/replays/` are regenerated only in the pull request that causes it,
 * with the reason stated in the PR (spec 11.6).
 *
 * Returns 8 lowercase hex characters.
 */
export function hashState(state: Readonly<SimState>): string {
  const snapshot = {
    levelId: state.levelId,
    seed: state.seed,
    loadout: state.loadout.map((entry) => [entry.defenderId, entry.level]),
    cardCooldownEndTicks: state.cardCooldownEndTicks,
    tick: state.tick,
    rngState: state.rng.state,
    nextId: state.nextId,
    essence: state.essence,
    autoCollect: state.autoCollect,
    defenders: state.defenders.map((defender) => [
      defender.id,
      defender.defenderId,
      defender.lane,
      defender.col,
      defender.stars,
      defender.hp,
      defender.maxHp,
      defender.cardLevel,
      defender.activeAtTick,
      defender.nextOrbTick,
      defender.nextAttackTick,
      defender.trapReadyAtTick,
      defender.trapRearmed,
      defender.attackCount,
    ]),
    enemies: state.enemies.map((enemy) => [
      enemy.id,
      enemy.enemyId,
      enemy.lane,
      enemy.x,
      enemy.hp,
      enemy.maxHp,
      enemy.waveIndex,
      enemy.blockedByDefenderId,
      enemy.nextBiteTick,
      enemy.statuses.map((status) => [
        status.kind,
        status.expiresAtTick,
        status.nextTickAt,
        status.knockbackTilesPerTick,
      ]),
      enemy.comboCooldowns.steam,
      enemy.comboCooldowns.shatter,
      enemy.comboCooldowns.toxic,
      enemy.comboCooldowns.chain,
    ]),
    projectiles: state.projectiles.map((projectile) => [
      projectile.id,
      projectile.kind,
      projectile.lane,
      projectile.x,
      projectile.originX,
      projectile.sourceId,
      projectile.damage,
      projectile.damageType,
      projectile.hitsFlying,
      projectile.targetId,
      projectile.landTick,
      projectile.splashRadius,
      projectile.targetLane,
      projectile.switchAtX,
      projectile.statusKind,
      projectile.statusDurationS,
      projectile.statusStacks,
      projectile.element,
    ]),
    orbs: state.orbs.map((orb) => [
      orb.id,
      orb.lane,
      orb.x,
      orb.value,
      orb.spawnTick,
      orb.landTick,
      orb.expiresAtTick,
    ]),
    wave: {
      index: state.wave.index,
      nextWaveTick: state.wave.nextWaveTick,
      pendingSpawns: state.wave.pendingSpawns.map((spawn) => [spawn.enemyId, spawn.lane]),
      nextSpawnTick: state.wave.nextSpawnTick,
      earlyClearTick: state.wave.earlyClearTick,
      allWavesSpawned: state.wave.allWavesSpawned,
      bannerWaveIndex: state.wave.bannerWaveIndex,
      bannerTick: state.wave.bannerTick,
    },
    traps: state.traps.map((trap) => [trap.used, trap.rollerX]),
    status: state.status,
    stars: state.stars,
    defendersLost: state.defendersLost,
  };
  return fnv1a(JSON.stringify(snapshot));
}

/** FNV-1a 32-bit hash of a string, formatted as 8 lowercase hex characters. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
