import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  fitLevelCamera,
  HUD_BOTTOM_FRACTION,
  HUD_TOP_FRACTION,
  LEVEL_CAMERA_FOV,
  LEVEL_CAMERA_TARGET,
  LEVEL_VIEW_BOUNDS,
} from '../../src/render/cameraFit';

/** The eight world-space corners the camera has to keep on screen (spec 9.1). */
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

/** Projects one world point to NDC with the fitted camera. */
function project(camera: PerspectiveCamera, x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).project(camera);
}

describe('portrait level camera fit (spec 9.1)', () => {
  it.each([390 / 844, 360 / 800, 834 / 1194, 1, 1.4, 2.5])(
    '9.1: fits the whole playfield between the portrait HUD strips at aspect %s',
    (aspect) => {
      const camera = new PerspectiveCamera(LEVEL_CAMERA_FOV, aspect, 0.1, 60);
      const distance = fitLevelCamera(camera, aspect);
      camera.updateMatrixWorld(true);
      expect(camera.fov).toBe(LEVEL_CAMERA_FOV);
      expect(camera.aspect).toBe(aspect);
      expect(distance).toBeGreaterThan(1);
      const topNdc = 1 - 2 * HUD_TOP_FRACTION;
      const bottomNdc = -(1 - 2 * HUD_BOTTOM_FRACTION);
      for (const corner of boundsCorners()) {
        const projected = corner.clone().project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.971);
        // The top status bar and the bottom card tray stay free (spec 9.8 portrait).
        expect(projected.y).toBeLessThanOrEqual(topNdc + 0.001);
        expect(projected.y).toBeGreaterThanOrEqual(bottomNdc - 0.001);
      }
    },
  );

  it('9.1: looks from the near (-x) side down the board towards the portal (+x)', () => {
    const camera = new PerspectiveCamera(LEVEL_CAMERA_FOV, 390 / 844, 0.1, 60);
    fitLevelCamera(camera, 390 / 844);
    const direction = camera.position.clone().sub(LEVEL_CAMERA_TARGET).normalize();
    // The 45 degree elevation of the portrait camera.
    expect(direction.x).toBeCloseTo(-Math.SQRT1_2, 4);
    expect(direction.y).toBeCloseTo(Math.SQRT1_2, 4);
    expect(direction.z).toBeCloseTo(0, 4);
  });

  it('9.1: the base sits below the portal on screen and lanes span the screen width', () => {
    const camera = new PerspectiveCamera(LEVEL_CAMERA_FOV, 390 / 844, 0.1, 60);
    fitLevelCamera(camera, 390 / 844);
    camera.updateMatrixWorld(true);
    const base = project(camera, 0, 0.4, 2.5);
    const portal = project(camera, 9, 0.4, 2.5);
    expect(base.y).toBeLessThan(portal.y);
    const laneLeft = project(camera, 4.5, 0.4, 0.5);
    const laneRight = project(camera, 4.5, 0.4, 4.5);
    expect(laneLeft.x).toBeLessThan(laneRight.x);
    expect(laneRight.x - laneLeft.x).toBeGreaterThan(0.7);
  });

  it('9.1: a narrower aspect needs a larger camera distance', () => {
    const wide = new PerspectiveCamera(LEVEL_CAMERA_FOV, 834 / 1194, 0.1, 60);
    const narrow = new PerspectiveCamera(LEVEL_CAMERA_FOV, 390 / 844, 0.1, 60);
    expect(fitLevelCamera(narrow, 390 / 844)).toBeGreaterThan(fitLevelCamera(wide, 834 / 1194));
  });

  it('9.1: an invalid aspect falls back to a square view', () => {
    const camera = new PerspectiveCamera(LEVEL_CAMERA_FOV, 1, 0.1, 60);
    expect(() => fitLevelCamera(camera, Number.NaN)).not.toThrow();
    expect(camera.aspect).toBe(1);
  });
});
