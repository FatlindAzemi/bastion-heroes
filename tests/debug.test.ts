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

  it('13.7: ?level=<id>&scout=1 opens the Scouting -> Loadout flow with the level seed', () => {
    expect(parseDebugUrl('?level=w1-l05&scout=1')).toEqual({
      kind: 'scout',
      levelId: 'w1_l05',
      seed: 10005,
      tick: 0,
    });
  });

  it('13.7: scout=1 carries an explicit seed and tick through', () => {
    expect(parseDebugUrl('?level=w1-l05&scout=1&seed=7&tick=120')).toEqual({
      kind: 'scout',
      levelId: 'w1_l05',
      seed: 7,
      tick: 120,
    });
  });

  it('13.7: only scout=1 opens the flow; every other value starts the level directly', () => {
    const directStarts = [
      '?level=w1-l05&scout=0',
      '?level=w1-l05&scout=2',
      '?level=w1-l05&scout=true',
      '?level=w1-l05&scout=',
    ];
    for (const search of directStarts) {
      expect(parseDebugUrl(search), search).toEqual({
        kind: 'level',
        levelId: 'w1_l05',
        seed: 10005,
        tick: 0,
      });
    }
  });

  it('13.7: scout=1 keeps the readable unknown-level and seed/tick errors of the direct start', () => {
    const directUnknown = parseDebugUrl('?level=w1-l99');
    const scoutUnknown = parseDebugUrl('?level=w1-l99&scout=1');
    expect(scoutUnknown).toEqual(directUnknown);
    expect(scoutUnknown.kind).toBe('error');

    for (const search of ['?level=w1-l05&scout=1&seed=abc', '?level=w1-l05&scout=1&tick=-5']) {
      const result = parseDebugUrl(search);
      expect(result.kind, search).toBe('error');
      if (result.kind === 'error') {
        expect(result.message, search).toMatch(/seed|tick/);
      }
    }
  });

  it('13.7: ?scout=1 without a level still shows the title screen', () => {
    expect(parseDebugUrl('?scout=1')).toEqual({ kind: 'title' });
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

describe('debug model screenshots (issue #66)', () => {
  it('accepts the ?autocollect=1 screenshot helper', () => {
    expect(parseDebugUrl('?level=w1-l01&autocollect=1')).toEqual({
      kind: 'level',
      levelId: 'w1_l01',
      seed: 10001,
      tick: 0,
      autoCollect: true,
    });
  });

  it('accepts a ?cards= loadout override without touching the default debug loadout', () => {
    expect(parseDebugUrl('?level=w1-l01&cards=glowshroom_monk,sparkbolt_gremlin')).toEqual({
      kind: 'level',
      levelId: 'w1_l01',
      seed: 10001,
      tick: 0,
      cards: ['glowshroom_monk', 'sparkbolt_gremlin'],
    });
    expect(parseDebugUrl('?level=w1-l01&cards=').kind).toBe('error');
    expect(parseDebugUrl('?level=w1-l01&cards=not_a_defender').kind).toBe('error');
  });

  it('accepts ?place= auto-placements and rejects malformed or out-of-grid entries', () => {
    expect(parseDebugUrl('?level=w1-l01&place=glowshroom_monk:2,1;sparkbolt_gremlin:2,4')).toEqual({
      kind: 'level',
      levelId: 'w1_l01',
      seed: 10001,
      tick: 0,
      placements: [
        { defenderId: 'glowshroom_monk', lane: 2, col: 1 },
        { defenderId: 'sparkbolt_gremlin', lane: 2, col: 4 },
      ],
    });
    for (const search of [
      '?level=w1-l01&place=glowshroom_monk',
      '?level=w1-l01&place=glowshroom_monk:2',
      '?level=w1-l01&place=not_a_defender:2,1',
      '?level=w1-l01&place=glowshroom_monk:9,1',
      '?level=w1-l01&place=',
    ]) {
      expect(parseDebugUrl(search).kind, search).toBe('error');
    }
  });

  it('places the debug defenders after the fast-forward, so a deep tick is affordable', () => {
    const level = debugLevel();
    const parsed = parseDebugUrl(
      '?level=w1-l01&cards=glowshroom_monk,sparkbolt_gremlin&place=glowshroom_monk:2,1;sparkbolt_gremlin:2,4&autocollect=1',
    );
    if (parsed.kind !== 'level') {
      throw new Error('expected a level debug request');
    }
    const sim = createSim(level, createDebugLoadout(level, parsed.cards), parsed.seed);
    sim.enqueue({ type: 'setAutoCollect', on: true });
    fastForward(sim, 900);
    for (const placement of parsed.placements ?? []) {
      sim.enqueue({
        type: 'place',
        defenderId: placement.defenderId,
        lane: placement.lane,
        col: placement.col,
      });
    }
    fastForward(sim, 1);
    expect(sim.state.defenders.map((defender) => defender.defenderId).sort()).toEqual([
      'glowshroom_monk',
      'sparkbolt_gremlin',
    ]);
    // The first Gloomling wave has spawned by tick 900 (spec 7.2 row 1).
    expect(sim.state.enemies.length).toBeGreaterThan(0);
  });

  it('keeps the debug loadout untouched when no cards override is given', () => {
    const level = debugLevel();
    expect(createDebugLoadout(level)).toEqual([{ defenderId: 'sparkbolt_gremlin', level: 1 }]);
  });
});
