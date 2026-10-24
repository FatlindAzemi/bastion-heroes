import { describe, expect, it } from 'vitest';

import { levelById } from '../../src/data';
import { LevelDef } from '../../src/data/schemas';
import { createM2Collection } from '../../src/ui/screens/collection';
import { recommendLoadout } from '../../src/ui/screens/recommendedLoadout';
import { armorTypesForLevel } from '../../src/ui/screens/scouting';
import type { CollectionCardView, DamageType } from '../../src/ui/screens/types';

/** Parses a registered level exactly like the boot path does (spec 7.1). */
function parsedLevel(levelId: string): LevelDef {
  const level = levelById[levelId];
  if (level === undefined) {
    throw new Error(`test setup: level "${levelId}" is not registered`);
  }
  return LevelDef.parse(level);
}

/** Builds one collection card for the synthetic rule tests. */
function card(
  defenderId: string,
  cardLevel: number,
  damageType: DamageType | null,
  role = 'shooter',
): CollectionCardView {
  return {
    defenderId,
    name: defenderId,
    rarity: 'common',
    faction: 'forge',
    role,
    cost: 100,
    damageType,
    cardLevel,
  };
}

describe('Recommended loadout (spec 3.12 rule 3, issue #49)', () => {
  it('3.12: W1-L05 "Shield Wall" counters Light and Armored, adds a producer and fills to 6', () => {
    const level = parsedLevel('w1_l05');
    const recommended = recommendLoadout(
      createM2Collection(),
      armorTypesForLevel(level),
      level.loadoutSlots,
    );
    expect(recommended).toEqual([
      { defenderId: 'snowpup_yeti', cardLevel: 1 },
      { defenderId: 'boomcap_brewer', cardLevel: 1 },
      { defenderId: 'glowshroom_monk', cardLevel: 1 },
      { defenderId: 'frost_witch', cardLevel: 1 },
      { defenderId: 'iron_granny', cardLevel: 1 },
      { defenderId: 'pyro_fox', cardLevel: 1 },
    ]);
  });

  it('3.12: W1-L06 "Whispering Field" counters Light, Spectral and Armored', () => {
    const level = parsedLevel('w1_l06');
    const recommended = recommendLoadout(
      createM2Collection(),
      armorTypesForLevel(level),
      level.loadoutSlots,
    );
    expect(recommended).toEqual([
      { defenderId: 'snowpup_yeti', cardLevel: 1 },
      { defenderId: 'frost_witch', cardLevel: 1 },
      { defenderId: 'boomcap_brewer', cardLevel: 1 },
      { defenderId: 'glowshroom_monk', cardLevel: 1 },
      { defenderId: 'iron_granny', cardLevel: 1 },
      { defenderId: 'pyro_fox', cardLevel: 1 },
    ]);
  });

  it('3.12: the Recommended set is unique and deterministic', () => {
    const level = parsedLevel('w1_l05');
    const armors = armorTypesForLevel(level);
    const first = recommendLoadout(createM2Collection(), armors, level.loadoutSlots);
    const second = recommendLoadout(createM2Collection(), armors, level.loadoutSlots);
    expect(first).toEqual(second);
    expect(new Set(first.map((choice) => choice.defenderId)).size).toBe(first.length);
  });

  it('3.12: the highest card level beats the registry order', () => {
    const collection = [card('registry_first', 1, 'pierce'), card('higher_level', 3, 'pierce')];
    expect(recommendLoadout(collection, ['light'], 2)).toEqual([
      { defenderId: 'higher_level', cardLevel: 3 },
      { defenderId: 'registry_first', cardLevel: 1 },
    ]);
  });

  it('3.12: equal card levels fall back to the registry order', () => {
    const collection = [card('first', 2, 'pierce'), card('second', 2, 'pierce')];
    expect(recommendLoadout(collection, ['light'], 1)).toEqual([
      { defenderId: 'first', cardLevel: 2 },
    ]);
  });

  it('3.12: an armor type without a multiplier above 1 is skipped', () => {
    // Pierce is 0.5 and Arcane 1.0 against Armored, so only the producer and fill follow (spec 4.1).
    const collection = [
      card('piercer', 1, 'pierce'),
      card('arcanist', 1, 'arcane'),
      card('producer', 1, null, 'producer'),
    ];
    expect(recommendLoadout(collection, ['armored'], 3)).toEqual([
      { defenderId: 'producer', cardLevel: 1 },
      { defenderId: 'piercer', cardLevel: 1 },
      { defenderId: 'arcanist', cardLevel: 1 },
    ]);
  });

  it('3.12: duplicate armor types dedupe instead of adding a second counter', () => {
    const collection = [
      card('best_counter', 1, 'pierce'),
      card('higher_filler', 2, null, 'wall'),
      card('lower_counter', 1, 'pierce'),
    ];
    // Deduped: one Light counter (best_counter), then fill by level: higher_filler, lower_counter.
    expect(recommendLoadout(collection, ['light', 'light'], 3)).toEqual([
      { defenderId: 'best_counter', cardLevel: 1 },
      { defenderId: 'higher_filler', cardLevel: 2 },
      { defenderId: 'lower_counter', cardLevel: 1 },
    ]);
  });

  it('3.12: the Recommended set never exceeds the level slot count', () => {
    const collection = [
      card('piercer', 1, 'pierce'),
      card('blaster', 1, 'blast'),
      card('arcanist', 1, 'arcane'),
    ];
    expect(recommendLoadout(collection, ['light', 'armored', 'spectral'], 2)).toEqual([
      { defenderId: 'piercer', cardLevel: 1 },
      { defenderId: 'blaster', cardLevel: 1 },
    ]);
  });

  it('3.12: the producer step is skipped when the slots are already full', () => {
    const collection = [card('piercer', 1, 'pierce'), card('producer', 1, null, 'producer')];
    expect(recommendLoadout(collection, ['light'], 1)).toEqual([
      { defenderId: 'piercer', cardLevel: 1 },
    ]);
  });

  it('3.12: an empty collection yields an empty loadout', () => {
    expect(recommendLoadout([], ['light'], 6)).toEqual([]);
  });
});
