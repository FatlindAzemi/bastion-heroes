import { describe, expect, it } from 'vitest';

import { levelById, levels } from '../src/data';
import { LevelDef } from '../src/data/schemas';
import { createDebugLoadout, fastForward, parseDebugUrl } from '../src/debug';
import { createSim } from '../src/sim';
import type { Sim } from '../src/sim/types';

/** The real W1-L01 definition, parsed like the boot path does (spec 7.2). */
function debugLevel(): LevelDef {
  return LevelDef.parse(levelById['w1_l01']);
}

/** JSON snapshot of the sim state; JSON drops the non-data parts of the rng object. */
function snapshot(sim: Sim): string {
  return JSON.stringify(sim.state);
}

describe('debug URL parsing (issue #27, spec 13.7)', () => {
  it('13.7: without a level parameter the app shows the title screen', () => {
    expect(parseDebugUrl('')).toEqual({ kind: 'title' });
    expect(parseDebugUrl('?perf=1')).toEqual({ kind: 'title' });
  });

  it('13.7: parses ?level=w1-l01&seed=10001&tick=900', () => {
    expect(parseDebugUrl('?level=w1-l01&seed=10001&tick=900')).toEqual({
      kind: 'level',
      levelId: 'w1_l01',
      seed: 10001,
      tick: 900,
    });
  });

  it('13.7: accepts the data id form w1_l01 too', () => {
    expect(parseDebugUrl('?level=w1_l01')).toEqual({
      kind: 'level',
      levelId: 'w1_l01',
      seed: 10001,
      tick: 0,
    });
  });

  it('13.7: defaults seed to the level seed and tick to 0', () => {
    const result = parseDebugUrl('?level=w1-l01');
    expect(result).toEqual({ kind: 'level', levelId: 'w1_l01', seed: 10001, tick: 0 });
  });

  it('13.7: an unknown level id becomes a readable error listing the known ids', () => {
    const result = parseDebugUrl('?level=w1-l99');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('unknown level "w1-l99"');
      expect(result.message).toContain('w1_l01');
    }
  });

  it('13.7: malformed seed and tick values become readable errors', () => {
    const invalidSearches = [
      '?level=w1-l01&seed=abc',
      '?level=w1-l01&seed=-1',
      '?level=w1-l01&tick=1.5',
      '?level=w1-l01&tick=-5',
    ];
    for (const search of invalidSearches) {
      const result = parseDebugUrl(search);
      expect(result.kind, search).toBe('error');
      if (result.kind === 'error') {
        expect(result.message, search).toMatch(/seed|tick/);
      }
    }
  });

  it('13.7: empty level values and unsafe integer ticks are rejected', () => {
    expect(parseDebugUrl('?level=').kind).toBe('error');
    expect(parseDebugUrl('?level=w1-l01&tick=9007199254740993').kind).toBe('error');
  });
});

describe('debug level boot (issue #27)', () => {
  it('3.12: the debug loadout is the fixed W1-L01 loadout at card level 1', () => {
    expect(createDebugLoadout(debugLevel())).toEqual([
      { defenderId: 'sparkbolt_gremlin', level: 1 },
    ]);
  });

  it('13.7: fastForward steps the sim exactly `tick` times', () => {
    const level = debugLevel();
    const sim = createSim(level, createDebugLoadout(level), 10001);
    let ticksSeen = 0;
    fastForward(sim, 900, () => {
      ticksSeen += 1;
    });
    expect(ticksSeen).toBe(900);
    expect(sim.state.tick).toBe(900);
  });

  it('13.7: 900 ticks are deterministic and the level has progressed', () => {
    const level = debugLevel();
    const loadout = createDebugLoadout(level);
    const first = createSim(level, loadout, 10001);
    const second = createSim(level, loadout, 10001);
    fastForward(first, 900);
    fastForward(second, 900);
    expect(snapshot(first)).toBe(snapshot(second));
    expect(first.state.tick).toBe(900);
    // The first wave starts after 20 s (tick 600); by tick 900 the first gloomling is on the field.
    expect(first.state.wave.index).toBe(0);
    expect(first.state.enemies.length).toBeGreaterThan(0);
  });

  it('13.7: fastForward feeds every tick to the event sink', () => {
    const level = debugLevel();
    const sim = createSim(level, createDebugLoadout(level), 10001);
    const eventTypes = new Set<string>();
    fastForward(sim, 900, (events) => {
      for (const event of events) {
        eventTypes.add(event.type);
      }
    });
    expect(eventTypes.has('enemySpawned')).toBe(true);
    expect(eventTypes.has('orbSpawned')).toBe(true);
  });

  it('13.7/7.2: every registered World 1 level boots through its debug URL', () => {
    for (const level of levels) {
      const urlLevel = level.id.replace('_', '-');
      const parsed = parseDebugUrl(`?level=${urlLevel}`);
      expect(parsed, level.id).toEqual({
        kind: 'level',
        levelId: level.id,
        seed: level.seed,
        tick: 0,
      });

      const loadout = createDebugLoadout(LevelDef.parse(level));
      expect(loadout, level.id).toHaveLength(level.loadoutSlots);
      for (const entry of loadout) {
        expect(entry.level).toBe(1);
      }

      // The debug boot path parses, creates the sim and fast-forwards before drawing.
      const sim = createSim(LevelDef.parse(level), loadout, level.seed);
      expect(() => fastForward(sim, 30), level.id).not.toThrow();
      expect(sim.state.tick, level.id).toBe(30);
      expect(sim.state.levelId, level.id).toBe(level.id);
    }
  });
});
