import type { RulesDef } from './schemas';

/**
 * Global gameplay rules and defaults (spec section 3 intro: "Every number below
 * is a default stored in src/data/rules.ts"; combat numbers from section 4).
 * The sim, the renderer and the UI read these values instead of hardcoding
 * balance numbers (spec 1.1 rule 7). Later milestones add their own groups.
 */
export const rules: RulesDef = {
  // 3.1: 5 lanes x 9 columns, 1 tile = 1.0 world unit, base at x = 0, spawn at x = 9.6.
  grid: { laneCount: 5, columnCount: 9, tileSize: 1, baseLineX: 0, enemySpawnX: 9.6 },
  // 3.2: fixed 30 ticks per second, 1x and 2x game speed.
  tick: { tickRate: 30, gameSpeeds: [1, 2] },
  // 3.3: Essence starting value, sky drops, orb lifetime, collection and maximum.
  essence: {
    startingEssence: 150,
    skyDropAmount: 25,
    skyDropIntervalS: 8,
    firstSkyDropDelayS: 4,
    skyDropFallTimeS: 1,
    orbLifetimeS: 8,
    orbCollectFlightTimeS: 0.4,
    maxEssence: 9990,
    autoCollectDelayS: 1,
  },
  // 3.4: a placed defender becomes active after 0.5 s.
  placement: { defenderActivationDelayS: 0.5 },
  // 3.6: star multipliers, model scales and producer interval divisors.
  merge: {
    star2HealthMultiplier: 1.6,
    star2DamageMultiplier: 1.6,
    star3HealthMultiplier: 2.5,
    star3DamageMultiplier: 2.5,
    star2Scale: 1.12,
    star3Scale: 1.25,
    producerStar2IntervalDivisor: 1.5,
    producerStar3IntervalDivisor: 2,
  },
  // 3.8: an enemy is blocked within 0.55 units of a defender.
  blocking: { blockDistance: 0.55 },
  // 3.9: Last Stand Trap path, speed and boss damage.
  trap: { trapStartX: -0.4, trapEndX: 10, trapSpeedTilesPerS: 8, trapBossDamage: 400 },
  // 3.9: an enemy crossing this line in a lane with a used trap loses the level.
  loss: { lossLineX: -0.3 },
  // 3.10 and 7.1 rule 5: wave timing defaults.
  waves: {
    firstWaveDelayS: 20,
    earlyClearDelayS: 3,
    bigWaveWarningS: 3,
    defaultWaveDurationS: 25,
    defaultSpawnGapS: 3,
  },
  // 3.11: a 3-star win uses no trap and loses at most 2 defenders.
  rating: { threeStarMaxDefendersLost: 2 },
  // 4.1 damage table, 4.2 damage formula, 4.3 pattern values, 4.4 targeting.
  combat: {
    damageMultipliers: {
      pierce: { light: 1.25, armored: 0.5, spectral: 1 },
      blast: { light: 1, armored: 1.25, spectral: 0.5 },
      arcane: { light: 0.75, armored: 1, spectral: 1.5 },
    },
    cardLevelMultiplierPerLevel: 0.08,
    minimumDamage: 1,
    straightProjectileSpeedTilesPerS: 6,
    meleeRangeTiles: 1.2,
    lobFlightTimeS: 0.8,
    targetingBehindOffsetTiles: 0.3,
    // 4.3: splash deals 50 % of its damage to the other enemies inside the radius.
    splashSecondaryDamageRatio: 0.5,
    // 4.3: diagonal projectiles switch lane once, 1 tile after spawning.
    diagonalLaneSwitchTiles: 1,
  },
};
