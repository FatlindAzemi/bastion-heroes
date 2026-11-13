import type { DuelRulesDef } from './schemas';

/**
 * Duel rules and defaults (spec 18.1 to 18.7, 20.2). Card numbers live in the
 * `duel` block of each card file (18.8); everything else is here.
 */
export const duelRules: DuelRulesDef = {
  // 18.1: south owns columns 0-3, north 5-8, column 4 is the midline; base lines and raider spawns.
  board: {
    southColumns: [0, 1, 2, 3],
    northColumns: [5, 6, 7, 8],
    midlineColumn: 4,
    southBaseLineX: 0,
    northBaseLineX: 9,
    southRaiderSpawnX: 0.4,
    northRaiderSpawnX: 8.6,
  },
  // 18.2: 3 s countdown, 2:00 regular, 1:00 overdrive, up to 1:00 sudden death.
  match: { countdownS: 3, regularTimeS: 120, overdriveTimeS: 60, suddenDeathMaxS: 60 },
  // 18.3: start 5, max 10, 1 per 2.4 s, 1 per 1.2 s in overdrive and sudden death.
  essence: {
    startingEssence: 5,
    maxEssence: 10,
    regularIncomeIntervalS: 2.4,
    overdriveIncomeIntervalS: 1.2,
  },
  // 18.4: 8 different cards, hand of 4, at least 2 defenders and 2 raiders.
  deck: {
    deckSize: 8,
    handSize: 4,
    minDefenders: 2,
    minRaiders: 2,
    excludedCardIds: ['harbor_turtle', 'morvak'],
  },
  // 18.5, 18.6: speed x1.5, 1.0 s summon, block at 0.55, cap 12, burrower 3.0, ogre throw 3.
  raiders: {
    speedMultiplier: 1.5,
    summonDelayS: 1,
    raiderBlockDistance: 0.55,
    maxLivingRaiders: 12,
    burrowerSurfaceDistanceTiles: 3,
    ogreThrowDistanceTiles: 3,
    attackDamageMultiplier: 1,
  },
  // 18.6, 20.4: every card plays at card level 6 (Duel Standard).
  standard: { cardLevel: 6 },
  // 18.7: gate health 8, trap rolls at 8 tiles per second.
  gate: { gateHealth: 8, trapSpeedTilesPerS: 8 },
  // 20.2: arenas, trophy floors, unlocked cards and first-time chests.
  arenas: [
    {
      arena: 1,
      name: 'Brightvale Green',
      trophyFloor: 0,
      unlocksCardIds: [
        'sparkbolt_gremlin',
        'glowshroom_monk',
        'iron_granny',
        'boomcap_brewer',
        'gloomling',
        'pothead',
        'shade_wisp',
        'bat_swarm',
      ],
    },
    {
      arena: 2,
      name: 'Glowshroom Forest',
      trophyFloor: 300,
      unlocksCardIds: ['snowpup_yeti', 'rune_archer', 'shieldbearer', 'shadow_hound'],
      firstTimeChest: 'silver',
    },
    {
      arena: 3,
      name: 'Frozen Harbor',
      trophyFloor: 600,
      unlocksCardIds: ['snaptrap_bertie', 'venom_sprout', 'gloom_priest', 'burrower'],
      firstTimeChest: 'silver',
    },
    {
      arena: 4,
      name: 'Forge Mountain',
      trophyFloor: 1000,
      unlocksCardIds: ['battle_drummer', 'tesla_gnome', 'gloom_ogre'],
      firstTimeChest: 'gold',
    },
    {
      arena: 5,
      name: 'Gloom Citadel',
      trophyFloor: 1500,
      unlocksCardIds: [],
      firstTimeChest: 'gold',
    },
  ],
};
