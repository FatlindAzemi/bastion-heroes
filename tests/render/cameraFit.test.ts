import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  fitLevelCamera,
  HUD_TOP_NDC,
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

describe('level camera fit (spec 9.1)', () => {
  it.each([844 / 390, 1280 / 720, 1194 / 834, 2.5, 1.4])(
    '9.1: fits the whole playfield with HUD-free top at aspect %s',
    (aspect) => {
      const camera = new PerspectiveCamera(LEVEL_CAMERA_FOV, aspect, 0.1, 60);
      const distance = fitLevelCamera(camera, aspect);
      camera.updateMatrixWorld(true);
      expect(camera.fov).toBe(LEVEL_CAMERA_FOV);
      expect(aspect).toBeGreaterThan(0);
      expect(camera.aspect).toBe(aspect);
      expect(distance).toBeGreaterThan(1);
      for (const corner of boundsCorners()) {
        const projected = corner.clone().project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.981);
        // The top 14 % of the screen stays free for the card bar (spec 9.1).
        expect(projected.y).toBeLessThanOrEqual(HUD_TOP_NDC + 0.001);
        expect(projected.y).toBeGreaterThanOrEqual(-0.981);
      }
      // The camera still looks at the 9.1 target from the 9.1 direction.
      const direction = camera.position.clone().sub(LEVEL_CAMERA_TARGET).normalize();
      expect(direction.x).toBeCloseTo(0, 5);
      expect(direction.y).toBeGreaterThan(0);
      expect(direction.z).toBeGreaterThan(0);
    },
  );

  it('9.1: a narrower aspect needs a larger camera distance', () => {
    const wide = new PerspectiveCamera(LEVEL_CAMERA_FOV, 2.2, 0.1, 60);
    const narrow = new PerspectiveCamera(LEVEL_CAMERA_FOV, 1.2, 0.1, 60);
    const wideDistance = fitLevelCamera(wide, 2.2);
    const narrowDistance = fitLevelCamera(narrow, 1.2);
    expect(narrowDistance).toBeGreaterThan(wideDistance);
  });

  it('9.1: an invalid aspect falls back to a square view', () => {
    const camera = new PerspectiveCamera(LEVEL_CAMERA_FOV, 1, 0.1, 60);
    expect(() => fitLevelCamera(camera, Number.NaN)).not.toThrow();
    expect(camera.aspect).toBe(1);
  });
});
