/**
 * Billboard orientation and anchor maths for the 2.5D sprite layer (issue #114).
 *
 * The quad geometry is bottom-center anchored (the sprite content sits on the sim
 * position; the frame's transparent bottom padding is kept below the ground point)
 * and the per-frame orientation copies the camera quaternion, so the animated pixel
 * art always faces the portrait camera. Pure three.js maths only — no renderer or
 * WebGL — which keeps `tests/render/sprites.test.ts` GPU-free.
 */
import { PlaneGeometry, Quaternion, Vector3 } from 'three';

/** Default readability scale of the manifest world heights on a portrait phone. */
export const DEFAULT_WORLD_SCALE = 1.5;

/** Lower bound of the world scale: shrinking below the manifest height hurts readability. */
export const MIN_WORLD_SCALE = 1;

/** Upper bound of the world scale, so a typo cannot turn units into screen fillers. */
export const MAX_WORLD_SCALE = 3;

/** Maximum bottom padding kept below the ground point, as a fraction of the height. */
const MAX_BOTTOM_INSET_FRACTION = 0.25;

/** Local axis a death/merge spin rolls around (the camera-facing normal is +z). */
const ROLL_AXIS = new Vector3(0, 0, 1);

/** Scratch quaternion of the roll, reused so `apply` never allocates. */
const rollQuaternion = new Quaternion();

/**
 * Resolves the optional `worldScale` layer option: defaults to 1.5 for phone
 * readability and clamps into 1..3 (the Lead asked for a >= 1.0 floor).
 */
export function resolveSpriteWorldScale(worldScale: number | undefined): number {
  if (worldScale === undefined || !Number.isFinite(worldScale)) {
    return DEFAULT_WORLD_SCALE;
  }
  return Math.min(MAX_WORLD_SCALE, Math.max(MIN_WORLD_SCALE, worldScale));
}

/** World width of a sprite: the frame aspect ratio times its world height. */
export function spriteWorldWidth(
  worldHeight: number,
  frameWidth: number,
  frameHeight: number,
): number {
  if (!(frameHeight > 0) || !(worldHeight > 0) || !(frameWidth > 0)) {
    return 0;
  }
  return worldHeight * (frameWidth / frameHeight);
}

/**
 * Writes the camera-facing billboard orientation into `out`: the plane faces the
 * camera exactly like a screen-aligned sprite, with the procedural death/merge spin
 * applied as a roll around the view axis (so it turns in the screen plane).
 */
export function billboardQuaternion(
  out: Quaternion,
  cameraQuaternion: Quaternion,
  rollRadians = 0,
): Quaternion {
  out.copy(cameraQuaternion);
  if (rollRadians === 0) {
    return out;
  }
  rollQuaternion.setFromAxisAngle(ROLL_AXIS, rollRadians);
  out.multiply(rollQuaternion);
  return out;
}

/**
 * One unit quad, centred horizontally. The visible sprite content sits on y = 0 and
 * the transparent bottom padding of the pixel-art frame is kept below the ground
 * point (`bottomInsetWorld`), so the feet stand exactly on the sim position instead
 * of floating by the frame padding. Scaling the mesh grows the sprite upward.
 */
export function createBottomCenterQuad(
  worldWidth: number,
  worldHeight: number,
  bottomInsetWorld = 0,
): PlaneGeometry {
  const height = Math.max(worldHeight, 0.001);
  const inset = Math.min(
    Math.max(Number.isFinite(bottomInsetWorld) ? bottomInsetWorld : 0, 0),
    height * MAX_BOTTOM_INSET_FRACTION,
  );
  const geometry = new PlaneGeometry(Math.max(worldWidth, 0.001), height);
  geometry.translate(0, height / 2 - inset, 0);
  return geometry;
}
