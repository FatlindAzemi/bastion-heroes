import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data/rules';
import {
  AOE_COLORS,
  aoeRingAlpha,
  aoeRingScale,
  cooldownProgress,
  damageNumberAlpha,
  damageNumberColor,
  damageNumberPopScale,
  damageNumberRise,
  damageNumberScaleMultiplier,
  DAMAGE_COLOR_NEUTRAL,
  DAMAGE_COLOR_RESISTED,
  DAMAGE_NUMBER_BIG_THRESHOLD,
  DAMAGE_NUMBER_CRIT_SCALE,
  DAMAGE_NUMBER_LIFE_S,
  DAMAGE_NUMBER_MAX_SCALE,
  DAMAGE_NUMBER_POP_OVERSHOOT,
  DAMAGE_NUMBER_POP_START,
  DAMAGE_NUMBER_RISE,
  DAMAGE_TYPE_COLORS,
  impactFlashAlpha,
  impactFlashScale,
  mixColor,
  scaleColor,
  TARGET_RING_MIN_PROGRESS,
  TICK_RATE,
} from '../../src/render/vfx/juice';
import { readDebugJuice } from '../../src/render/vfx/debugJuice';
import { readDebugVfx } from '../../src/render/vfx/debugVfx';

/** Sum of the three colour channels, used to compare overall brightness. */
function brightness(color: number): number {
  return ((color >> 16) & 0xff) + ((color >> 8) & 0xff) + (color & 0xff);
}

describe('Damage numbers of the 2.5D relaunch (issue #114 §3)', () => {
  it('uses the requested colour per damage type', () => {
    expect(DAMAGE_TYPE_COLORS.pierce).toBe(0x22d3ee);
    expect(DAMAGE_TYPE_COLORS.blast).toBe(0xff8a2b);
    expect(DAMAGE_TYPE_COLORS.arcane).toBe(0x7c4dff);
  });

  it('keeps the 9.7 float values and raises the 4.1 effectiveness on top of the type colour', () => {
    expect(DAMAGE_NUMBER_RISE).toBe(0.6);
    expect(DAMAGE_NUMBER_LIFE_S).toBe(0.6);
    // A neutral hit keeps the pure type colour.
    expect(damageNumberColor('pierce', 1)).toBe(DAMAGE_TYPE_COLORS.pierce);
    // An effective hit is brighter than its base colour, a resisted hit dimmer.
    const base = brightness(DAMAGE_TYPE_COLORS.blast);
    expect(brightness(damageNumberColor('blast', 1.25))).toBeGreaterThan(base);
    expect(brightness(damageNumberColor('blast', 0.5))).toBeLessThan(base);
    // The resisted colour moves towards the spec 4.1 grey.
    expect(brightness(damageNumberColor('arcane', 0.75))).toBeLessThan(
      brightness(DAMAGE_TYPE_COLORS.arcane),
    );
    expect(DAMAGE_COLOR_NEUTRAL).toBe(0xffffff);
    expect(DAMAGE_COLOR_RESISTED).toBe(0x9aa0b0);
  });

  it('mixes colours channel-wise and clamps the mix amount', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, 2)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    // Scaling dims a colour and clamps the channels, used for resisted numbers.
    expect(scaleColor(0xffffff, 0.5)).toBe(0x808080);
    expect(scaleColor(0xffffff, 4)).toBe(0xffffff);
    expect(scaleColor(0x102030, 1)).toBe(0x102030);
  });

  it('draws crits and heavy hits bigger, clamped for readability', () => {
    expect(damageNumberScaleMultiplier(10, false)).toBe(1);
    expect(damageNumberScaleMultiplier(DAMAGE_NUMBER_BIG_THRESHOLD, false)).toBeGreaterThan(1);
    expect(damageNumberScaleMultiplier(10, true)).toBeCloseTo(DAMAGE_NUMBER_CRIT_SCALE);
    expect(damageNumberScaleMultiplier(999, true)).toBeLessThanOrEqual(DAMAGE_NUMBER_MAX_SCALE);
  });

  it('pops in from small over an overshoot and settles at 1.0', () => {
    expect(damageNumberPopScale(0)).toBeCloseTo(DAMAGE_NUMBER_POP_START);
    expect(damageNumberPopScale(0.16)).toBeCloseTo(DAMAGE_NUMBER_POP_OVERSHOOT);
    expect(damageNumberPopScale(0.38)).toBeCloseTo(1);
    expect(damageNumberPopScale(0.8)).toBe(1);
    expect(damageNumberPopScale(-1)).toBeCloseTo(DAMAGE_NUMBER_POP_START);
    expect(damageNumberPopScale(2)).toBe(1);
  });

  it('rises 0.6 units and fades out over the 0.6 s lifetime', () => {
    expect(damageNumberRise(0)).toBe(0);
    expect(damageNumberRise(1)).toBeCloseTo(0.6);
    expect(damageNumberRise(1)).toBeGreaterThan(damageNumberRise(0.5));
    expect(damageNumberAlpha(0)).toBe(1);
    expect(damageNumberAlpha(0.5)).toBe(1);
    expect(damageNumberAlpha(1)).toBe(0);
    expect(damageNumberAlpha(0.8)).toBeGreaterThan(0);
  });
});

describe('AOE rings and impact flash timing (issue #114 §3)', () => {
  it('offers the neon emerald / violet / gold palette', () => {
    expect(AOE_COLORS.emerald).toBe(0x2dffa0);
    expect(AOE_COLORS.violet).toBe(0xa64dff);
    expect(AOE_COLORS.gold).toBe(0xffcc00);
    expect(new Set(Object.values(AOE_COLORS)).size).toBe(Object.values(AOE_COLORS).length);
  });

  it('expands a ring from the impact point and fades it out', () => {
    expect(aoeRingScale(0, 0.3, 2.4)).toBeCloseTo(0.3);
    expect(aoeRingScale(1, 0.3, 2.4)).toBeCloseTo(2.4);
    expect(aoeRingScale(0.5, 0.3, 2.4)).toBeGreaterThan(1.35);
    expect(aoeRingScale(2, 0.3, 2.4)).toBeCloseTo(2.4);
    expect(aoeRingAlpha(0, 0.35)).toBe(1);
    expect(aoeRingAlpha(0.35, 0.35)).toBe(1);
    expect(aoeRingAlpha(1, 0.35)).toBe(0);
    expect(aoeRingAlpha(0.7, 0.35)).toBeGreaterThan(0);
  });

  it('snaps the impact flash out fast and fades it quickly', () => {
    expect(impactFlashScale(0)).toBeLessThan(impactFlashScale(1));
    expect(impactFlashAlpha(0)).toBe(1);
    expect(impactFlashAlpha(1)).toBe(0);
    expect(impactFlashAlpha(0.5)).toBeLessThan(0.5);
  });
});

describe('Target progress rings (issue #114 §3)', () => {
  it('maps an attack cooldown from just-fired to ready', () => {
    expect(cooldownProgress(30, 0, 30)).toBe(0);
    expect(cooldownProgress(15, 0, 30)).toBeCloseTo(0.5);
    expect(cooldownProgress(0, 0, 30)).toBe(1);
    expect(cooldownProgress(0, 30, 30)).toBe(1);
    expect(cooldownProgress(30, 30, 0)).toBe(0);
    expect(cooldownProgress(Number.NaN, 0, 30)).toBe(0);
  });

  it('uses the sim tick rate and the chosen visibility threshold', () => {
    expect(TICK_RATE).toBe(rules.tick.tickRate);
    expect(TICK_RATE).toBe(30);
    expect(TARGET_RING_MIN_PROGRESS).toBeGreaterThan(0);
    expect(TARGET_RING_MIN_PROGRESS).toBeLessThan(0.5);
  });
});

describe('Debug juice helper (issue #114 §3)', () => {
  it('reads the three showcase modes and ignores malformed values', () => {
    expect(readDebugJuice('?debugjuice=numbers')).toBe('numbers');
    expect(readDebugJuice('?debugjuice=rings')).toBe('rings');
    expect(readDebugJuice('?debugjuice=flash')).toBe('flash');
    expect(readDebugJuice('')).toBeNull();
    expect(readDebugJuice('?debugjuice=')).toBeNull();
    expect(readDebugJuice('?debugjuice=nope')).toBeNull();
    // The previous debug helper keeps parsing independently of the new one.
    expect(readDebugVfx('?debugvfx=hit_blast')?.id).toBe('hit_blast');
  });
});
