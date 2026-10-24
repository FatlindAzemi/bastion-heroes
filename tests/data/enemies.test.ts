import { describe, expect, it } from 'vitest';

import { enemyById } from '../../src/data';

/** Exact section 6.1 values of the seven M1+M2 enemies (spec 1.1 rule 3). */
describe('M1 enemy data (spec 6.1)', () => {
  it('6.1: gloomling matches the spec', () => {
    expect(enemyById['gloomling']).toMatchObject({
      id: 'gloomling',
      name: 'Gloomling',
      armor: 'light',
      hp: 3000,
      speed: 0.11,
      biteDamage: 50,
      biteIntervalS: 0.5,
      isFlying: false,
      isBoss: false,
      milestone: 'M1',
    });
    // 6.2: the gloomling is the baseline walker, it has no special behavior.
    expect(enemyById['gloomling']?.special).toBeUndefined();
  });
});

describe('M2 enemy data (spec 6.1, 6.2)', () => {
  it('6.1/6.2: pothead matches the spec and breaks its armor at 200 hp', () => {
    expect(enemyById['pothead']).toMatchObject({
      id: 'pothead',
      name: 'Pot-Head Gloomling',
      armor: 'armored',
      hp: 4500,
      speed: 0.11,
      biteDamage: 50,
      biteIntervalS: 0.5,
      isFlying: false,
      special: 'pot_armor',
      armorBreakHp: 200,
      armorAfterBreak: 'light',
      isBoss: false,
      milestone: 'M2',
    });
  });

  it('6.1/6.2: shieldbearer matches the spec with a 600 Armored shield', () => {
    expect(enemyById['shieldbearer']).toMatchObject({
      id: 'shieldbearer',
      name: 'Shieldbearer',
      armor: 'light',
      hp: 2000,
      speed: 0.1,
      biteDamage: 50,
      biteIntervalS: 0.5,
      isFlying: false,
      special: 'directional_shield',
      shieldHp: 1200,
      shieldArmor: 'armored',
      isBoss: false,
      milestone: 'M2',
    });
  });

  it('6.1/6.2: shade_wisp matches the spec and is not flying', () => {
    expect(enemyById['shade_wisp']).toMatchObject({
      id: 'shade_wisp',
      name: 'Shade Wisp',
      armor: 'spectral',
      hp: 2000,
      speed: 0.13,
      biteDamage: 45,
      biteIntervalS: 0.5,
      isFlying: false,
      isBoss: false,
      milestone: 'M2',
    });
    expect(enemyById['shade_wisp']?.special).toBeUndefined();
  });

  it('6.1/6.2: bat_swarm matches the spec, flies and has no attack ("—")', () => {
    expect(enemyById['bat_swarm']).toMatchObject({
      id: 'bat_swarm',
      name: 'Bat Swarm',
      armor: 'light',
      hp: 120,
      speed: 0.1,
      biteDamage: 0,
      isFlying: true,
      isBoss: false,
      milestone: 'M2',
    });
    expect(enemyById['bat_swarm']?.biteIntervalS).toBeUndefined();
    expect(enemyById['bat_swarm']?.special).toBeUndefined();
  });

  it('6.1/6.2: gloom_priest matches the spec with its 3 s / 1.5 tile / 60 heal', () => {
    expect(enemyById['gloom_priest']).toMatchObject({
      id: 'gloom_priest',
      name: 'Gloom Priest',
      armor: 'spectral',
      hp: 2200,
      speed: 0.09,
      biteDamage: 45,
      biteIntervalS: 0.5,
      isFlying: false,
      special: 'gloom_priest_heal',
      healAmount: 80,
      healRadiusTiles: 1.5,
      healIntervalS: 3,
      isBoss: false,
      milestone: 'M2',
    });
  });

  it('6.1/6.2: gloom_ogre matches the spec with its 50 % / 3 tile Gloomling throw', () => {
    expect(enemyById['gloom_ogre']).toMatchObject({
      id: 'gloom_ogre',
      name: 'Gloom Ogre',
      armor: 'armored',
      hp: 1500,
      speed: 0.075,
      biteDamage: 70,
      biteIntervalS: 1,
      isFlying: false,
      special: 'gloom_ogre_throw',
      throwAtHealthRatio: 0.5,
      throwEnemyId: 'gloomling',
      throwDistanceTiles: 3,
      isBoss: false,
      milestone: 'M2',
    });
  });
});
