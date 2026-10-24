import { rules } from '../data';
import type { SimEvent, SimState } from './types';

/** True when every wave has spawned and no enemy is left alive (spec 3.10). */
function isLevelCleared(state: SimState): boolean {
  return (
    state.wave.allWavesSpawned &&
    state.wave.pendingSpawns.length === 0 &&
    state.enemies.length === 0
  );
}

/** Computes the win rating of spec 3.11: 1 with a trap, 3 with no trap and at most 2 losses. */
function rateWin(state: SimState): 1 | 2 | 3 {
  const trapUsed = state.traps.some((trap) => trap.used);
  if (trapUsed) {
    return 1;
  }
  return state.defendersLost <= rules.rating.threeStarMaxDefendersLost ? 3 : 2;
}

/**
 * Phase 10 of every tick (spec 11.3): loses the level when an enemy crossed the
 * loss line in a lane whose trap is used, otherwise wins it when every wave has
 * spawned and no enemy is alive (spec 3.9, 3.10). The star rating follows 3.11.
 */
export function checkLevelResult(state: SimState, events: SimEvent[]): void {
  if (state.status !== 'playing') {
    return;
  }

  const crossedLossLine = state.enemies.some(
    (enemy) => enemy.x <= rules.loss.lossLineX && state.traps[enemy.lane]?.used === true,
  );
  if (crossedLossLine) {
    state.status = 'lost';
    state.stars = 0;
    events.push({ type: 'levelLost' });
    return;
  }

  if (isLevelCleared(state)) {
    state.status = 'won';
    state.stars = rateWin(state);
    events.push({ type: 'levelWon', stars: state.stars });
  }
}
