import { describe, expect, it } from 'vitest';

import { createDuelSim, hashDuelState } from '../../../src/sim/duel';
import type { DuelSim, DuelState } from '../../../src/sim/duel';
import gateJson from './replays/hard_vs_easy_gate.json';
import type { GoldenDuelReplay } from './replays/scenarios';

const GATE_GOLDEN = gateJson as unknown as GoldenDuelReplay;

type Container = Record<string, unknown> | unknown[];

/** One mutable leaf of the state: its container, key and path for the failure message. */
interface Leaf {
  container: Container;
  key: string | number;
  path: string;
}

/**
 * True when the state has defenders, raiders, summons and projectiles. The starter
 * decks of the golden apply no status effects and leave no fire patches; those
 * fields come from the unit snapshots shared with the campaign hash.
 */
function isBusy(state: Readonly<DuelState>): boolean {
  return (
    state.defenders.length > 0 &&
    state.enemies.length > 0 &&
    state.summons.length > 0 &&
    state.projectiles.length > 0
  );
}

/** Replays the gate golden on a bare sim until a tick with every kind of unit in the state. */
function busySim(): DuelSim {
  const sim = createDuelSim(GATE_GOLDEN.seed);
  GATE_GOLDEN.commands.forEach((entry) => sim.enqueue(entry.cmd, entry.tick));
  while (sim.state.result === null && !isBusy(sim.state)) {
    sim.step();
  }
  return sim;
}

/** Every number, string, boolean and null leaf of a value; functions are skipped. */
function leavesOf(value: unknown, path: string): Leaf[] {
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const container = value as Container;
  return Object.entries(container).flatMap(([key, child]) => {
    const childKey = Array.isArray(container) ? Number(key) : key;
    const childPath = `${path}.${key}`;
    if (typeof child === 'function') {
      return [];
    }
    if (child !== null && typeof child === 'object') {
      return leavesOf(child, childPath);
    }
    return [{ container, key: childKey, path: childPath }];
  });
}

/** A different value of the same leaf. */
function mutated(value: unknown): unknown {
  if (typeof value === 'number') {
    return value + 1;
  }
  if (typeof value === 'boolean') {
    return !value;
  }
  if (typeof value === 'string') {
    return `${value}_changed`;
  }
  return 0;
}

/** Reads or writes one leaf; the container is a plain object or array of the state. */
function leafValue(leaf: Leaf, next?: unknown): unknown {
  const record = leaf.container as Record<string | number, unknown>;
  if (arguments.length > 1) {
    record[leaf.key] = next;
  }
  return record[leaf.key];
}

// Spec 11.6, 19.4: the Duel hash covers every field of the state.
describe('hashDuelState', () => {
  it('11.6: returns 8 lowercase hex characters and is stable for the same state', () => {
    const sim = createDuelSim(4);

    expect(hashDuelState(sim.state)).toMatch(/^[0-9a-f]{8}$/);
    expect(hashDuelState(sim.state)).toBe(hashDuelState(createDuelSim(4).state));
  });

  it('19.4: changing any single field of a busy state changes the hash', () => {
    const sim = busySim();
    const state = sim.state as DuelState;
    const original = hashDuelState(state);
    const uncovered: string[] = [];

    for (const leaf of leavesOf(state, 'state')) {
      const before = leafValue(leaf);
      leafValue(leaf, mutated(before));
      if (hashDuelState(state) === original) {
        uncovered.push(leaf.path);
      }
      leafValue(leaf, before);
    }

    expect(isBusy(state)).toBe(true);
    expect(uncovered).toEqual([]);
    expect(hashDuelState(state)).toBe(original);
  });
});
