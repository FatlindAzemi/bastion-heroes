import { describe, expect, it } from 'vitest';

import type { LevelRewardSummary } from '../../src/meta';
import { resultRewardRows, resultView } from '../../src/ui/screens/resultView';
import type { ResultStars } from '../../src/ui/screens/shellTypes';

// Issue #113: the result overlay heading and the three sequential star slots.

describe('resultView', () => {
  it('renders a victory with all three stars', () => {
    const view = resultView('won', 3);
    expect(view.won).toBe(true);
    expect(view.heading).toBe('Victory!');
    expect(view.subtitle).toBe('The Bastion stands.');
    expect(view.starStates).toEqual([true, true, true]);
  });

  it('fills the stars up to the earned rating', () => {
    expect(resultView('won', 1).starStates).toEqual([true, false, false]);
    expect(resultView('won', 2).starStates).toEqual([true, true, false]);
  });

  it('renders a defeat with no stars', () => {
    const view = resultView('lost', 0);
    expect(view.won).toBe(false);
    expect(view.heading).toBe('Defeat');
    expect(view.starStates).toEqual([false, false, false]);
  });

  it('clamps ratings outside the 0..3 contract', () => {
    expect(resultView('won', 7 as ResultStars).starStates).toEqual([true, true, true]);
    expect(resultView('won', -2 as ResultStars).starStates).toEqual([false, false, false]);
  });
});

/** A complete reward summary with every optional payout set to nothing. */
function summary(patch: Partial<LevelRewardSummary> = {}): LevelRewardSummary {
  return {
    gold: 0,
    gems: 0,
    questGold: 0,
    questGems: 0,
    stars: 0,
    previousStars: 0,
    bestStars: 0,
    unlockedDefenderId: null,
    chest: null,
    questChest: null,
    completedQuests: [],
    ...patch,
  };
}

describe('resultRewardRows (M4)', () => {
  it('returns no rows for a debug preview without a reward summary', () => {
    expect(resultRewardRows(undefined)).toEqual([]);
  });

  it('omits every zero reward', () => {
    expect(resultRewardRows(summary())).toEqual([]);
  });

  it('renders gold, star gems, one card unlock and a first-clear chest', () => {
    const rows = resultRewardRows(
      summary({
        gold: 1_200,
        gems: 25,
        stars: 3,
        previousStars: 1,
        bestStars: 3,
        unlockedDefenderId: 'glowshroom_monk',
        chest: 'wooden',
      }),
    );
    expect(rows).toEqual([
      { id: 'gold', label: 'Level gold', value: '+1.2K', icon: 'goldCoin' },
      { id: 'gems', label: 'Star bonus', value: '+25', icon: 'gem' },
      { id: 'unlock', label: 'New card', value: 'Glowshroom Monk', icon: 'cards' },
      { id: 'chest', label: 'First clear', value: 'Wooden Chest', icon: 'chest' },
    ]);
  });

  it('labels the quest row by whether quests completed on this run', () => {
    const completed = resultRewardRows(
      summary({ questGold: 50, questGems: 10, completedQuests: ['quest_win'] }),
    );
    expect(completed).toEqual([
      {
        id: 'quests',
        label: 'Daily quests',
        value: '+50 gold · +10 gems',
        icon: 'timer',
      },
    ]);
    const carried = resultRewardRows(summary({ questGold: 100, questGems: 20 }));
    expect(carried[0]?.label).toBe('Quest reward');
  });

  it('shows the all-quests chest separately from the first-clear chest', () => {
    const rows = resultRewardRows(summary({ chest: 'silver', questChest: 'wooden' }));
    expect(rows.map((row) => [row.id, row.value])).toEqual([
      ['chest', 'Silver Chest'],
      ['quest-chest', 'Wooden Chest'],
    ]);
  });

  it('ignores unknown defender and chest ids instead of rendering broken rows', () => {
    expect(
      resultRewardRows(
        summary({
          unlockedDefenderId: 'not_a_card',
          chest: 'not_a_chest' as LevelRewardSummary['chest'],
          questChest: 'not_a_chest' as LevelRewardSummary['chest'],
        }),
      ),
    ).toEqual([]);
  });
});
