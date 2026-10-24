import { describe, expect, it } from 'vitest';

import { enemyRenderHeight } from '../../src/render/units';

describe('flying enemy render height (spec 6.2)', () => {
  it('6.2: the Bat Swarm flies at height 1.5', () => {
    expect(enemyRenderHeight('bat_swarm')).toBe(1.5);
  });

  it('6.2: ground enemies and the floating Shade Wisp stay on the ground', () => {
    expect(enemyRenderHeight('gloomling')).toBe(0);
    expect(enemyRenderHeight('shieldbearer')).toBe(0);
    expect(enemyRenderHeight('shade_wisp')).toBe(0);
    expect(enemyRenderHeight('pothead')).toBe(0);
  });

  it('6.2: an unknown enemy id does not throw', () => {
    expect(enemyRenderHeight('not_an_enemy')).toBe(0);
  });
});
