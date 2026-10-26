import { describe, expect, it } from 'vitest';

import { applyRunToQuests, createDailyQuests, ensureDailyQuests } from '../../src/meta/quests';
import type { QuestRunSummary } from '../../src/meta/quests';

const DATE = '2026-10-26';

/** A run that only defeats enemies. */
function enemyRun(enemiesDefeated: number): QuestRunSummary {
  return {
    won: false,
    stars: 0,
    enemiesDefeated,
    combosTriggered: 0,
    mergesTo3: 0,
    trapUsed: false,
    onlyCommonCards: false,
  };
}

describe('daily quests', () => {
  it('resets on a new day and keeps progress on the same day', () => {
    const dayOne = createDailyQuests(DATE);
    const progressed = {
      ...dayOne,
      quests: dayOne.quests.map((quest, index) =>
        index === 0 ? { ...quest, progress: 2 } : quest,
      ),
    };
    expect(ensureDailyQuests(progressed, DATE)).toEqual(progressed);
    const nextDay = ensureDailyQuests(progressed, '2026-10-27');
    expect(nextDay.date).toBe('2026-10-27');
    expect(nextDay.quests.every((quest) => quest.progress === 0)).toBe(true);
  });

  it('adds enemy and combo deltas to every matching quest', () => {
    const daily = {
      date: DATE,
      quests: [
        { id: 'defeat_enemies' as const, progress: 0, done: false },
        { id: 'trigger_combos' as const, progress: 4, done: false },
        { id: 'merge_star3' as const, progress: 0, done: false },
      ],
      allDoneRewarded: false,
    };
    const result = applyRunToQuests(
      daily,
      { ...enemyRun(100), combosTriggered: 1, mergesTo3: 1 },
      DATE,
    );
    expect(result.state.quests.map((quest) => quest.progress)).toEqual([100, 5, 1]);
    expect(result.state.quests.every((quest) => quest.done)).toBe(true);
    expect(result.reward.gold).toBe(150);
    expect(result.reward.gems).toBe(30);
    expect(result.reward.chest).toBe('wooden');
    expect([...result.reward.completed].sort()).toEqual([
      'defeat_enemies',
      'merge_star3',
      'trigger_combos',
    ]);
  });

  it('pays a quest only on the run that completes it', () => {
    const daily = {
      date: DATE,
      quests: [{ id: 'defeat_enemies' as const, progress: 99, done: false }],
      allDoneRewarded: false,
    };
    const first = applyRunToQuests(daily, enemyRun(1), DATE);
    expect(first.reward.completed).toEqual(['defeat_enemies']);
    const second = applyRunToQuests(first.state, enemyRun(5), DATE);
    expect(second.reward.gold).toBe(0);
    expect(second.state.quests[0]?.progress).toBe(100);
  });

  it('counts only wins for trap-free and common-only quests', () => {
    const daily = {
      date: DATE,
      quests: [
        { id: 'trap_free_win' as const, progress: 0, done: false },
        { id: 'common_only_win' as const, progress: 0, done: false },
      ],
      allDoneRewarded: false,
    };
    const win = applyRunToQuests(
      daily,
      {
        ...enemyRun(0),
        won: true,
        stars: 2,
        trapUsed: false,
        onlyCommonCards: true,
      },
      DATE,
    );
    expect(win.state.quests.every((quest) => quest.done)).toBe(true);
    const loss = applyRunToQuests(
      daily,
      { ...enemyRun(0), won: false, trapUsed: true, onlyCommonCards: true },
      DATE,
    );
    expect(loss.state.quests.some((quest) => quest.done)).toBe(false);
  });
});
