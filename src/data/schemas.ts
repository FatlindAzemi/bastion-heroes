/**
 * Zod schemas for every game definition (spec 11.5). Each data file in
 * `src/data/` exports one object that is parsed with its schema by
 * `npm run validate-data` and by the tests in `tests/data/` (spec 10.3, 11.5,
 * 16.1). Field names are fixed by spec 11.5.
 *
 * Fields marked "extension" store a value that sections 5 and 6 list but spec
 * 11.5 has no field for; spec 11.5's last paragraph allows adding them in the
 * same pull request. They are listed in the pull request description.
 */
import { z } from 'zod';

/** Lane index on the 5-lane grid, 0 = top lane (spec 3.1). */
const laneIndex = z.number().int().min(0).max(4);

/** Column index on the 9-column grid, 0 = next to the base (spec 3.1). */
const columnIndex = z.number().int().min(0).max(8);

/** The two sides of a Duel (spec 18.1). */
export const duelSide = z.enum(['south', 'north']);

/**
 * The `duel` block of a card file (spec 18, 18.8): kind, Duel cost and the
 * Duel-only changes. Health, damage, intervals and ranges of the campaign
 * def apply unless a field here overrides them.
 */
export const DuelCardDef = z.object({
  kind: z.enum(['defender', 'raider']),
  cost: z.number().int().positive(),
  /** Overrides the campaign `hp` in the Duel (Iron Granny: 2400). */
  hp: z.number().int().positive().optional(),
  /** Overrides the campaign `damage` in the Duel (Snaptrap Bertie: 900). */
  damage: z.number().int().positive().optional(),
  /** Overrides the campaign trap arm delay (Snaptrap Bertie: 6 s). */
  armDelayS: z.number().positive().optional(),
  /** Producer: Essence added per pulse at ★1 to ★3 (Glowshroom Monk, 18.8). */
  producer: z
    .object({
      essence: z.number().int().positive(),
      firstDelayS: z.number().positive(),
      intervalSByStar: z.tuple([
        z.number().positive(),
        z.number().positive(),
        z.number().positive(),
      ]),
    })
    .optional(),
  /** Maximum copies of this defender on one side (King Borrowbones, Aurora Dragon: 1). */
  maxPerPlayer: z.number().int().positive().optional(),
  /** Raider: how many units one card summons (Gloomling: 2). */
  summonCount: z.number().int().positive().optional(),
  /** Raider: seconds between two summoned units (Gloomling: 0.6). */
  summonGapS: z.number().positive().optional(),
  /** Raider: health of the enemy gate removed when this raider reaches the base line. */
  gateDamage: z.number().int().positive().optional(),
});

/** A parsed Duel card block (spec 18.8). */
export type DuelCardDef = z.infer<typeof DuelCardDef>;

/**
 * A defender definition (spec 11.5). Stats are section 5.1, the attack pattern
 * and bonuses are section 5.2; all values are card level 1 and ★1.
 */
export const DefenderDef = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  faction: z.enum(['forge', 'wildgrove', 'neon', 'frost', 'hollow']),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary', 'mythic']),
  role: z.enum(['producer', 'shooter', 'wall', 'control', 'support', 'trap']),
  cost: z.number().int().positive(),
  cooldownS: z.number().positive(),
  startsReady: z.boolean(),
  hp: z.number().int().positive(),
  pattern: z.enum([
    'straight',
    'lob',
    'splash',
    'beam',
    'diagonal',
    'melee',
    'aura',
    'producer',
    'trap',
    'wall',
  ]),
  damage: z.number().int().nonnegative(),
  damageType: z.enum(['pierce', 'blast', 'arcane']).optional(),
  attackIntervalS: z.number().positive().optional(),
  range: z.number().positive().optional(),
  /** Extension: splash impact radius in tiles (section 4.3, Boomcap Brewer 0.8 in 5.2). */
  splashRadius: z.number().positive().optional(),
  /** Extension: true when the pattern can hit flying enemies (section 4.4, 5.2 hitsFlying). */
  hitsFlying: z.boolean().optional(),
  /** Extension: the damage buff an aura defender gives the adjacent tiles (section 4.3/5.2). */
  buff: z.object({ name: z.string(), damageRatio: z.number().positive() }).optional(),
  /** Extension: seconds a trap defender needs to arm (section 4.3, Snaptrap Bertie 12 s in 5.2). */
  armDelayS: z.number().positive().optional(),
  /** Extension: seconds a ★3 trap needs to rearm (section 4.3, Snaptrap Bertie 20 s in 5.2). */
  rearmS: z.number().positive().optional(),
  /** Extension: the Element column of section 5.2 (used by the combos of 4.6). */
  element: z.enum(['fire', 'frost', 'storm', 'poison', 'none']),
  statusOnHit: z
    .object({ status: z.string(), durationS: z.number(), value: z.number() })
    .optional(),
  /** Extension: every N-th attack applies Freeze instead of `statusOnHit` (section 5.2 Frost Witch). */
  freezeEveryNthAttack: z.number().int().positive().optional(),
  /** Extension: seconds until the first producer orb (section 5.2 special rules). */
  firstOrbDelayS: z.number().positive().optional(),
  /** Extension: Essence value of one producer orb (section 5.2 special rules). */
  orbEssence: z.number().int().positive().optional(),
  /** Extension: health ratios at which a wall shows cracked armor (section 5.2). */
  crackedArmorRatios: z.array(z.number().positive().max(1)).optional(),
  star3Bonus: z.string(),
  /** Extension: numeric values of the ★3 bonus named by `star3Bonus` (section 5.2). */
  star3Params: z.record(z.string(), z.number()).optional(),
  /**
   * Extension: highest star level (default 3); 1 is the no-merge seam of the
   * "Cannot be merged" defenders (Aurora, section 5.2), set by M7 data.
   */
  maxStars: z.number().int().min(1).max(3).optional(),
  /**
   * The Duel block of spec 18.8: kind, Duel cost and Duel-only changes. Optional in the
   * schema so campaign test fixtures stay valid; a test requires it on every registry card.
   */
  duel: DuelCardDef.optional(),
  milestone: z.enum(['M1', 'M2', 'M7']),
});

/** A parsed and validated defender definition (spec 11.5). */
export type DefenderDef = z.infer<typeof DefenderDef>;

/**
 * An enemy definition (spec 11.5). Values are section 6.1, behavior notes are
 * section 6.2.
 */
export const EnemyDef = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().int().positive(),
  armor: z.enum(['light', 'armored', 'spectral']),
  speed: z.number().positive(),
  /** Attack damage; 0 for enemies that cannot attack (Bat Swarm's "—", spec 6.1). */
  biteDamage: z.number().int().nonnegative(),
  /** Attack interval; omitted for enemies that cannot attack (Bat Swarm's "—", spec 6.1). */
  biteIntervalS: z.number().positive().optional(),
  /** Extension: the Flying column of section 6.1 has no field in spec 11.5. */
  isFlying: z.boolean().default(false),
  special: z.string().optional(),
  /** Extension: the shield of section 6.2 (Shieldbearer: 600). */
  shieldHp: z.number().int().positive().optional(),
  /** Extension: the armor type of that shield (Shieldbearer: Armored). */
  shieldArmor: z.enum(['light', 'armored', 'spectral']).optional(),
  /** Extension: health at which the armor breaks (Pot-Head Gloomling: 200, section 6.2). */
  armorBreakHp: z.number().int().positive().optional(),
  /** Extension: armor type after the break (Pot-Head Gloomling: Light, section 6.2). */
  armorAfterBreak: z.enum(['light', 'armored', 'spectral']).optional(),
  /** Extension: health restored by one heal pulse (Gloom Priest: 60, section 6.2). */
  healAmount: z.number().int().positive().optional(),
  /** Extension: heal radius in tiles (Gloom Priest: 1.5, section 6.2). */
  healRadiusTiles: z.number().positive().optional(),
  /** Extension: seconds between two heal pulses (Gloom Priest: 3.0, section 6.2). */
  healIntervalS: z.number().positive().optional(),
  /** Extension: health ratio at which the throw triggers (Gloom Ogre: 0.5, section 6.2). */
  throwAtHealthRatio: z.number().positive().max(1).optional(),
  /** Extension: the enemy thrown by that trigger (Gloom Ogre: gloomling, section 6.2). */
  throwEnemyId: z.string().optional(),
  /** Extension: how many tiles the thrown enemy lands forward (Gloom Ogre: 3, section 6.2). */
  throwDistanceTiles: z.number().positive().optional(),
  isBoss: z.boolean().default(false),
  /** The Duel block of spec 18.8; absent for cards that are not Duel cards (Morvak). */
  duel: DuelCardDef.optional(),
  /** Extension: the "Build in" column of section 6.1, like DefenderDef.milestone. */
  milestone: z.enum(['M1', 'M2', 'M7']),
});

/** A parsed and validated enemy definition (spec 11.5). */
export type EnemyDef = z.infer<typeof EnemyDef>;

/** The damage-type vs armor-type multipliers of the 3x3 combat table (spec 4.1). */
const damageAgainstArmor = z.object({
  light: z.number().positive(),
  armored: z.number().positive(),
  spectral: z.number().positive(),
});

/**
 * Global gameplay rules and defaults (spec section 3 intro: "Every number below
 * is a default stored in src/data/rules.ts"; combat numbers from section 4).
 * Sim, render and UI code import these values instead of hardcoding balance
 * numbers (spec 1.1 rule 7). Later milestones add their own groups.
 */
export const RulesDef = z.object({
  grid: z.object({
    laneCount: z.number().int().positive(),
    columnCount: z.number().int().positive(),
    tileSize: z.number().positive(),
    baseLineX: z.number(),
    enemySpawnX: z.number(),
  }),
  tick: z.object({
    tickRate: z.number().int().positive(),
    gameSpeeds: z.array(z.number().positive()).min(1),
  }),
  essence: z.object({
    startingEssence: z.number().int().nonnegative(),
    skyDropAmount: z.number().int().positive(),
    skyDropIntervalS: z.number().positive(),
    firstSkyDropDelayS: z.number().nonnegative(),
    skyDropFallTimeS: z.number().positive(),
    orbLifetimeS: z.number().positive(),
    orbCollectFlightTimeS: z.number().nonnegative(),
    maxEssence: z.number().int().positive(),
    autoCollectDelayS: z.number().nonnegative(),
  }),
  placement: z.object({
    defenderActivationDelayS: z.number().nonnegative(),
  }),
  merge: z.object({
    /** Highest star level of spec 3.6 (★3). */
    maxStars: z.number().int().min(1).max(3),
    star2HealthMultiplier: z.number().positive(),
    star2DamageMultiplier: z.number().positive(),
    star3HealthMultiplier: z.number().positive(),
    star3DamageMultiplier: z.number().positive(),
    star2Scale: z.number().positive(),
    star3Scale: z.number().positive(),
    producerStar2IntervalDivisor: z.number().positive(),
    producerStar3IntervalDivisor: z.number().positive(),
  }),
  blocking: z.object({
    blockDistance: z.number().positive(),
  }),
  trap: z.object({
    trapStartX: z.number(),
    trapEndX: z.number(),
    trapSpeedTilesPerS: z.number().positive(),
    trapBossDamage: z.number().int().positive(),
  }),
  loss: z.object({
    lossLineX: z.number(),
  }),
  waves: z.object({
    firstWaveDelayS: z.number().nonnegative(),
    earlyClearDelayS: z.number().nonnegative(),
    bigWaveWarningS: z.number().nonnegative(),
    defaultWaveDurationS: z.number().positive(),
    defaultSpawnGapS: z.number().positive(),
  }),
  rating: z.object({
    threeStarMaxDefendersLost: z.number().int().nonnegative(),
  }),
  combat: z.object({
    damageMultipliers: z.object({
      pierce: damageAgainstArmor,
      blast: damageAgainstArmor,
      arcane: damageAgainstArmor,
    }),
    cardLevelMultiplierPerLevel: z.number().positive(),
    minimumDamage: z.number().int().positive(),
    straightProjectileSpeedTilesPerS: z.number().positive(),
    meleeRangeTiles: z.number().positive(),
    lobFlightTimeS: z.number().positive(),
    targetingBehindOffsetTiles: z.number().positive(),
    /** Section 4.3 splash: 50 % of the hit damage to the other enemies in the radius. */
    splashSecondaryDamageRatio: z.number().positive(),
    /** Section 4.3 diagonal: the projectiles switch lane once, this many tiles after spawning. */
    diagonalLaneSwitchTiles: z.number().positive(),
  }),
  /** Section 4.5: the enemy status effects (effect, duration, stacking). */
  status: z.object({
    slow: z.object({
      moveSpeedMultiplier: z.number().positive(),
      attackSpeedMultiplier: z.number().positive(),
      durationS: z.number().positive(),
    }),
    freeze: z.object({ durationS: z.number().positive() }),
    burn: z.object({
      damage: z.number().int().positive(),
      damageType: z.literal('blast'),
      intervalS: z.number().positive(),
      durationS: z.number().positive(),
    }),
    poison: z.object({
      maxHealthRatio: z.number().positive(),
      intervalS: z.number().positive(),
      durationS: z.number().positive(),
      maxStacks: z.number().int().positive(),
    }),
    knockback: z.object({ durationS: z.number().positive() }),
  }),
  /** Section 4.6: the elemental combos (trigger effects, radii, damage and cooldown). */
  combos: z.object({
    sameComboCooldownS: z.number().positive(),
    steam: z.object({
      burstDamage: z.number().int().positive(),
      burstDamageType: z.literal('blast'),
      radiusTiles: z.number().positive(),
      stunDurationS: z.number().positive(),
    }),
    shatter: z.object({ damageMultiplier: z.number().positive() }),
    toxic: z.object({
      radiusTiles: z.number().positive(),
      poisonStacks: z.number().int().positive(),
    }),
    chain: z.object({
      jumpDamage: z.number().int().positive(),
      jumpDamageType: z.literal('arcane'),
      radiusTiles: z.number().positive(),
    }),
  }),
});

/** A parsed and validated rules definition (spec 3, 4). */
export type RulesDef = z.infer<typeof RulesDef>;

/** Tile terrain types (spec 3.1). */
const terrainType = z.enum(['normal', 'water', 'lava', 'rock', 'highGround']);

/** One terrain override on the grid (spec 7.1). */
const terrainTile = z.object({ lane: laneIndex, col: columnIndex, type: terrainType });

/** One enemy group inside a wave (spec 7.1). */
const waveSpawn = z.object({
  enemy: z.string(),
  count: z.number().int().positive(),
  lanes: z.union([z.literal('random'), z.array(laneIndex).min(1)]),
});

/** One wave of a level (spec 7.1). Missing fields use the defaults of 7.1 rule 5. */
const wave = z.object({
  flag: z.enum(['none', 'big', 'final']).default('none'),
  // Duration 0 is valid: the final wave ends when every enemy is dead (7.1 rule 4).
  duration: z.number().nonnegative().default(25),
  spawnGap: z.number().positive().default(3),
  spawns: z.array(waveSpawn),
});

/** Rewards for finishing a level (spec 7.1, 7.3). */
const levelRewards = z.object({
  gold: z.number().int().nonnegative(),
  firstClearChest: z.enum(['wooden', 'silver', 'gold']).optional(),
  unlockDefender: z.string().optional(),
  /**
   * Extension: true when the first clear opens the free 6-slot loadout (spec 7.2
   * row 4, W1-L04 "unlocks free loadout"); spec 11.5 has no field for it.
   */
  unlockFreeLoadout: z.boolean().optional(),
});

/**
 * A level definition (spec 7.1). Level files live in `src/data/levels/`; the
 * first one arrives with issue #27.
 */
export const LevelDef = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  world: z.number().int().positive(),
  number: z.number().int().positive(),
  name: z.string(),
  activeLanes: z.array(laneIndex),
  startEssence: z.number().int().nonnegative(),
  skyDrops: z.boolean(),
  terrain: z.array(terrainTile).default([]),
  loadoutSlots: z.number().int().min(1).max(6),
  fixedLoadout: z.array(z.string()).nullable().default(null),
  firstWaveDelay: z.number().positive().default(20),
  waves: z.array(wave).min(1),
  rewards: levelRewards,
  seed: z.number().int(),
});

/** A parsed and validated level definition (spec 7.1). */
export type LevelDef = z.infer<typeof LevelDef>;

/**
 * Duel rules and defaults (spec 18.1 to 18.7, 20.2): every number of the Duel
 * that is not a card number. Read by the Duel sim and the Duel UI.
 */
export const DuelRulesDef = z.object({
  board: z.object({
    southColumns: z.array(columnIndex).min(1),
    northColumns: z.array(columnIndex).min(1),
    midlineColumn: columnIndex,
    southBaseLineX: z.number(),
    northBaseLineX: z.number(),
    southRaiderSpawnX: z.number(),
    northRaiderSpawnX: z.number(),
  }),
  match: z.object({
    countdownS: z.number().positive(),
    regularTimeS: z.number().positive(),
    overdriveTimeS: z.number().positive(),
    suddenDeathMaxS: z.number().positive(),
  }),
  essence: z.object({
    startingEssence: z.number().int().nonnegative(),
    maxEssence: z.number().int().positive(),
    regularIncomeIntervalS: z.number().positive(),
    overdriveIncomeIntervalS: z.number().positive(),
  }),
  deck: z.object({
    deckSize: z.number().int().positive(),
    handSize: z.number().int().positive(),
    minDefenders: z.number().int().nonnegative(),
    minRaiders: z.number().int().nonnegative(),
    excludedCardIds: z.array(z.string()),
  }),
  raiders: z.object({
    speedMultiplier: z.number().positive(),
    summonDelayS: z.number().positive(),
    raiderBlockDistance: z.number().positive(),
    maxLivingRaiders: z.number().int().positive(),
    burrowerSurfaceDistanceTiles: z.number().positive(),
    ogreThrowDistanceTiles: z.number().positive(),
    /** Raider attacks ignore the 4.1 damage/armor table (18.6). */
    attackDamageMultiplier: z.number().positive(),
  }),
  standard: z.object({
    cardLevel: z.number().int().min(1),
  }),
  gate: z.object({
    gateHealth: z.number().int().positive(),
    trapSpeedTilesPerS: z.number().positive(),
  }),
  arenas: z
    .array(
      z.object({
        arena: z.number().int().positive(),
        name: z.string(),
        trophyFloor: z.number().int().nonnegative(),
        unlocksCardIds: z.array(z.string()),
        firstTimeChest: z.enum(['silver', 'gold']).optional(),
      }),
    )
    .min(1),
});

/** A parsed Duel rules definition (spec 18, 20.2). */
export type DuelRulesDef = z.infer<typeof DuelRulesDef>;
