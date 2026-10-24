import { describe, expect, it } from 'vitest';

import { enemyById } from '../../src/data';

/** Exact section 6.1 values of the M1 enemy (spec 1.1 rule 3). */
describe('M1 enemy data (spec 6.1)', () => {
  it('6.1: gloomling matches the spec', () => {
    expect(enemyById['gloomling']).toMatchObject({
      id: 'gloomling',
      name: 'Gloomling',
      armor: 'light',
      hp: 200,
      speed: 0.22,
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
