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
      cost: 75,
      cooldownS: 7.5,
      startsReady: true,
      hp: 600,
      damage: 0,
      attackIntervalS: 14,
      element: 'none',
      firstOrbDelayS: 5,
      orbEssence: 70,
      star3Bonus: 'producer_orb_value_up',
      star3Params: { orbEssence: 90 },
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
      cost: 150,
      cooldownS: 7.5,
      startsReady: true,
      hp: 4200,
      damage: 85,
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
      cost: 75,
      cooldownS: 30,
      startsReady: false,
      hp: 10000,
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

/** Exact section 5.1 and 5.2 values of the M2 defenders (spec 1.1 rule 3). */
describe('M2 defender data (spec 5.1, 5.2)', () => {
  it('5.1/5.2: boomcap_brewer matches the spec', () => {
    expect(defenderById['boomcap_brewer']).toMatchObject({
      id: 'boomcap_brewer',
      name: 'Boomcap Brewer',
      faction: 'wildgrove',
      rarity: 'common',
      role: 'shooter',
      pattern: 'splash',
      cost: 150,
      cooldownS: 7.5,
      startsReady: true,
      hp: 4200,
      damage: 215,
      damageType: 'blast',
      attackIntervalS: 2.8,
      range: 9,
      splashRadius: 0.8,
      element: 'none',
      star3Bonus: 'splash_radius_up',
      star3Params: { splashRadius: 1.2 },
      milestone: 'M2',
    });
  });

  it('5.1/5.2: snowpup_yeti matches the spec', () => {
    expect(defenderById['snowpup_yeti']).toMatchObject({
      id: 'snowpup_yeti',
      name: 'Snowpup Yeti',
      faction: 'frost',
      rarity: 'common',
      role: 'shooter',
      pattern: 'straight',
      cost: 175,
      cooldownS: 7.5,
      startsReady: true,
      hp: 4200,
      damage: 85,
      damageType: 'pierce',
      attackIntervalS: 1.4,
      range: 9,
      element: 'frost',
      statusOnHit: { status: 'slow', durationS: 3, value: 0.5 },
      star3Bonus: 'slow_duration_up',
      star3Params: { slowDurationS: 5 },
      milestone: 'M2',
    });
  });

  it('5.1/5.2: rune_archer matches the spec', () => {
    expect(defenderById['rune_archer']).toMatchObject({
      id: 'rune_archer',
      name: 'Rune Archer',
      faction: 'neon',
      rarity: 'rare',
      role: 'shooter',
      pattern: 'straight',
      cost: 150,
      cooldownS: 7.5,
      startsReady: true,
      hp: 4200,
      damage: 155,
      damageType: 'arcane',
      attackIntervalS: 1.5,
      range: 9,
      hitsFlying: true,
      element: 'none',
      star3Bonus: 'piercing_arrow',
      star3Params: { extraHits: 1 },
      milestone: 'M2',
    });
  });

  it('5.1/5.2: pyro_fox matches the spec', () => {
    expect(defenderById['pyro_fox']).toMatchObject({
      id: 'pyro_fox',
      name: 'Pyro Fox',
      faction: 'wildgrove',
      rarity: 'epic',
      role: 'shooter',
      pattern: 'lob',
      cost: 175,
      cooldownS: 15,
      startsReady: false,
      hp: 4200,
      damage: 145,
      damageType: 'blast',
      attackIntervalS: 2,
      range: 6,
      element: 'fire',
      statusOnHit: { status: 'burn', durationS: 3, value: 6 },
      star3Bonus: 'fire_patch',
      star3Params: { firePatchRadiusTiles: 0.5, firePatchDurationS: 2 },
      milestone: 'M2',
    });
  });

  it('5.1/5.2: frost_witch matches the spec', () => {
    expect(defenderById['frost_witch']).toMatchObject({
      id: 'frost_witch',
      name: 'Frost Witch',
      faction: 'frost',
      rarity: 'epic',
      role: 'control',
      pattern: 'beam',
      cost: 200,
      cooldownS: 20,
      startsReady: false,
      hp: 4300,
      damage: 145,
      damageType: 'arcane',
      attackIntervalS: 2,
      range: 4,
      hitsFlying: true,
      element: 'frost',
      statusOnHit: { status: 'slow', durationS: 3, value: 0.5 },
      freezeEveryNthAttack: 4,
      star3Bonus: 'range_up',
      star3Params: { range: 6 },
      milestone: 'M2',
    });
  });
});
