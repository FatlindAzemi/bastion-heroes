import { describe, expect, it } from 'vitest';

import { readDebugAnimationHold } from '../../src/render/debugAnimation';

describe('Debug animation hold (issue #74 screenshot helper)', () => {
  it('parses a valid ?debuganim=kind:progress hold', () => {
    expect(readDebugAnimationHold('?debuganim=spawn:0.6')).toEqual({
      kind: 'spawn',
      progress: 0.6,
    });
    expect(readDebugAnimationHold('?debuganim=death:1')).toEqual({ kind: 'death', progress: 1 });
    expect(readDebugAnimationHold('?debuganim=merge:0')).toEqual({ kind: 'merge', progress: 0 });
  });

  it('ignores a missing or malformed hold instead of failing the level boot', () => {
    expect(readDebugAnimationHold('')).toBeNull();
    expect(readDebugAnimationHold('?level=w1-l05')).toBeNull();
    expect(readDebugAnimationHold('?debuganim=spawn')).toBeNull();
    expect(readDebugAnimationHold('?debuganim=nope:0.5')).toBeNull();
    expect(readDebugAnimationHold('?debuganim=spawn:-0.1')).toBeNull();
    expect(readDebugAnimationHold('?debuganim=spawn:1.5')).toBeNull();
    expect(readDebugAnimationHold('?debuganim=spawn:abc')).toBeNull();
  });
});
