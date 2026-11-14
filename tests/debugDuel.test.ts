import { describe, expect, it } from 'vitest';

import { parseDuelDebugUrl } from '../src/debugDuel';

describe('debug Duel URL (issue #129)', () => {
  it('ignores URLs without duel=1', () => {
    expect(parseDuelDebugUrl('?level=w1-l01')).toEqual({ kind: 'none' });
  });

  it('uses the defaults: seed 1, south view, no fast-forward, hard bots', () => {
    expect(parseDuelDebugUrl('?duel=1')).toEqual({
      kind: 'duel',
      seed: 1,
      viewSide: 'south',
      tick: 0,
      hold: false,
      speed: 1,
      bots: { south: 'hard', north: 'hard' },
    });
  });

  it('reads every parameter', () => {
    expect(
      parseDuelDebugUrl(
        '?duel=1&seed=3&view=north&tick=1800&hold=1&speed=0.05&south=easy&north=normal',
      ),
    ).toEqual({
      kind: 'duel',
      seed: 3,
      viewSide: 'north',
      tick: 1800,
      hold: true,
      speed: 0.05,
      bots: { south: 'easy', north: 'normal' },
    });
  });

  it('reports bad values instead of guessing', () => {
    expect(parseDuelDebugUrl('?duel=1&view=east').kind).toBe('error');
    expect(parseDuelDebugUrl('?duel=1&seed=-1').kind).toBe('error');
    expect(parseDuelDebugUrl('?duel=1&north=expert').kind).toBe('error');
    expect(parseDuelDebugUrl('?duel=1&speed=2').kind).toBe('error');
  });
});
