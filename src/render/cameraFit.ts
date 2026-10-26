import { PerspectiveCamera, Vector3 } from 'three';

/** Field of view of spec 9.1 (degrees). */
export const LEVEL_CAMERA_FOV = 32;

/** Camera target of spec 9.1: the middle of the playfield. */
export const LEVEL_CAMERA_TARGET = new Vector3(4.5, 0, 2.5);

/**
 * Portrait camera elevation above the horizon in degrees. The camera sits on the
 * near (base) side of the board and looks along +x towards the enemy portal, so the
 * five lanes span the screen width and the nine columns run from the bottom (base)
 * to the top (portal). The pitch trades depth for a full-width, readable board.
 */
export const LEVEL_CAMERA_ELEVATION_DEG = 45;

/**
 * Screen fractions reserved for the portrait HUD (spec 9.8): the top status bar and
 * the bottom card tray. The camera keeps the whole playfield inside the area
 * between them.
 */
export const HUD_TOP_FRACTION = 0.09;
export const HUD_BOTTOM_FRACTION = 0.135;

/**
 * World bounds the level camera must keep on screen: the base apron at the bottom,
 * the enemy portal at the top, the five lanes plus their dirt border and units up to
 * 1.8 units tall (spec 9.1: world x -2.5..11.0, z = lane + 0.5).
 */
export const LEVEL_VIEW_BOUNDS = {
  minX: -1.05,
  maxX: 10.15,
  minY: 0,
  maxY: 1.4,
  minZ: -0.35,
  maxZ: 5.35,
} as const;

/** NDC margins used to keep the field fully visible without touching the screen edges. */
const SIDE_NDC_LIMIT = 0.97;

/** Clamps a HUD strip fraction into a sane range so a broken caller cannot erase the view. */
function safeFraction(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(0.35, Math.max(0.02, value)) : fallback;
}

/**
 * Unit vector from the camera towards its target for the portrait view: the camera is
 * on the near (-x) side, above the board, and looks towards the portal (+x).
 */
export function levelCameraForward(): Vector3 {
  const elevation = (LEVEL_CAMERA_ELEVATION_DEG * Math.PI) / 180;
  return new Vector3(Math.cos(elevation), -Math.sin(elevation), 0).normalize();
}

/** One world-space corner of the view bounds. */
function boundsCorners(): Vector3[] {
  const corners: Vector3[] = [];
  for (const x of [LEVEL_VIEW_BOUNDS.minX, LEVEL_VIEW_BOUNDS.maxX]) {
    for (const y of [LEVEL_VIEW_BOUNDS.minY, LEVEL_VIEW_BOUNDS.maxY]) {
      for (const z of [LEVEL_VIEW_BOUNDS.minZ, LEVEL_VIEW_BOUNDS.maxZ]) {
        corners.push(new Vector3(x, y, z));
      }
    }
  }
  return corners;
}

/**
 * Places the level camera so the whole playfield plus units fits between the portrait
 * HUD strips at any aspect ratio. The camera looks along the fixed portrait direction
 * and slides along it until every corner of `LEVEL_VIEW_BOUNDS` is inside the safe
 * NDC area, with `hudTopFraction` free at the top and `hudBottomFraction` at the
 * bottom for the status bar and the card tray (spec 9.1, 9.8). Returns the used
 * camera distance for tests.
 */
export function fitLevelCamera(
  camera: PerspectiveCamera,
  aspect: number,
  hudTopFraction: number = HUD_TOP_FRACTION,
  hudBottomFraction: number = HUD_BOTTOM_FRACTION,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const topFraction = safeFraction(hudTopFraction, HUD_TOP_FRACTION);
  const bottomFraction = safeFraction(hudBottomFraction, HUD_BOTTOM_FRACTION);
  const topNdc = 1 - 2 * topFraction;
  const bottomNdc = 1 - 2 * bottomFraction;
  camera.fov = LEVEL_CAMERA_FOV;
  camera.aspect = safeAspect;

  const tanHalfFov = Math.tan(((LEVEL_CAMERA_FOV / 2) * Math.PI) / 180);
  const forward = levelCameraForward();
  const direction = forward.clone().negate();
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();

  // The camera sits at target + direction * distance. Translating it along the view
  // axis changes only each corner's depth, so the required distance for a corner is
  // "projection on the view axis + depth needed for its horizontal/vertical offset".
  let distance = 1;
  for (const corner of boundsCorners()) {
    const offset = corner.clone().sub(LEVEL_CAMERA_TARGET);
    const depthOffset = offset.dot(direction);
    const horizontal = offset.dot(right);
    const vertical = offset.dot(up);
    const requiredDepthX = Math.abs(horizontal) / (tanHalfFov * safeAspect * SIDE_NDC_LIMIT);
    const requiredDepthY =
      vertical >= 0 ? vertical / (tanHalfFov * topNdc) : -vertical / (tanHalfFov * bottomNdc);
    distance = Math.max(distance, depthOffset + Math.max(requiredDepthX, requiredDepthY));
  }
  distance = Math.max(1, distance + 0.05);

  camera.position.copy(LEVEL_CAMERA_TARGET).addScaledVector(direction, distance);
  camera.lookAt(LEVEL_CAMERA_TARGET);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return distance;
}
