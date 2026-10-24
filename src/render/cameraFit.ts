import { PerspectiveCamera, Vector3 } from 'three';

/** Field of view of spec 9.1 (degrees). */
export const LEVEL_CAMERA_FOV = 32;

/** Camera target of spec 9.1 (the middle of the playfield). */
export const LEVEL_CAMERA_TARGET = new Vector3(4.5, 0, 2.6);

/** Camera direction of spec 9.1: from the start position towards the target. */
const LEVEL_CAMERA_DIRECTION = new Vector3(4.5, 7.5, 10.5).sub(LEVEL_CAMERA_TARGET).normalize();

/**
 * World bounds the level camera must keep on screen: the base apron on the left, the
 * enemy portal on the right, the five lanes plus their dirt border and units up to 1.8
 * units tall (spec 9.1: world x -2.5..11.0, z = lane + 0.5).
 */
export const LEVEL_VIEW_BOUNDS = {
  minX: -2.7,
  maxX: 11.7,
  minY: 0,
  maxY: 1.8,
  minZ: -0.9,
  maxZ: 5.9,
} as const;

/** Default HUD-free strip when no screen height is known (spec 9.1: at least the top 14 %). */
export const HUD_TOP_FRACTION = 0.14;

/** Card bar height of the 9.8 HUD at its smallest size: 18 px top margin + 96 px cards. */
export const HUD_CARD_BAR_HEIGHT_PX = 114;

/** The camera keeps the playfield below this NDC height so the top HUD strip stays free. */
export const HUD_TOP_NDC = 1 - 2 * HUD_TOP_FRACTION;

/** NDC margins used to keep the field fully visible without touching the screen edges. */
const HORIZONTAL_NDC_LIMIT = 0.97;
const BOTTOM_NDC_LIMIT = -0.97;

/**
 * Vertical view raise in world units. The spec 9.1 camera looks slightly down at the
 * field; raising the camera and its target together keeps the view direction but shifts
 * the playfield towards the lower half of the screen, which uses the space under the HUD
 * strip without shrinking the field. Chosen from screenshots at 844x390 and 1280x720.
 */
const VIEW_RAISE = 1;

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
 * Places the level camera so the whole playfield plus units fits the screen at any
 * aspect ratio, keeping the FOV and view direction of spec 9.1 fixed. The camera looks
 * at the 9.1 target and slides along its view axis until every corner of
 * `LEVEL_VIEW_BOUNDS` is inside the safe NDC area, with the top 14 % free for the HUD
 * strip. Returns the used camera distance for tests.
 */
export function fitLevelCamera(
  camera: PerspectiveCamera,
  aspect: number,
  hudTopFraction: number = HUD_TOP_FRACTION,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeTopFraction = Number.isFinite(hudTopFraction)
    ? Math.min(0.45, Math.max(HUD_TOP_FRACTION, hudTopFraction))
    : HUD_TOP_FRACTION;
  const topNdc = 1 - 2 * safeTopFraction;
  camera.fov = LEVEL_CAMERA_FOV;
  camera.aspect = safeAspect;

  const tanHalfFov = Math.tan(((LEVEL_CAMERA_FOV / 2) * Math.PI) / 180);
  const forward = LEVEL_CAMERA_DIRECTION.clone().negate();
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();

  // The camera sits at target + direction * distance. Translating it along the view axis
  // changes only each corner's depth, so the required distance for a corner is
  // "projection on the view axis + depth needed for its horizontal/vertical offset".
  let distance = 1;
  for (const corner of boundsCorners()) {
    const offset = corner.clone().sub(LEVEL_CAMERA_TARGET);
    const depthOffset = offset.dot(LEVEL_CAMERA_DIRECTION);
    const horizontal = offset.dot(right);
    const vertical = offset.dot(up);
    const requiredDepthX = Math.abs(horizontal) / (tanHalfFov * safeAspect * HORIZONTAL_NDC_LIMIT);
    const requiredDepthY =
      vertical >= 0
        ? vertical / (tanHalfFov * topNdc)
        : -vertical / (tanHalfFov * Math.abs(BOTTOM_NDC_LIMIT));
    distance = Math.max(distance, depthOffset + Math.max(requiredDepthX, requiredDepthY));
  }
  distance = Math.max(1, distance + 0.05);

  const lookTarget = LEVEL_CAMERA_TARGET.clone().add(new Vector3(0, VIEW_RAISE, 0));
  camera.position.copy(lookTarget).addScaledVector(LEVEL_CAMERA_DIRECTION, distance);
  camera.lookAt(lookTarget);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return distance;
}
