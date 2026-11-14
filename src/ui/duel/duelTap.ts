/**
 * Turns a tap or a drop on the board into a Duel play (spec 18.5): a defender needs
 * a tile, a raider only a lane. The point is already in sim coordinates (the north
 * mirror is undone by the renderer, spec 18.1), so nothing here mirrors.
 */
import { rules } from '../../data/rules';
import type { DuelHeldKind, DuelWorldPoint } from './types';

/** What a tap on the board does with the held card. */
export type DuelTapResult =
  | { readonly kind: 'play'; readonly lane: number; readonly col: number }
  | { readonly kind: 'cancel' };

/**
 * Resolves a board point for the held card kind. A defender tap on the other side's
 * columns still plays, so the sim answers with "Not your side" (spec 18.5). A tap
 * outside the 5 x 9 board cancels the selection.
 */
export function resolveDuelTap(
  world: DuelWorldPoint | null,
  heldKind: DuelHeldKind | null,
): DuelTapResult {
  if (world === null || heldKind === null) {
    return { kind: 'cancel' };
  }
  const col = Math.floor(world.x / rules.grid.tileSize);
  const lane = Math.floor(world.z / rules.grid.tileSize);
  const onBoard =
    col >= 0 && col < rules.grid.columnCount && lane >= 0 && lane < rules.grid.laneCount;
  return onBoard ? { kind: 'play', lane, col } : { kind: 'cancel' };
}
