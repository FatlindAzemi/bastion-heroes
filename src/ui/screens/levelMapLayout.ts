/**
 * Pure layout of the World 1 map on the level select screen (issue #114). The
 * medallions walk from level 1 at the bottom of the map up to the Bastion gate of
 * level 10, so `mapPathD` only has to turn the same points into an SVG path.
 */

/** A normalised position on the map, in percent of the map box. */
export interface MapNodePosition {
  readonly left: number;
  readonly top: number;
}

/** Level 1 starts bottom left and the path winds up to the gate at the top. */
export const MAP_NODE_POSITIONS: readonly MapNodePosition[] = [
  { left: 23, top: 88 },
  { left: 62, top: 80 },
  { left: 28, top: 71 },
  { left: 66, top: 62 },
  { left: 32, top: 53 },
  { left: 64, top: 44 },
  { left: 28, top: 35 },
  { left: 60, top: 26 },
  { left: 36, top: 17 },
  { left: 60, top: 9 },
];

const FALLBACK_POSITION: MapNodePosition = { left: 50, top: 50 };

/** Position of the n-th medallion; out-of-range indices clamp to the nearest node. */
export function nodePosition(index: number): MapNodePosition {
  const clamped = Math.min(MAP_NODE_POSITIONS.length - 1, Math.max(0, index));
  return MAP_NODE_POSITIONS[clamped] ?? FALLBACK_POSITION;
}

/**
 * SVG path (viewBox 0 0 100 100) through the medallions: straight-start segments
 * become gentle S-curves by putting both control points on the vertical midpoint.
 */
export function mapPathD(positions: readonly MapNodePosition[] = MAP_NODE_POSITIONS): string {
  const first = positions[0];
  if (first === undefined) {
    return '';
  }
  let path = `M ${first.left} ${first.top}`;
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1];
    const current = positions[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const midTop = (previous.top + current.top) / 2;
    path += ` C ${previous.left} ${midTop} ${current.left} ${midTop} ${current.left} ${current.top}`;
  }
  return path;
}
