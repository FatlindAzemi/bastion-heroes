import { describe, expect, it } from 'vitest';

import {
  ALLOWED_CLIPS,
  boundingHeight,
  evaluateInventory,
  evaluateModel,
  heightRangeFor,
  requiredClips,
  sizeLimitFor,
  triangleLimitFor,
} from '../../tools/build-assets/check-logic';
import type { ModelSummary, UnitInfo } from '../../tools/build-assets/check-logic';

const KIB = 1024;

const producer: UnitInfo = {
  kind: 'defender',
  id: 'glowshroom_monk',
  rarity: 'common',
  pattern: 'producer',
};
const shooter: UnitInfo = {
  kind: 'defender',
  id: 'sparkbolt_gremlin',
  rarity: 'common',
  pattern: 'straight',
};
const wall: UnitInfo = { kind: 'defender', id: 'iron_granny', rarity: 'rare', pattern: 'wall' };
const epic: UnitInfo = { kind: 'defender', id: 'pyro_fox', rarity: 'epic', pattern: 'lob' };
const mythic: UnitInfo = {
  kind: 'defender',
  id: 'aurora_dragon',
  rarity: 'mythic',
  pattern: 'beam',
};
const enemy: UnitInfo = { kind: 'enemy', id: 'gloomling', isBoss: false };
const ogre: UnitInfo = { kind: 'enemy', id: 'gloom_ogre', isBoss: false };
const boss: UnitInfo = { kind: 'enemy', id: 'morvak', isBoss: true };
const units: UnitInfo[] = [producer, shooter, wall, epic, mythic, enemy, ogre, boss];

/** A model summary that passes every rule for a common defender. */
function model(overrides: Partial<ModelSummary> = {}): ModelSummary {
  return {
    bytes: 120 * KIB,
    animations: ['idle', 'attack', 'victory'],
    joints: ['root', 'head'],
    triangles: 2000,
    bounds: { min: [0, 0, 0], max: [0.4, 0.8, 0.4] },
    ...overrides,
  };
}

describe('requiredClips (spec 12.5)', () => {
  it('gives producers idle, produce and victory', () => {
    expect(requiredClips(producer)).toEqual(['idle', 'produce', 'victory']);
  });

  it('gives attackers idle, attack and victory', () => {
    expect(requiredClips(shooter)).toEqual(['idle', 'attack', 'victory']);
    expect(requiredClips(epic)).toEqual(['idle', 'attack', 'victory']);
    expect(requiredClips(mythic)).toEqual(['idle', 'attack', 'victory']);
  });

  it('gives walls just idle and victory', () => {
    expect(requiredClips(wall)).toEqual(['idle', 'victory']);
  });

  it('gives enemies walk and eat', () => {
    expect(requiredClips(enemy)).toEqual(['walk', 'eat']);
    expect(requiredClips(boss)).toEqual(['walk', 'eat']);
  });

  it('allows exactly the spec 9.6 clip names', () => {
    expect([...ALLOWED_CLIPS]).toEqual(['idle', 'attack', 'produce', 'walk', 'eat', 'victory']);
  });
});

describe('budget tables (spec 9.3, 12.6)', () => {
  it('sizes Common/Rare at 250 KB, Epic/Legendary at 400 KB and Mythic/bosses at 700 KB', () => {
    expect(sizeLimitFor(producer)).toBe(250 * KIB);
    expect(sizeLimitFor(wall)).toBe(250 * KIB);
    expect(sizeLimitFor(epic)).toBe(400 * KIB);
    expect(sizeLimitFor(mythic)).toBe(700 * KIB);
    expect(sizeLimitFor(enemy)).toBe(250 * KIB);
    expect(sizeLimitFor(boss)).toBe(700 * KIB);
  });

  it('uses the spec 9.3 triangle budgets per rarity and kind', () => {
    expect(triangleLimitFor(producer)).toBe(3000);
    expect(triangleLimitFor(epic)).toBe(4500);
    expect(triangleLimitFor(mythic)).toBe(6000);
    expect(triangleLimitFor(enemy)).toBe(3000);
    expect(triangleLimitFor(boss)).toBe(8000);
  });

  it('uses the spec 9.3 height ranges, including the Ogre and boss exceptions', () => {
    expect(heightRangeFor(producer)).toEqual({ minHeight: 0.7, maxHeight: 0.9 });
    expect(heightRangeFor(epic)).toEqual({ minHeight: 0.8, maxHeight: 1.1 });
    expect(heightRangeFor(mythic)).toEqual({ maxHeight: 1.3 });
    expect(heightRangeFor(enemy)).toEqual({ minHeight: 0.8, maxHeight: 1.0 });
    expect(heightRangeFor(ogre)).toEqual({ minHeight: 1.3, maxHeight: 1.5 });
    expect(heightRangeFor(boss)).toEqual({ minHeight: 2.2, maxHeight: 2.6 });
  });

  it('measures the bounding-box height from the Y axis', () => {
    expect(boundingHeight({ min: [0, 0.02, 0], max: [0.4, 0.82, 0.4] })).toBeCloseTo(0.8, 5);
  });
});

describe('evaluateModel (spec 9.3, 12.5, 12.6, 12.7)', () => {
  it('accepts a model inside every budget', () => {
    expect(evaluateModel('sparkbolt_gremlin', model(), units)).toEqual([]);
  });

  it('accepts a mythic above the regular-den defender height and a boss at 2.4', () => {
    expect(
      evaluateModel(
        'aurora_dragon',
        model({
          animations: ['idle', 'attack', 'victory'],
          bounds: { min: [0, 0, 0], max: [1, 1.2, 1] },
        }),
        units,
      ),
    ).toEqual([]);
    expect(
      evaluateModel(
        'morvak',
        model({
          animations: ['walk', 'eat'],
          triangles: 5000,
          bounds: { min: [0, 0, 0], max: [1.4, 2.4, 1.4] },
        }),
        units,
      ),
    ).toEqual([]);
  });

  it('fails a file over its spec 12.6 size limit', () => {
    const errors = evaluateModel('sparkbolt_gremlin', model({ bytes: 260 * KIB }), units);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('260 KB');
    expect(errors[0]).toContain('spec 12.6');
  });

  it('fails a model over its spec 9.3 triangle budget', () => {
    const errors = evaluateModel('sparkbolt_gremlin', model({ triangles: 3500 }), units);
    expect(errors[0]).toContain('3500 triangles');
    expect(errors[0]).toContain('budget of spec 9.3');
  });

  it('fails a model outside its height range', () => {
    expect(
      evaluateModel(
        'sparkbolt_gremlin',
        model({ bounds: { min: [0, 0, 0], max: [0.5, 0.5, 0.5] } }),
        units,
      )[0],
    ).toContain('outside the spec 9.3 range');
    expect(
      evaluateModel(
        'sparkbolt_gremlin',
        model({ bounds: { min: [0, 0, 0], max: [0.5, 1.4, 0.5] } }),
        units,
      )[0],
    ).toContain('outside the spec 9.3 range');
  });

  it('fails a model missing a clip for its role', () => {
    const errors = evaluateModel(
      'glowshroom_monk',
      model({ animations: ['idle', 'victory'] }),
      units,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('missing the "produce" clip');
  });

  it('fails a clip name that is not in spec 9.6', () => {
    const errors = evaluateModel(
      'sparkbolt_gremlin',
      model({ animations: ['idle', 'attack', 'victory', 'jump'] }),
      units,
    );
    expect(errors[0]).toContain('unknown clip "jump"');
  });

  it('fails a model without root or head bones', () => {
    const errors = evaluateModel('sparkbolt_gremlin', model({ joints: ['body'] }), units);
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).toContain('"root" bone');
    expect(errors.join(' ')).toContain('"head" bone');
  });

  it('fails a model id that has no data definition', () => {
    expect(evaluateModel('not_a_unit', model(), units)).toEqual([
      'model "not_a_unit" has no matching defender or enemy in src/data/index.ts',
    ]);
  });
});

describe('evaluateInventory (spec 12.7 id mapping)', () => {
  it('accepts matching models, scripts and data units', () => {
    expect(evaluateInventory(['gloomling'], ['gloomling'], units)).toEqual([]);
  });

  it('fails a model without a data unit', () => {
    const errors = evaluateInventory(['mystery_model'], ['mystery_model'], units);
    expect(errors).toContain(
      'model "mystery_model" has no matching defender or enemy in src/data/index.ts',
    );
    expect(errors).toContain(
      'character script "mystery_model" has no matching defender or enemy in src/data/index.ts',
    );
  });

  it('fails a committed model without a character script', () => {
    const errors = evaluateInventory(['gloomling'], [], units);
    expect(errors).toEqual([
      'model "gloomling" has no character script under assets-src/blender/characters or import',
    ]);
  });

  it('fails a character script without a committed model', () => {
    const errors = evaluateInventory([], ['gloomling'], units);
    expect(errors[0]).toContain('has no committed model');
  });

  it('fails an id that is both a defender and an enemy', () => {
    const duplicated: UnitInfo[] = [...units, { ...shooter }];
    const errors = evaluateInventory([], [], duplicated);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('defined more than once');
  });
});
