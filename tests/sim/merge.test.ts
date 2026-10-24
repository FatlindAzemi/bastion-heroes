import { describe, expect, it } from 'vitest';

import { defenderById, rules } from '../../src/data';
import type { DefenderDef } from '../../src/data';
import { createSim } from '../../src/sim/createSim';
import { MAX_STARS, starModelScale } from '../../src/sim/stars';
import type { Command, LoadoutEntry, Sim, SimState } from '../../src/sim/types';
import { createTestLevel, type TestLevelOptions } from './testLevel';

const SPARKBOLT = 'sparkbolt_gremlin';
const GLOWSHROOM = 'glowshroom_monk';
const SPARKBOLT_COOLDOWN_TICKS = Math.round(7.5 * rules.tick.tickRate);

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

/** Steps the sim until its tick reaches the given tick. */
function advanceTo(sim: Sim, tick: number): void {
  while (sim.state.tick < tick) {
    sim.step();
  }
}

/** The first defender of a sim, requiring that it exists. */
function firstDefender(sim: Sim): SimState['defenders'][number] {
  const defender = sim.state.defenders[0];
  if (defender === undefined) {
    throw new Error('expected a defender');
  }
  return defender;
}

/** Registers a fixture definition in the data registry (white-box test seam, like patterns.test.ts). */
function registerDefenderDef(def: DefenderDef): DefenderDef {
  (defenderById as Record<string, DefenderDef>)[def.id] = def;
  return def;
}

/** Builds a schema-shaped defender definition for the no-merge seam tests. */
function makeDefenderDef(overrides: Partial<DefenderDef> & { id: string }): DefenderDef {
  return {
    name: overrides.id,
    faction: 'wildgrove',
    rarity: 'common',
    role: 'wall',
    cost: 25,
    cooldownS: 7.5,
    startsReady: true,
    hp: 100,
    pattern: 'wall',
    damage: 0,
    element: 'none',
    star3Bonus: 'none',
    milestone: 'M7',
    ...overrides,
  };
}

/** Merges the Sparkbolt Gremlin on a tile up to the given number of stars (places it again per cooldown). */
function mergeSparkboltTo(sim: Sim, stars: 1 | 2 | 3): void {
  sim.enqueue(place(SPARKBOLT, 0, 0));
  sim.step();
  for (let level = 2; level <= stars; level += 1) {
    advanceTo(sim, (level - 1) * SPARKBOLT_COOLDOWN_TICKS);
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
  }
}

// Spec 3.6, 4.2 and 11.3: merge to ★2/★3, star multipliers and the no-merge seam.
describe('merge (spec 3.6)', () => {
  it('3.6: placing the same defender on a ★1 tile merges to ★2, pays full cost/cooldown and heals', () => {
    const sim = createTestSim({ startEssence: 999 });
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
    const defender = firstDefender(sim);
    (defender as { hp: number }).hp = 1;
    advanceTo(sim, SPARKBOLT_COOLDOWN_TICKS);

    sim.enqueue(place(SPARKBOLT, 0, 0));
    const events = sim.step();

    expect(events).toEqual([{ type: 'defenderMerged', id: defender.id, stars: 2 }]);
    expect(sim.state.defenders).toHaveLength(1);
    expect(sim.state.essence).toBe(999 - 2 * 100);
    expect(sim.state.cardCooldownEndTicks[0]).toBe(2 * SPARKBOLT_COOLDOWN_TICKS);
    expect(defender.stars).toBe(2);
    // ★2 = health × 1.6 (spec 3.6, 4.2), rounded to whole health.
    expect(defender.maxHp).toBe(Math.round(300 * rules.merge.star2HealthMultiplier));
    expect(defender.hp).toBe(defender.maxHp);
  });

  it('3.6: a second merge raises ★2 to ★3 with the ×2.5 health multiplier', () => {
    const sim = createTestSim({ startEssence: 999 });
    mergeSparkboltTo(sim, 3);
    const defender = firstDefender(sim);

    expect(defender.stars).toBe(3);
    expect(sim.state.defenders).toHaveLength(1);
    expect(defender.maxHp).toBe(Math.round(300 * rules.merge.star3HealthMultiplier));
    expect(defender.hp).toBe(defender.maxHp);
    expect(sim.state.essence).toBe(999 - 3 * 100);
  });

  it('3.6: placing on a ★3 tile is rejected with tileOccupied and changes nothing', () => {
    const sim = createTestSim({ startEssence: 999 });
    mergeSparkboltTo(sim, 3);
    const defender = firstDefender(sim);
    const essenceBefore = sim.state.essence;
    const cooldownBefore = sim.state.cardCooldownEndTicks[0];

    advanceTo(sim, 3 * SPARKBOLT_COOLDOWN_TICKS);
    sim.enqueue(place(SPARKBOLT, 0, 0));
    const events = sim.step();

    expect(events).toEqual([{ type: 'commandRejected', reason: 'tileOccupied' }]);
    expect(sim.state.essence).toBe(essenceBefore);
    expect(sim.state.cardCooldownEndTicks[0]).toBe(cooldownBefore);
    expect(defender.stars).toBe(3);
  });

  it('3.6: a merge pays the full cost and starts the full cooldown like a placement', () => {
    const sim = createTestSim({ startEssence: 200 });
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
    advanceTo(sim, SPARKBOLT_COOLDOWN_TICKS);

    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();

    expect(sim.state.essence).toBe(0);
    expect(sim.state.cardCooldownEndTicks[0]).toBe(2 * SPARKBOLT_COOLDOWN_TICKS);
  });

  it('3.6: a merge needs the full Essence cost and is rejected with notEnoughEssence', () => {
    const sim = createTestSim({ startEssence: 999 });
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
    (sim.state as SimState).essence = 50;
    advanceTo(sim, SPARKBOLT_COOLDOWN_TICKS);

    sim.enqueue(place(SPARKBOLT, 0, 0));

    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'notEnoughEssence' }]);
    expect(firstDefender(sim).stars).toBe(1);
  });

  it('4.2/3.6: card-level and star health scaling combine (hp = baseHp × L × S)', () => {
    const sim = createTestSim({ startEssence: 999 }, [{ defenderId: SPARKBOLT, level: 3 }]);
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
    const defender = firstDefender(sim);
    const cardLevelFactor = 1 + rules.combat.cardLevelMultiplierPerLevel * 2;
    expect(defender.maxHp).toBe(Math.round(300 * cardLevelFactor));

    advanceTo(sim, SPARKBOLT_COOLDOWN_TICKS);
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();

    expect(defender.maxHp).toBe(
      Math.round(300 * cardLevelFactor * rules.merge.star2HealthMultiplier),
    );
    expect(defender.hp).toBe(defender.maxHp);
  });

  it('3.6/4.2: a merged defender fires with the damage star multiplier, without double applying it', () => {
    const sim = createTestSim({ startEssence: 999 });
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
    advanceTo(sim, SPARKBOLT_COOLDOWN_TICKS);
    sim.enqueue(place(SPARKBOLT, 0, 0));
    sim.step();
    (sim.state as SimState).enemies.push({
      id: 900,
      enemyId: 'gloomling',
      lane: 0,
      x: 3,
      hp: 200,
      maxHp: 200,
      waveIndex: 0,
      blockedByDefenderId: null,
      nextBiteTick: null,
      statuses: [],
      comboCooldowns: { steam: 0, shatter: 0, toxic: 0, chain: 0 },
    });

    sim.step();

    const projectile = sim.state.projectiles[0];
    expect(projectile?.damage).toBe(20 * rules.merge.star2DamageMultiplier);
  });

  it('3.6: an Aurora-like defender with maxStars 1 cannot merge (documented no-merge seam)', () => {
    const noMerge = registerDefenderDef(makeDefenderDef({ id: 'test_no_merge', maxStars: 1 }));
    const sim = createTestSim({ startEssence: 999 }, [{ defenderId: noMerge.id, level: 1 }]);
    sim.enqueue(place(noMerge.id, 0, 0));
    sim.step();
    advanceTo(sim, SPARKBOLT_COOLDOWN_TICKS);

    sim.enqueue(place(noMerge.id, 0, 0));

    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'tileOccupied' }]);
    expect(firstDefender(sim).stars).toBe(1);
  });

  it('3.6: maxStars 2 allows one merge and rejects the second', () => {
    const twoStarMax = registerDefenderDef(
      makeDefenderDef({ id: 'test_two_star_max', maxStars: 2 }),
    );
    const sim = createTestSim({ startEssence: 999 }, [{ defenderId: twoStarMax.id, level: 1 }]);
    sim.enqueue(place(twoStarMax.id, 0, 0));
    sim.step();
    advanceTo(sim, SPARKBOLT_COOLDOWN_TICKS);
    sim.enqueue(place(twoStarMax.id, 0, 0));
    expect(sim.step()).toEqual([{ type: 'defenderMerged', id: firstDefender(sim).id, stars: 2 }]);

    advanceTo(sim, 2 * SPARKBOLT_COOLDOWN_TICKS);
    sim.enqueue(place(twoStarMax.id, 0, 0));

    expect(sim.step()).toEqual([{ type: 'commandRejected', reason: 'tileOccupied' }]);
    expect(firstDefender(sim).stars).toBe(2);
  });

  it('3.6: the model-scale numbers of every star level are exposed to the renderer', () => {
    expect(MAX_STARS).toBe(3);
    expect(starModelScale(1)).toBe(1);
    expect(starModelScale(2)).toBe(rules.merge.star2Scale);
    expect(starModelScale(3)).toBe(rules.merge.star3Scale);
  });
});

// Spec 3.6: producer intervals get faster at ★2/★3 and a pending orb timer is rebased on merge.
describe('producer merge (spec 3.6)', () => {
  const COOLDOWN_TICKS = Math.round(7.5 * rules.tick.tickRate);
  const FIRST_ORB_TICKS = Math.round(7 * rules.tick.tickRate);
  const BASE_INTERVAL_TICKS = Math.round(24 * rules.tick.tickRate);
  const STAR2_INTERVAL_TICKS = Math.round(
    (24 / rules.merge.producerStar2IntervalDivisor) * rules.tick.tickRate,
  );

  it('3.6: ★2 divides the producer interval by 1.5 and rebases the pending orb timer', () => {
    const sim = createTestSim({ startEssence: 999 }, [{ defenderId: GLOWSHROOM, level: 1 }]);
    sim.enqueue(place(GLOWSHROOM, 2, 0));
    sim.step();
    const defender = firstDefender(sim);
    expect(defender.nextOrbTick).toBe(FIRST_ORB_TICKS);

    // The first orb drops at 7 s; the card is ready again at 7.5 s (spec 5.2, 5.1).
    advanceTo(sim, COOLDOWN_TICKS);
    expect(defender.nextOrbTick).toBe(FIRST_ORB_TICKS + BASE_INTERVAL_TICKS);
    sim.enqueue(place(GLOWSHROOM, 2, 0));
    expect(sim.step()).toEqual([{ type: 'defenderMerged', id: defender.id, stars: 2 }]);

    // The remaining 705 ticks of the 720-tick interval become 480-tick interval time.
    const rebasedTick =
      COOLDOWN_TICKS +
      Math.round(
        ((FIRST_ORB_TICKS + BASE_INTERVAL_TICKS - COOLDOWN_TICKS) * STAR2_INTERVAL_TICKS) /
          BASE_INTERVAL_TICKS,
      );
    expect(defender.nextOrbTick).toBe(rebasedTick);

    while (sim.state.tick <= rebasedTick) {
      sim.step();
    }
    const spawned = sim.state.orbs.find((orb) => orb.spawnTick === rebasedTick);
    expect(spawned?.value).toBe(25);
    expect(defender.nextOrbTick).toBe(rebasedTick + STAR2_INTERVAL_TICKS);
  });

  it('3.6: ★3 divides the producer interval by 2', () => {
    const sim = createTestSim({ startEssence: 999 }, [{ defenderId: GLOWSHROOM, level: 1 }]);
    sim.enqueue(place(GLOWSHROOM, 2, 0));
    sim.step();
    const defender = firstDefender(sim);
    advanceTo(sim, COOLDOWN_TICKS);
    sim.enqueue(place(GLOWSHROOM, 2, 0));
    sim.step();
    advanceTo(sim, 2 * COOLDOWN_TICKS);
    sim.enqueue(place(GLOWSHROOM, 2, 0));
    expect(sim.step()).toEqual([{ type: 'defenderMerged', id: defender.id, stars: 3 }]);

    const nextOrbTick = defender.nextOrbTick ?? 0;
    while (sim.state.tick <= nextOrbTick) {
      sim.step();
    }

    expect(sim.state.orbs.some((orb) => orb.spawnTick === nextOrbTick)).toBe(true);
    expect(defender.nextOrbTick).toBe(
      nextOrbTick +
        Math.round((24 / rules.merge.producerStar3IntervalDivisor) * rules.tick.tickRate),
    );
  });
});
