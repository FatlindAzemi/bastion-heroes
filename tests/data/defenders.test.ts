import { describe, expect, it } from 'vitest';

import { defenderById } from '../../src/data';

/** Exact section 5.1 and 5.2 values of the M1 defenders (spec 1.1 rule 3). */
describe('M1 defender data (spec 5.1, 5.2)', () => {
  it('5.1/5.2: glowshroom_monk matches the spec', () => {
    expect(defenderById['glowshroom_monk']).toMatchObject({
      id: 'glowshroom_monk',
      name: 'Glowshroom Monk',
      faction: 'wildgrove',
      rarity: 'common',
      role: 'producer',
      pattern: 'producer',
      cost: 50,
      cooldownS: 7.5,
      startsReady: true,
      hp: 300,
      damage: 0,
      attackIntervalS: 24,
      element: 'none',
      firstOrbDelayS: 7,
      orbEssence: 25,
      star3Bonus: 'producer_orb_value_up',
      star3Params: { orbEssence: 35 },
      milestone: 'M2',
    });
    expect(defenderById['glowshroom_monk']?.damageType).toBeUndefined();
    expect(defenderById['glowshroom_monk']?.range).toBeUndefined();
  });

  it('5.1/5.2: sparkbolt_gremlin matches the spec', () => {
    expect(defenderById['sparkbolt_gremlin']).toMatchObject({
      id: 'sparkbolt_gremlin',
      name: 'Sparkbolt Gremlin',
      faction: 'forge',
      rarity: 'common',
      role: 'shooter',
      pattern: 'straight',
      cost: 100,
      cooldownS: 7.5,
      startsReady: true,
      hp: 300,
      damage: 20,
      damageType: 'pierce',
      attackIntervalS: 1.4,
      range: 9,
      element: 'none',
      star3Bonus: 'double_bolt',
      star3Params: { boltCount: 2, boltGapSeconds: 0.15 },
      milestone: 'M2',
    });
  });

  it('5.1/5.2: iron_granny matches the spec', () => {
    expect(defenderById['iron_granny']).toMatchObject({
      id: 'iron_granny',
      name: 'Iron Granny',
      faction: 'forge',
      rarity: 'rare',
      role: 'wall',
      pattern: 'wall',
      cost: 50,
      cooldownS: 30,
      startsReady: false,
      hp: 4000,
      damage: 0,
      element: 'none',
      crackedArmorRatios: [0.66, 0.33],
      star3Bonus: 'reflect_melee',
      star3Params: { reflectRatio: 0.2 },
      milestone: 'M2',
    });
    expect(defenderById['iron_granny']?.damageType).toBeUndefined();
    expect(defenderById['iron_granny']?.attackIntervalS).toBeUndefined();
    expect(defenderById['iron_granny']?.range).toBeUndefined();
  });
});
