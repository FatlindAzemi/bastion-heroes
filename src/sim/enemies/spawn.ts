import { enemyById } from '../../data';
import { ticksFromSeconds } from '../placement';
import type { EnemyState, SimEvent, SimState } from '../types';

/** Tick of the first heal pulse of a healer, or null when the data has no heal interval (spec 6.2). */
function initialHealTick(enemyDef: { healIntervalS?: number }, spawnTick: number): number | null {
  if (enemyDef.healIntervalS === undefined) {
    return null;
  }
  return spawnTick + ticksFromSeconds(enemyDef.healIntervalS);
}

/**
 * Creates one enemy of `enemyId` at `x` in `lane` (spec 6.1, 11.3): allocates its
 * id from the shared counter, initialises the special state from its data and
 * emits `enemySpawned`. Used by the wave runner and by enemies that spawn others
 * (Gloom Ogre throw, spec 6.2). Returns undefined for an unknown enemy id.
 */
export function spawnEnemy(
  state: SimState,
  enemyId: string,
  lane: number,
  x: number,
  waveIndex: number,
  events: SimEvent[],
): EnemyState | undefined {
  const enemyDef = enemyById[enemyId];
  if (enemyDef === undefined) {
    return undefined;
  }
  const enemy: EnemyState = {
    id: state.nextId,
    enemyId,
    lane,
    x,
    hp: enemyDef.hp,
    maxHp: enemyDef.hp,
    waveIndex,
    blockedByDefenderId: null,
    nextBiteTick: null,
    statuses: [],
    comboCooldowns: { steam: 0, shatter: 0, toxic: 0, chain: 0 },
    shieldHp: enemyDef.shieldHp ?? 0,
    armorBroken: false,
    nextHealTick: initialHealTick(enemyDef, state.tick),
    hasThrown: false,
  };
  state.nextId += 1;
  state.enemies.push(enemy);
  events.push({ type: 'enemySpawned', id: enemy.id, enemyId, lane });
  return enemy;
}
