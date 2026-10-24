import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data';
import { createSim } from '../../src/sim/createSim';
import { ACTIVATION_DELAY_TICKS, isCardReady, isDefenderActive } from '../../src/sim/placement';
import type { Command, LoadoutEntry, Sim } from '../../src/sim/types';
import { createTestLevel, type TestLevelOptions } from './testLevel';

const SPARKBOLT = 'sparkbolt_gremlin';
const GLOWSHROOM = 'glowshroom_monk';
const IRON_GRANNY = 'iron_granny';

/** Creates a sim with a schema-valid test level and the real M1 defender data. */
function createTestSim(
  options: TestLevelOptions = {},
  loadout: LoadoutEntry[] = [{ defenderId: SPARKBOLT, level: 1 }],
): Sim {
  return createSim(
    createTestLevel({ skyDrops: false, startEssence: 999, firstWaveDelay: 60, ...options }),
    loadout,
    10001,
  );
}

function place(defenderId: string, lane: number, col: number): Command {
  return { type: 'place', defenderId, lane, col };
}

/** The state fields a rejected command must never change (spec 11.3). */
function snapshot(sim: Sim): string {
  return JSON.stringify({
    essence: sim.state.essence,
    defenders: sim.state.defenders,
    nextId: sim.state.nextId,
    cardCooldownEndTicks: sim.state.cardCooldownEndTicks,
  });
}

// Spec 3.4, 3.5, 3.7 and 11.3: placing, cooldowns, shovel and rejected commands.
describe('placement', () => {
  it('3.4: placing a defender spends its cost, spawns it and emits defenderPlaced', () => {
    const sim = createTestSim({ startEssence: 200 });

    sim.enqueue(place(SPARKBOLT, 0, 0));
    const events = sim.step();

    expect(events).toEqual([
      { type: 'defenderPlaced', id: 1, defenderId: SPARKBOLT, lane: 0, col: 0, stars: 1 },
    ]);
    expect(sim.state.essence).toBe(100);
    expect(sim.state.nextId).toBe(2);
    expect(sim.state.defenders).toEqual([
      {
        id: 1,
        defenderId: SPARKBOLT,
        lane: 0,
        col: 0,
        stars: 1,
        hp: 300,
        maxHp: 300,
        cardLevel: 1,
        activeAtTick: ACTIVATION_DELAY_TICKS,
        nextOrbTick: null,
        nextAttackTick: 0,
        trapReadyAtTick: null,
        trapRearmed: false,
        attackCount: 0,
        burstShotsRemaining: 0,
      },
    ]);
  });

  it('3.4: a placed defender is inactive for the 0.5 s drop (15 ticks)', () => {
    const sim = createTestSim();

    sim.enqueue(place(SPARKBOLT, 2, 3));
    sim.step();
    const defender = sim.state.defenders[0];
    expect(defender).toBeDefined();
    if (defender === undefined) {
      return;
    }

    expect(ACTIVATION_DELAY_TICKS).toBe(
      Math.round(rules.placement.defenderActivationDelayS * rules.tick.tickRate),
    );
    expect(ACTIVATION_DELAY_TICKS).toBe(15);
    expect(defender.activeAtTick).toBe(15);
    expect(isDefenderActive(defender, 14)).toBe(false);
    expect(isDefenderActive(defender, 15)).toBe(true);
  });

  it('3.4: rejects a place command when the player cannot afford the cost', () => {
    const sim = createTestSim({ startEssence: 50 });

    sim.enqueue(place(SPARKBOLT, 0, 0));

    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'notEnoughEssence' }]);
    expect(sim.state.essence).toBe(50);
    expect(sim.state.defenders).toEqual([]);
    expect(sim.state.nextId).toBe(1);
  });

  it('3.4: rejects unknown cards, out-of-bounds tiles, inactive lanes and rock with invalidTile', () => {
    const sim = createTestSim({
      activeLanes: [0],
      terrain: [{ lane: 0, col: 2, type: 'rock' }],
    });

    sim.enqueue(place('not_a_defender', 0, 0));
    sim.enqueue(place(SPARKBOLT, 5, 0));
    sim.enqueue(place(SPARKBOLT, 0, 9));
    sim.enqueue(place(SPARKBOLT, 1, 0));
    sim.enqueue(place(SPARKBOLT, 0, 2));
    const events = sim.step();

    expect(events).toHaveLength(5);
    for (const event of events) {
      expect(event).toEqual({ type: 'commandRejected', reason: 'invalidTile' });
    }
    expect(sim.state.defenders).toEqual([]);
  });

  it('3.4: rejects an occupied tile with tileOccupied when the defender differs', () => {
    const sim = createTestSim({}, [
      { defenderId: SPARKBOLT, level: 1 },
      { defenderId: GLOWSHROOM, level: 1 },
    ]);

    sim.enqueue(place(SPARKBOLT, 1, 1));
    sim.step();
    sim.enqueue(place(GLOWSHROOM, 1, 1));

    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'tileOccupied' }]);
    expect(sim.state.defenders).toHaveLength(1);
  });

  it('3.4: enemies standing on the tile do not block placement', () => {
    const sim = createTestSim();
    sim.state.enemies.push({
      id: 900,
      enemyId: 'gloomling',
      lane: 0,
      x: 0.5,
      hp: 200,
      maxHp: 200,
      waveIndex: 0,
      blockedByDefenderId: null,
      nextBiteTick: null,
      statuses: [],
      comboCooldowns: { steam: 0, shatter: 0, toxic: 0, chain: 0 },
    });

    sim.enqueue(place(SPARKBOLT, 0, 0));
    const events = sim.step();

    expect(events).toEqual([
      { type: 'defenderPlaced', id: 1, defenderId: SPARKBOLT, lane: 0, col: 0, stars: 1 },
    ]);
  });

  it('3.4/4.2: a placed defender gets the card-level health scaling', () => {
    const sim = createTestSim({}, [{ defenderId: SPARKBOLT, level: 3 }]);

    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();

    // hp = baseHp * L * S with L = 1 + 0.08 * 2 = 1.16 and S = 1 (spec 4.2).
    expect(sim.state.defenders[0]).toMatchObject({ cardLevel: 3, hp: 348, maxHp: 348 });
  });

  it('3.5: placing starts the cooldown for cooldownS and blocks the card until then', () => {
    const sim = createTestSim();
    const cooldownTicks = Math.round(7.5 * rules.tick.tickRate);
    expect(cooldownTicks).toBe(225);

    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
    expect(sim.state.cardCooldownEndTicks[0]).toBe(cooldownTicks);
    expect(isCardReady(sim.state, 0)).toBe(false);

    sim.enqueue(place(SPARKBOLT, 0, 1));
    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'onCooldown' }]);

    while (sim.state.tick < cooldownTicks) {
      sim.step();
    }
    expect(isCardReady(sim.state, 0)).toBe(true);

    sim.enqueue(place(SPARKBOLT, 0, 1));
    expect(sim.step()[0]).toMatchObject({ type: 'defenderPlaced', id: 2 });
  });

  it('3.5: startsReady false cards are on cooldown from tick 0', () => {
    const sim = createTestSim({ startEssence: 100 }, [{ defenderId: IRON_GRANNY, level: 1 }]);
    const cooldownTicks = Math.round(30 * rules.tick.tickRate);
    expect(cooldownTicks).toBe(900);

    expect(sim.state.cardCooldownEndTicks[0]).toBe(cooldownTicks);
    sim.enqueue(place(IRON_GRANNY, 0, 0));
    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'onCooldown' }]);

    while (sim.state.tick < cooldownTicks) {
      sim.step();
    }
    expect(isCardReady(sim.state, 0)).toBe(true);

    sim.enqueue(place(IRON_GRANNY, 0, 0));
    expect(sim.step()[0]).toMatchObject({ type: 'defenderPlaced', id: 1 });
    expect(sim.state.essence).toBe(50);
    expect(sim.state.defenders[0]).toMatchObject({ defenderId: IRON_GRANNY, hp: 4000 });
  });

  it('3.7: shovel removes the defender instantly with no refund and no cooldown', () => {
    const sim = createTestSim();

    sim.enqueue(place(SPARKBOLT, 3, 3));
    sim.step();
    const essenceAfterPlace = sim.state.essence;
    const cooldownAfterPlace = sim.state.cardCooldownEndTicks[0];

    sim.enqueue({ type: 'shovel', lane: 3, col: 3 });
    const events = sim.step();

    expect(events).toEqual([{ type: 'defenderRemoved', id: 1, reason: 'shovel' }]);
    expect(sim.state.defenders).toEqual([]);
    expect(sim.state.essence).toBe(essenceAfterPlace);
    expect(sim.state.cardCooldownEndTicks[0]).toBe(cooldownAfterPlace);
    expect(isCardReady(sim.state, 0)).toBe(false);
  });

  it('3.7: shovelling an empty tile is rejected', () => {
    const sim = createTestSim();
    const before = snapshot(sim);

    sim.enqueue({ type: 'shovel', lane: 0, col: 0 });

    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'invalidTile' }]);
    expect(snapshot(sim)).toBe(before);
  });

  it('11.3: a rejected command changes nothing', () => {
    const sim = createTestSim({ startEssence: 50 });
    const before = snapshot(sim);

    sim.enqueue(place(SPARKBOLT, 0, 0));
    const events = sim.step();

    expect(events).toEqual([{ type: 'commandRejected', reason: 'notEnoughEssence' }]);
    expect(snapshot(sim)).toBe(before);
  });

  it('11.3: every entity id comes from one counter and is never reused', () => {
    const sim = createTestSim({ startEssence: 999 }, [
      { defenderId: SPARKBOLT, level: 1 },
      { defenderId: GLOWSHROOM, level: 1 },
    ]);

    sim.enqueue(place(SPARKBOLT, 0, 0));
    expect(sim.step()[0]).toMatchObject({ type: 'defenderPlaced', id: 1 });
    sim.enqueue(place(GLOWSHROOM, 1, 1));
    expect(sim.step()[0]).toMatchObject({ type: 'defenderPlaced', id: 2 });

    sim.enqueue({ type: 'shovel', lane: 0, col: 0 });
    sim.step();
    // The Glowshroom Monk drops its first orb before the Sparkbolt card is ready
    // again; the orb takes the next id from the same counter (spec 3.3, 11.3).
    while (sim.state.tick < 225) {
      sim.step();
    }
    expect(sim.state.orbs.map((orb) => orb.id)).toEqual([3]);
    sim.enqueue(place(SPARKBOLT, 0, 0));
    expect(sim.step()[0]).toMatchObject({ type: 'defenderPlaced', id: 4 });
    expect(sim.state.nextId).toBe(5);
    expect(sim.state.defenders.map((defender) => defender.id)).toEqual([2, 4]);
  });

  it('11.3: queued commands are applied in order within one tick', () => {
    const sim = createTestSim();

    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.enqueue({ type: 'shovel', lane: 0, col: 0 });
    const events = sim.step();

    expect(events).toEqual([
      { type: 'defenderPlaced', id: 1, defenderId: SPARKBOLT, lane: 0, col: 0, stars: 1 },
      { type: 'defenderRemoved', id: 1, reason: 'shovel' },
    ]);
    expect(sim.state.defenders).toEqual([]);
  });

  it('11.3: collectOrb is accepted without events until issue #19 implements orbs', () => {
    const sim = createTestSim();

    sim.enqueue({ type: 'collectOrb', orbId: 1 });

    expect(sim.step()).toEqual([]);
    expect(sim.state.orbs).toEqual([]);
  });
});
