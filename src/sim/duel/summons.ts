import { spawnEnemy } from '../enemies/spawn';
import type { DuelEventLog } from './events';
import { raiderSpawnXOf } from './sides';
import type { DuelRaiderState, DuelState, DuelSummonState } from './types';

/**
 * Makes the raider of a due summon appear at its side's spawn point (spec 18.1,
 * 18.5) and emits `enemySpawned`. The raider is kept out of `state.enemies` until
 * it is active, so nothing can target, block or hit it during the summon.
 */
function appearSummon(state: DuelState, summon: DuelSummonState, log: DuelEventLog): void {
  let raider: DuelRaiderState | undefined;
  log.emitShared((events) => {
    const x = raiderSpawnXOf(summon.side);
    raider = spawnEnemy(state, summon.enemyId, summon.lane, x, 0, events, summon.side) as
      DuelRaiderState | undefined;
  });
  if (raider === undefined) {
    return;
  }
  // The event log has recorded the raider's side by now; take it off the field again.
  state.enemies.splice(state.enemies.indexOf(raider), 1);
  raider.blockedByEnemyId = null;
  summon.raider = raider;
}

/**
 * Puts a summoned raider on the field (spec 18.5): from this tick on it moves,
 * attacks and can be targeted. Timers that started when it appeared are shifted
 * by the summon delay, so a Gloom Priest heals one interval after it became active.
 */
function activateSummon(state: DuelState, summon: DuelSummonState): void {
  const raider = summon.raider;
  if (raider === null) {
    return;
  }
  if (raider.nextHealTick !== null) {
    raider.nextHealTick += summon.activeAtTick - summon.appearTick;
  }
  state.enemies.push(raider);
}

/**
 * First part of tick step 6 (spec 18.5, 18.8): raiders of played cards appear at
 * their spawn point when due and become active the summon delay later, in play order.
 */
export function updateSummons(state: DuelState, log: DuelEventLog): void {
  for (const summon of state.summons) {
    if (summon.raider === null && state.tick >= summon.appearTick) {
      appearSummon(state, summon, log);
    }
  }
  for (let index = 0; index < state.summons.length;) {
    const summon = state.summons[index];
    if (summon !== undefined && state.tick >= summon.activeAtTick) {
      activateSummon(state, summon);
      state.summons.splice(index, 1);
    } else {
      index += 1;
    }
  }
}
