import { describe, expect, it } from 'vitest';

import {
  canUsePostProcessing,
  POST_PROCESSING_DEFAULTS,
  tiltShiftBlurAmount,
} from '../../src/render/postprocessing';

describe('Tilt-shift focus band (issue #114)', () => {
  it('keeps the focus band sharp and blurs the far/near screen bands', () => {
    const { focusCenter, focusHalfHeight, focusFeather } = POST_PROCESSING_DEFAULTS;
    expect(tiltShiftBlurAmount(focusCenter, focusCenter, focusHalfHeight, focusFeather)).toBe(0);
    expect(
      tiltShiftBlurAmount(
        focusCenter + focusHalfHeight * 0.9,
        focusCenter,
        focusHalfHeight,
        focusFeather,
      ),
    ).toBe(0);
    expect(tiltShiftBlurAmount(1, focusCenter, focusHalfHeight, focusFeather)).toBeCloseTo(1);
    // The wide focus band keeps the near foreground lighter, but still visibly soft.
    expect(tiltShiftBlurAmount(0, focusCenter, focusHalfHeight, focusFeather)).toBeGreaterThan(0.5);
  });

  it('ramps smoothly and monotonically outside the focus band', () => {
    let previous = 0;
    for (let row = 0.7; row <= 1; row += 0.02) {
      const amount = tiltShiftBlurAmount(row, 0.5, 0.1, 0.3);
      expect(amount).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = amount;
    }
  });

  it('treats invalid input safely', () => {
    expect(tiltShiftBlurAmount(Number.NaN, 0.5, 0.1, 0.2)).toBe(0);
    expect(tiltShiftBlurAmount(0.5, 0.5, 0.1, 0)).toBe(0);
    expect(tiltShiftBlurAmount(1, 0.5, 0.1, 0)).toBe(1);
  });
});

describe('Post-processing capability check (issue #114)', () => {
  it('only enables the composer pipeline on WebGL2', () => {
    expect(canUsePostProcessing({ isWebGL2: true })).toBe(true);
    expect(canUsePostProcessing({ isWebGL2: false })).toBe(false);
    expect(canUsePostProcessing(null)).toBe(false);
    expect(canUsePostProcessing(undefined)).toBe(false);
  });

  it('ships mobile-friendly defaults inside sane ranges', () => {
    expect(POST_PROCESSING_DEFAULTS.enabled).toBe(true);
    expect(POST_PROCESSING_DEFAULTS.bloomStrength).toBeLessThanOrEqual(2);
    expect(POST_PROCESSING_DEFAULTS.bloomThreshold).toBeGreaterThan(0);
    expect(POST_PROCESSING_DEFAULTS.blurPixels).toBeLessThanOrEqual(4);
    expect(POST_PROCESSING_DEFAULTS.focusCenter).toBeGreaterThan(0);
    expect(POST_PROCESSING_DEFAULTS.focusCenter).toBeLessThan(1);
  });
});
