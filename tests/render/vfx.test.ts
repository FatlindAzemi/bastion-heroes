import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data/rules';
import {
  damageColorFor,
  damageMultiplierFor,
  DAMAGE_COLOR_EFFECTIVE,
  DAMAGE_COLOR_NEUTRAL,
  DAMAGE_COLOR_RESISTED,
  DAMAGE_NUMBER_LIFE_S,
  DAMAGE_NUMBER_RISE,
  HEALTH_BAR_WIDTH,
  healthFraction,
  SHAKE_AMPLITUDE,
  SHAKE_DURATION_S,
  SHAKE_HIT_THRESHOLD,
  SLOW_MOTION_DURATION_S,
  SLOW_MOTION_SCALE,
  slowMotionSpeed,
} from '../../src/render/vfx/juice';
import { readDebugVfx } from '../../src/render/vfx/debugVfx';
import { VFX_DEFINITIONS, VFX_IDS } from '../../src/render/vfx/definitions';
import { atlasCellCount, spriteCellRect } from '../../src/render/vfx/atlas';
import { unitHeadHeight, FLYING_HEAD_HEIGHT } from '../../src/render/vfx/unitHeights';
import { readDebugAnimationHold } from '../../src/render/debugAnimation';

describe('VFX set (spec 9.7; issue #75)', () => {
  it('9.7: every id of the table has its own module definition', () => {
    expect(VFX_IDS).toHaveLength(18);
    expect(new Set(VFX_IDS).size).toBe(18);
    for (const id of VFX_IDS) {
      const definition = VFX_DEFINITIONS[id];
      expect(definition.id).toBe(id);
      expect(definition.sprite).toBeGreaterThanOrEqual(0);
      expect(definition.sprite).toBeLessThan(6);
      expect(definition.colors.length).toBeGreaterThan(0);
      expect(definition.count).toBeGreaterThan(0);
      expect(definition.lifeMin).toBeGreaterThan(0);
      expect(definition.lifeMax).toBeGreaterThanOrEqual(definition.lifeMin);
      expect(definition.size).toBeGreaterThan(0);
    }
  });

  it('9.7: the shared sheet is a 512x512 grid of six 128 px sprites', () => {
    expect(atlasCellCount()).toBe(16);
    const topLeft = spriteCellRect(0);
    expect(topLeft.u0).toBe(0);
    expect(topLeft.v1).toBe(1);
    const secondRow = spriteCellRect(4);
    expect(secondRow.v0).toBe(0.5);
    expect(secondRow.v1).toBe(0.75);
    expect(spriteCellRect(7).u1).toBe(1);
  });

  it('9.7/4.1: damage numbers are yellow effective, white neutral and grey resisted', () => {
    expect(damageColorFor(1.25)).toBe(DAMAGE_COLOR_EFFECTIVE);
    expect(damageColorFor(1.5)).toBe(DAMAGE_COLOR_EFFECTIVE);
    expect(damageColorFor(1)).toBe(DAMAGE_COLOR_NEUTRAL);
    expect(damageColorFor(0.75)).toBe(DAMAGE_COLOR_RESISTED);
    expect(damageColorFor(0.5)).toBe(DAMAGE_COLOR_RESISTED);
    // The 4.1 table itself is read from the data layer, never duplicated.
    expect(damageMultiplierFor('pierce', 'light')).toBe(
      rules.combat.damageMultipliers.pierce.light,
    );
    expect(damageMultiplierFor('arcane', 'spectral')).toBe(1.5);
    expect(damageMultiplierFor('blast', 'armored')).toBe(1.25);
  });

  it('9.7: damage numbers rise 0.6 units over 0.6 s and health bars are 0.6 wide', () => {
    expect(DAMAGE_NUMBER_RISE).toBe(0.6);
    expect(DAMAGE_NUMBER_LIFE_S).toBe(0.6);
    expect(HEALTH_BAR_WIDTH).toBe(0.6);
    expect(healthFraction(50, 100)).toBe(0.5);
    expect(healthFraction(-5, 100)).toBe(0);
    expect(healthFraction(150, 100)).toBe(1);
    expect(healthFraction(10, 0)).toBe(0);
  });

  it('9.7: screen shake is 0.05 units for 0.15 s on hits of 200 or more', () => {
    expect(SHAKE_AMPLITUDE).toBe(0.05);
    expect(SHAKE_DURATION_S).toBe(0.15);
    expect(SHAKE_HIT_THRESHOLD).toBe(200);
  });

  it('9.7: final-wave slow motion runs at 0.3x for 0.6 s', () => {
    expect(SLOW_MOTION_SCALE).toBe(0.3);
    expect(SLOW_MOTION_DURATION_S).toBe(0.6);
    expect(slowMotionSpeed(1)).toBeCloseTo(0.3);
    expect(slowMotionSpeed(2)).toBeCloseTo(0.6);
  });

  it('9.7: head heights clear the models (Ogre 1.4, flying enemies at 1.5)', () => {
    expect(unitHeadHeight('defender', 'iron_granny')).toBeLessThan(1.3);
    expect(unitHeadHeight('enemy', 'gloomling')).toBeLessThan(1.3);
    expect(unitHeadHeight('enemy', 'gloom_ogre')).toBeGreaterThan(1.4);
    expect(unitHeadHeight('enemy', 'bat_swarm')).toBe(FLYING_HEAD_HEIGHT);
    expect(FLYING_HEAD_HEIGHT).toBeGreaterThan(2);
  });
});

describe('Debug VFX helper (issue #75)', () => {
  it('reads a known VFX id or the shake trigger', () => {
    expect(readDebugVfx('?debugvfx=combo_steam')?.id).toBe('combo_steam');
    expect(readDebugVfx('?debugvfx=win_confetti')?.id).toBe('win_confetti');
    expect(readDebugVfx('?debugvfx=shake')).toEqual({ id: null, shake: true });
  });

  it('ignores a missing or malformed value like the other additive helpers', () => {
    expect(readDebugVfx('')).toBeNull();
    expect(readDebugVfx('?debugvfx=nope')).toBeNull();
    expect(readDebugVfx('?debugvfx=hit_pierce:0.5')).toBeNull();
    // The animation helper from #74 keeps working next to the VFX helper.
    expect(readDebugAnimationHold('?debuganim=spawn:0.3')?.progress).toBe(0.3);
  });
});
