import { describe, expect, it } from 'vitest';

import { tutorialTipFor, tutorialTipId } from '../../src/ui/hud/tutorialTips';

// Issue #113 / M4: first-time tutorial tips are non-blocking and shown once per
// early level; the save records the stable tip id in `tutorial.seenHints`.

describe('tutorialTips', () => {
  it('has one tip each for the four tutorial levels', () => {
    for (const levelId of ['w1_l01', 'w1_l02', 'w1_l03', 'w1_l04']) {
      const tip = tutorialTipFor(levelId, []);
      expect(tip, levelId).not.toBeNull();
      expect(tip?.id).toBe(`tip_${levelId}`);
      expect(tip?.text.length).toBeGreaterThan(0);
    }
  });

  it('does not repeat a tip the save already recorded', () => {
    const seen = [tutorialTipId('w1_l01')];
    expect(tutorialTipFor('w1_l01', seen)).toBeNull();
    expect(tutorialTipFor('w1_l02', seen)).not.toBeNull();
  });

  it('has no tip for later levels with no new mechanic', () => {
    expect(tutorialTipFor('w1_l05', [])).toBeNull();
    expect(tutorialTipFor('w1_l10', [])).toBeNull();
  });

  it('has no tip for unknown level ids', () => {
    expect(tutorialTipFor('unknown_level', [])).toBeNull();
  });

  it('uses stable, level-scoped ids', () => {
    expect(tutorialTipId('w1_l01')).toBe('tip_w1_l01');
    expect(tutorialTipId('w1_l01')).toBe(tutorialTipId('w1_l01'));
  });
});
