import { describe, expect, it } from 'vitest';

import { defenderById, defenders, enemyById, enemies, levelById, levels } from '../../src/data';
import { DefenderDef, EnemyDef } from '../../src/data/schemas';

/**
 * Registry tests (spec 11.2, 11.5, 16.1): every definition of `src/data/` is
 * exported by id, parses with its schema and has a unique id.
 */
describe('data registry (spec 11.2, 11.5)', () => {
  it('11.5: every defender def parses with DefenderDef', () => {
    for (const defender of defenders) {
      expect(() => DefenderDef.parse(defender)).not.toThrow();
    }
  });

  it('11.5: every enemy def parses with EnemyDef', () => {
    for (const enemy of enemies) {
      expect(() => EnemyDef.parse(enemy)).not.toThrow();
    }
  });

  it('11.5: defender, enemy and level ids are unique', () => {
    const defenderIds = defenders.map((defender) => defender.id);
    expect(new Set(defenderIds).size).toBe(defenderIds.length);

    const enemyIds = enemies.map((enemy) => enemy.id);
    expect(new Set(enemyIds).size).toBe(enemyIds.length);

    const levelIds = levels.map((level) => level.id);
    expect(new Set(levelIds).size).toBe(levelIds.length);
  });

  it('11.2: the by-id maps contain exactly the registry entries', () => {
    expect(Object.keys(defenderById).sort()).toEqual(
      defenders.map((defender) => defender.id).sort(),
    );
    expect(Object.keys(enemyById).sort()).toEqual(enemies.map((enemy) => enemy.id).sort());
    expect(Object.keys(levelById).sort()).toEqual(levels.map((level) => level.id).sort());
  });

  it('5.1/6.1/14 row 2.6: the M2 roster has the eight defenders and the seven section-6 enemies', () => {
    expect(defenders.map((defender) => defender.id)).toEqual([
      'boomcap_brewer',
      'frost_witch',
      'glowshroom_monk',
      'iron_granny',
      'pyro_fox',
      'rune_archer',
      'snowpup_yeti',
      'sparkbolt_gremlin',
    ]);
    expect(enemies.map((enemy) => enemy.id)).toEqual([
      'bat_swarm',
      'gloom_ogre',
      'gloom_priest',
      'gloomling',
      'pothead',
      'shade_wisp',
      'shieldbearer',
    ]);
  });
});
