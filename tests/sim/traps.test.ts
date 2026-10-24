import { describe, expect, it } from 'vitest';

import { enemyById, rules } from '../../src/data';
import { createSim } from '../../src/sim/createSim';
import { trapDamage } from '../../src/sim/traps';
import type { EnemyState, Sim, SimEvent, SimState } from '../../src/sim/types';
import { createTestLevel } from './testLevel';

interface RecordedEvent {
  tick: number;
  event: SimEvent;
}

/** Creates a sim whose waves stay far away, so the tests control the enemies. */
function createTrapSim(): Sim {
  return createSim(
    createTestLevel({ skyDrops: false, firstWaveDelay: 600, waves: [{ spawns: [] }] }),
    [],
    10001,
  );
}

/** Adds an enemy exactly at `x` (wave spawning is covered by #20). */
function spawnEnemy(sim: Sim, lane: number, x: number, hp = 200): EnemyState {
  const state = sim.state as SimState;
  const id = state.nextId;
  state.nextId += 1;
  const enemy: EnemyState = {
    id,
    enemyId: 'gloomling',
    lane,
    x,
    hp,
    maxHp: hp,
    waveIndex: 0,
    blockedByDefenderId: null,
    nextBiteTick: null,
    statuses: [],
    comboCooldowns: { steam: 0, shatter: 0, toxic: 0, chain: 0 },
    shieldHp: 0,
    armorBroken: false,
    nextHealTick: null,
    hasThrown: false,
  };
  state.enemies.push(enemy);
  return enemy;
}

/** Steps for `ticks` ticks and records every event with its tick. */
function record(sim: Sim, ticks: number): RecordedEvent[] {
  const recorded: RecordedEvent[] = [];
  for (let index = 0; index < ticks; index += 1) {
    const tick = sim.state.tick;
    for (const event of sim.step()) {
      recorded.push({ tick, event });
    }
  }
  return recorded;
}

// Spec 3.9: the Last Stand Trap.
describe('Last Stand Trap', () => {
  it('3.9: a trap fires when an enemy reaches the base line and the trap is unused', () => {
    const sim = createTrapSim();
    const enemy = spawnEnemy(sim, 0, 0.2);
    let previousX = enemy.x;
    let fireTick = -1;

    for (let tick = 0; tick < 100; tick += 1) {
      const stepTick = sim.state.tick;
      const events = sim.step();
      if (events.some((event) => event.type === 'trapFired')) {
        fireTick = stepTick;
        expect(previousX).toBeGreaterThan(rules.grid.baseLineX);
        expect(enemy.x).toBeLessThanOrEqual(rules.grid.baseLineX);
        break;
      }
      previousX = enemy.x;
    }

    expect(fireTick).toBeGreaterThanOrEqual(0);
    expect(sim.state.traps[0]?.used).toBe(true);
    expect(sim.state.traps[0]?.rollerX).not.toBeNull();
    expect(sim.state.traps[1]?.used).toBe(false);
  });

  it('3.9: a used trap does not fire a second time', () => {
    const sim = createTrapSim();
    spawnEnemy(sim, 0, 0.2);
    while (sim.state.traps[0]?.used !== true) {
      sim.step();
    }

    spawnEnemy(sim, 0, 0.2);
    const recorded = record(sim, 30);

    expect(recorded.filter((entry) => entry.event.type === 'trapFired')).toHaveLength(0);
    expect(sim.state.traps[0]?.used).toBe(true);
  });

  it('3.9: the roller rolls from -0.4 to 10 at 8 tiles per second and then stops', () => {
    const sim = createTrapSim();
    spawnEnemy(sim, 0, 0.2);
    while (sim.state.traps[0]?.used !== true) {
      sim.step();
    }

    const perTick = rules.trap.trapSpeedTilesPerS / rules.tick.tickRate;
    expect(perTick).toBeCloseTo(8 / 30);
    expect(rules.trap.trapStartX).toBe(-0.4);
    expect(rules.trap.trapEndX).toBe(10);
    expect(sim.state.traps[0]?.rollerX).toBeCloseTo(rules.trap.trapStartX + perTick);

    const positions: number[] = [];
    while (sim.state.traps[0]?.rollerX !== null) {
      sim.step();
      const rollerX = sim.state.traps[0]?.rollerX;
      if (rollerX !== null && rollerX !== undefined) {
        positions.push(rollerX);
      }
    }

    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]! - positions[index - 1]!).toBeCloseTo(perTick);
    }
    // The last observed position is one tick short of trapEndX; the final step ends the roll.
    expect(positions[positions.length - 1]! + perTick).toBeGreaterThanOrEqual(rules.trap.trapEndX);
    expect(sim.state.traps[0]?.used).toBe(true);
  });

  it('3.9: the trap kills every non-boss enemy it touches instantly', () => {
    const sim = createTrapSim();
    const enemy = spawnEnemy(sim, 0, 0.2, 200);
    const recorded = record(sim, 60);

    expect(recorded.some((entry) => entry.event.type === 'enemyDied')).toBe(true);
    expect(recorded.some((entry) => entry.event.type === 'hit')).toBe(false);
    expect(enemy.hp).toBe(200); // killed instantly, not damaged down
    expect(sim.state.enemies).toEqual([]);
  });

  it('3.9: bosses take 400 damage instead of dying (boss branch)', () => {
    const gloomling = enemyById['gloomling'];
    if (gloomling === undefined) {
      throw new Error('expected the gloomling data');
    }
    const bossDef = { ...gloomling, id: 'test_boss', isBoss: true };

    expect(rules.trap.trapBossDamage).toBe(400);
    expect(trapDamage(bossDef)).toBe(rules.trap.trapBossDamage);
    expect(trapDamage(gloomling)).toBeNull();
  });

  it('3.9: the roller only kills enemies in its own lane', () => {
    const sim = createTrapSim();
    spawnEnemy(sim, 0, 0.2); // triggers the trap in lane 0
    const otherLaneEnemy = spawnEnemy(sim, 1, 2);

    while (sim.state.traps[0]?.rollerX !== null) {
      sim.step();
    }

    expect(sim.state.enemies.map((enemy) => enemy.id)).toContain(otherLaneEnemy.id);
  });
});
