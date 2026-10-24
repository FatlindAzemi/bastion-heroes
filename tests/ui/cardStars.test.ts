import { describe, expect, it } from 'vitest';

import { highestCardStars } from '../../src/ui/hud/cardStars';

describe('Card star pips (spec 3.6, 9.8; issue #76)', () => {
  it('3.6: a card without placed defenders shows no pips (star 1)', () => {
    expect(highestCardStars([], 'glowshroom_monk')).toBe(1);
  });

  it('3.6: the card shows the highest star level placed from it', () => {
    const defenders = [
      { defenderId: 'glowshroom_monk', stars: 2 as const },
      { defenderId: 'sparkbolt_gremlin', stars: 3 as const },
      { defenderId: 'glowshroom_monk', stars: 1 as const },
    ];
    expect(highestCardStars(defenders, 'glowshroom_monk')).toBe(2);
    expect(highestCardStars(defenders, 'sparkbolt_gremlin')).toBe(3);
  });

  it('3.6: a merged defender raises the card to its new star level', () => {
    const defenders = [{ defenderId: 'iron_granny', stars: 3 as const }];
    expect(highestCardStars(defenders, 'iron_granny')).toBe(3);
    expect(highestCardStars(defenders, 'frost_witch')).toBe(1);
  });
});
