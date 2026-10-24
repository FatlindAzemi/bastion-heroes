import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data';
import { RulesDef } from '../../src/data/schemas';

/**
 * The section 3 defaults and the section 4 combat numbers live in
 * `src/data/rules.ts` (spec 3 intro, 1.1 rule 7); these tests spot-check them
 * against the spec tables.
 */
describe('rules data (spec 3, 4)', () => {
  it('11.5: rules parse with RulesDef', () => {
    expect(() => RulesDef.parse(rules)).not.toThrow();
  });

  it('3.1/3.2: grid and tick values match the spec', () => {
    expect(rules.grid).toEqual({
      laneCount: 5,
      columnCount: 9,
      tileSize: 1,
      baseLineX: 0,
      enemySpawnX: 9.6,
    });
    expect(rules.tick).toEqual({ tickRate: 30, gameSpeeds: [1, 2] });
  });

  it('3.3: Essence values match the spec', () => {
    expect(rules.essence).toEqual({
      startingEssence: 150,
      skyDropAmount: 25,
      skyDropIntervalS: 8,
      firstSkyDropDelayS: 4,
      skyDropFallTimeS: 1,
      orbLifetimeS: 8,
      orbCollectFlightTimeS: 0.4,
      maxEssence: 9990,
      autoCollectDelayS: 1,
    });
  });

  it('3.4/3.6: placement, merge and model-scale values match the spec', () => {
    expect(rules.placement).toEqual({ defenderActivationDelayS: 0.5 });
    expect(rules.merge).toEqual({
      maxStars: 3,
      star2HealthMultiplier: 1.6,
      star2DamageMultiplier: 1.6,
      star3HealthMultiplier: 2.5,
      star3DamageMultiplier: 2.5,
      star2Scale: 1.12,
      star3Scale: 1.25,
      producerStar2IntervalDivisor: 1.5,
      producerStar3IntervalDivisor: 2,
    });
  });

  it('3.8/3.9: blocking, trap and loss-line values match the spec', () => {
    expect(rules.blocking).toEqual({ blockDistance: 0.55 });
    expect(rules.trap).toEqual({
      trapStartX: -0.4,
      trapEndX: 10,
      trapSpeedTilesPerS: 8,
      trapBossDamage: 400,
    });
    expect(rules.loss).toEqual({ lossLineX: -0.3 });
  });

  it('3.10/7.1 rule 5: wave defaults match the spec', () => {
    expect(rules.waves).toEqual({
      firstWaveDelayS: 20,
      earlyClearDelayS: 3,
      bigWaveWarningS: 3,
      defaultWaveDurationS: 25,
      defaultSpawnGapS: 3,
    });
  });

  it('3.11: a 3-star win loses at most 2 defenders', () => {
    expect(rules.rating).toEqual({ threeStarMaxDefendersLost: 2 });
  });

  it('4.1/4.2/4.3/4.4: combat values match the spec', () => {
    expect(rules.combat.damageMultipliers).toEqual({
      pierce: { light: 1.25, armored: 0.5, spectral: 1 },
      blast: { light: 1, armored: 1.25, spectral: 0.5 },
      arcane: { light: 0.75, armored: 1, spectral: 1.5 },
    });
    expect(rules.combat.cardLevelMultiplierPerLevel).toBe(0.08);
    expect(rules.combat.minimumDamage).toBe(1);
    expect(rules.combat.straightProjectileSpeedTilesPerS).toBe(6);
    expect(rules.combat.meleeRangeTiles).toBe(1.2);
    expect(rules.combat.lobFlightTimeS).toBe(0.8);
    expect(rules.combat.targetingBehindOffsetTiles).toBe(0.3);
    expect(rules.combat.splashSecondaryDamageRatio).toBe(0.5);
    expect(rules.combat.diagonalLaneSwitchTiles).toBe(1);
  });

  it('4.5: status effect values match the spec', () => {
    expect(rules.status.slow).toEqual({
      moveSpeedMultiplier: 0.5,
      attackSpeedMultiplier: 0.5,
      durationS: 3,
    });
    expect(rules.status.freeze).toEqual({ durationS: 2 });
    expect(rules.status.burn).toEqual({
      damage: 6,
      damageType: 'blast',
      intervalS: 0.5,
      durationS: 3,
    });
    expect(rules.status.poison).toEqual({
      maxHealthRatio: 0.02,
      intervalS: 1,
      durationS: 4,
      maxStacks: 3,
    });
    expect(rules.status.knockback).toEqual({ durationS: 0.2 });
  });

  it('4.6: combo values match the spec', () => {
    expect(rules.combos.sameComboCooldownS).toBe(2);
    expect(rules.combos.steam).toEqual({
      burstDamage: 60,
      burstDamageType: 'blast',
      radiusTiles: 1,
      stunDurationS: 0.5,
    });
    expect(rules.combos.shatter).toEqual({ damageMultiplier: 2 });
    expect(rules.combos.toxic).toEqual({ radiusTiles: 1, poisonStacks: 1 });
    expect(rules.combos.chain).toEqual({
      jumpDamage: 40,
      jumpDamageType: 'arcane',
      radiusTiles: 2,
    });
  });
});
