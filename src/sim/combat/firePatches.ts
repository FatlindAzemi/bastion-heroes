import { rules } from '../../data';
import { ticksFromSeconds } from '../time';
import type { CombatState, FirePatchSpec, FirePatchState, Side, SimEvent } from '../types';
import { attackSide, enemySide } from './side';
import { applyStatus } from './status';

/** True when the enemy stands inside the patch (2D plane; one lane is 1 tile apart, spec 3.1). */
function isInsidePatch(patch: FirePatchState, enemy: { lane: number; x: number }): boolean {
  return Math.hypot(enemy.lane - patch.lane, enemy.x - patch.x) <= patch.radiusTiles;
}

/**
 * Spawns a ★3 Pyro Fox fire patch at a lob impact point (spec 5.2). Ids come from
 * the shared entity counter (spec 11.3); the first Burn application is due now.
 * The patch belongs to `side`, the side of the defender whose lob left it; omitted
 * means the campaign's defenders (spec 18.1).
 */
export function spawnFirePatch(
  state: CombatState,
  lane: number,
  x: number,
  spec: FirePatchSpec,
  side?: Side,
): FirePatchState {
  const patch: FirePatchState = {
    id: state.nextId,
    ...(side === undefined ? {} : { side }),
    lane,
    x,
    radiusTiles: spec.radiusTiles,
    expiresAtTick: state.tick + spec.durationTicks,
    nextBurnTick: state.tick,
  };
  state.nextId += 1;
  state.firePatches.push(patch);
  return patch;
}

/** Applies one Burn stack to every unit of the other side inside a patch (spec 4.5, 5.2, 18.6). */
function burnEnemiesInside(state: CombatState, patch: FirePatchState, events: SimEvent[]): void {
  const enemies = [...state.enemies].sort((first, second) => first.id - second.id);
  for (const enemy of enemies) {
    if (enemySide(enemy) !== attackSide(patch) && isInsidePatch(patch, enemy)) {
      applyStatus(state.tick, enemy, { kind: 'burn' }, events);
    }
  }
}

/**
 * Ticks the fire patches as part of the status phase (spec 11.3, 5.2): each
 * patch applies Burn to the enemies inside every burn interval and disappears
 * when its duration is over.
 */
export function updateFirePatches(state: CombatState, events: SimEvent[]): void {
  const burnIntervalTicks = ticksFromSeconds(rules.status.burn.intervalS);
  for (let index = state.firePatches.length - 1; index >= 0; index -= 1) {
    const patch = state.firePatches[index];
    if (patch === undefined) {
      continue;
    }
    if (state.tick >= patch.expiresAtTick) {
      state.firePatches.splice(index, 1);
      continue;
    }
    while (state.tick >= patch.nextBurnTick) {
      burnEnemiesInside(state, patch, events);
      patch.nextBurnTick += burnIntervalTicks;
    }
  }
}
