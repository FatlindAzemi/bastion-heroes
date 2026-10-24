import { describe, expect, it } from 'vitest';

import { defenderById, levelById } from '../../src/data';
import type { LevelDef } from '../../src/data';
import { createRng, createSim } from '../../src/sim';
import type { LoadoutEntry, Sim } from '../../src/sim';
import {
  DECISION_INTERVAL_TICKS,
  createLoadout,
  decideCommands,
  loadoutDefenderIds,
  runBotRun,
} from '../../tools/balance-sim/bots';
import { createTestLevel } from '../sim/testLevel';

/** A wave spawn helper for the small bot fixtures (spec 7.1). */
function spawn(enemy: string, count = 1): { enemy: string; count: number; lanes: 'random' } {
  return { enemy, count, lanes: 'random' };
}

/** A schema-valid test level with the given wave spawns (spec 7.1). */
function levelWithWaves(
  spawnsByWave: { enemy: string; count: number; lanes: 'random' }[][],
  startEssence = 150,
): LevelDef {
  return createTestLevel({
    activeLanes: [2],
    startEssence,
    skyDrops: false,
    firstWaveDelay: 1,
    waves: spawnsByWave.map((spawns) => ({ spawns })),
  });
}

/** One loadout entry helper. */
function card(defenderId: string, level = 1): LoadoutEntry {
  return { defenderId, level };
}

/** Steps until the predicate holds, the level ends or the safety cap is hit. */
function stepUntil(sim: Sim, predicate: () => boolean, maxTicks = 2000): void {
  let ticks = 0;
  while (!predicate() && sim.state.status === 'playing' && ticks < maxTicks) {
    sim.step();
    ticks += 1;
  }
}

/** Advances to the next 15-tick decision point of spec 16.2. */
function alignToDecisionTick(sim: Sim): void {
  while (sim.state.tick % DECISION_INTERVAL_TICKS !== 0 && sim.state.status === 'playing') {
    sim.step();
  }
}

/** Runs one decision of one bot variant against the current state. */
function decide(level: LevelDef, sim: Sim, botId: Parameters<typeof decideCommands>[0]['botId']) {
  return decideCommands({ level, state: sim.state, botId, rng: null });
}

describe('16.2 bot loadouts', () => {
  it('16.2: the recommended loadout has one counter per armour, a producer and a fill', () => {
    const level = levelWithWaves([[spawn('gloomling'), spawn('pothead'), spawn('shade_wisp')]]);
    const ids = loadoutDefenderIds(level, 'recommended', 0);
    const oneOf = (options: string[]): boolean => options.some((id) => ids.includes(id));

    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toContain('glowshroom_monk');
    expect(oneOf(['sparkbolt_gremlin', 'snowpup_yeti'])).toBe(true);
    expect(oneOf(['boomcap_brewer', 'pyro_fox'])).toBe(true);
    expect(oneOf(['rune_archer', 'frost_witch'])).toBe(true);
  });

  it('16.2: the recommended loadout tie-breaks vary with the run seed', () => {
    const level = levelWithWaves([[spawn('gloomling'), spawn('pothead'), spawn('shade_wisp')]]);
    const loadouts = new Set(
      Array.from({ length: 8 }, (_, runSeed) =>
        loadoutDefenderIds(level, 'recommended', runSeed).join(','),
      ),
    );

    expect(loadouts.size).toBeGreaterThan(1);
    expect(loadoutDefenderIds(level, 'recommended', 3)).toEqual(
      loadoutDefenderIds(level, 'recommended', 3),
    );
  });

  it('16.2: the commons loadout contains only Common and Rare cards', () => {
    const level = createTestLevel();
    const ids = loadoutDefenderIds(level, 'commons', 0);

    expect(ids).toHaveLength(6);
    for (const id of ids) {
      const rarity = defenderById[id]?.rarity;
      expect(rarity === 'common' || rarity === 'rare').toBe(true);
    }
  });

  it('16.2: the whale loadout is level 10 and starts with the Epic cards', () => {
    const level = createTestLevel();
    const entries = createLoadout(level, 'whale', 0);

    expect(entries.every((entry) => entry.level === 10)).toBe(true);
    expect(entries.map((entry) => entry.defenderId)).toEqual(
      expect.arrayContaining(['frost_witch', 'pyro_fox']),
    );
  });

  it('16.2: a fixed tutorial level keeps its fixed loadout for every bot', () => {
    const level = levelById['w1_l01'];
    expect(level).toBeDefined();
    if (level === undefined) {
      return;
    }
    expect(loadoutDefenderIds(level, 'random', 3)).toEqual(['sparkbolt_gremlin']);
  });

  it('16.2: the random loadout is deterministic for a run seed', () => {
    const level = createTestLevel();

    expect(loadoutDefenderIds(level, 'random', 7)).toEqual(loadoutDefenderIds(level, 'random', 7));
  });
});

describe('16.2 priority list', () => {
  it('16.2 rule 3: the economy rule places a producer in column 0 of the emptiest lane', () => {
    const level = createTestLevel({ activeLanes: [2], skyDrops: false, firstWaveDelay: 120 });
    const sim = createSim(level, [card('glowshroom_monk')], level.seed);

    expect(decide(level, sim, 'recommended')).toEqual([
      { type: 'place', defenderId: 'glowshroom_monk', lane: 2, col: 0 },
    ]);
  });

  it('16.2 rule 2: an enemy within 2 tiles of the base gets the cheapest attacker in column 0', () => {
    const level = levelWithWaves([[spawn('gloomling')]]);
    const sim = createSim(level, [card('sparkbolt_gremlin'), card('snowpup_yeti')], level.seed);
    stepUntil(sim, () => sim.state.enemies.some((enemy) => enemy.lane === 2 && enemy.x <= 2), 6000);
    alignToDecisionTick(sim);

    expect(decide(level, sim, 'recommended')).toEqual([
      { type: 'place', defenderId: 'sparkbolt_gremlin', lane: 2, col: 0 },
    ]);
  });

  it('16.2 rule 4: coverage reinforces a lane with an incoming enemy in the frontmost free column', () => {
    const level = levelWithWaves([[spawn('gloomling')]]);
    const sim = createSim(level, [card('sparkbolt_gremlin')], level.seed);
    stepUntil(sim, () => sim.state.enemies.length > 0);
    alignToDecisionTick(sim);

    expect(decide(level, sim, 'recommended')).toEqual([
      { type: 'place', defenderId: 'sparkbolt_gremlin', lane: 2, col: 4 },
    ]);
  });

  it('16.2 rule 5: a tank above 600 health gets a wall in column 6', () => {
    const level = levelWithWaves([[spawn('gloom_ogre')]]);
    const sim = createSim(level, [card('iron_granny')], level.seed);
    stepUntil(sim, () => sim.state.tick >= 930, 1200);
    alignToDecisionTick(sim);

    expect(decide(level, sim, 'recommended')).toEqual([
      { type: 'place', defenderId: 'iron_granny', lane: 2, col: 6 },
    ]);
  });

  it('16.2 rule 6: an attacker is merged in the lane with the most enemy health', () => {
    const level = levelWithWaves([[spawn('gloomling')]], 400);
    const sim = createSim(level, [card('sparkbolt_gremlin')], level.seed);
    stepUntil(sim, () => sim.state.enemies.length > 0);
    alignToDecisionTick(sim);
    for (const command of decide(level, sim, 'recommended')) {
      sim.enqueue(command);
    }
    sim.step();
    stepUntil(sim, () => sim.state.tick >= 270);
    alignToDecisionTick(sim);

    const commands = decide(level, sim, 'recommended');
    expect(commands).toEqual([{ type: 'place', defenderId: 'sparkbolt_gremlin', lane: 2, col: 4 }]);
  });

  it('16.2 rule 1: the bot collects every orb before doing anything else', () => {
    const level = createTestLevel({
      activeLanes: [2],
      skyDrops: true,
      firstWaveDelay: 120,
      waves: [{ spawns: [] }],
    });
    const sim = createSim(level, [card('sparkbolt_gremlin')], level.seed);
    stepUntil(sim, () => sim.state.orbs.length > 0);
    alignToDecisionTick(sim);
    const orbId = sim.state.orbs[0]?.id;
    const commands = decide(level, sim, 'recommended');

    expect(commands).toEqual([{ type: 'collectOrb', orbId }]);
  });

  it('16.2: idle never acts, not even to collect an orb', () => {
    const level = createTestLevel({
      activeLanes: [2],
      skyDrops: true,
      firstWaveDelay: 120,
      waves: [{ spawns: [] }],
    });
    const sim = createSim(level, [card('sparkbolt_gremlin')], level.seed);
    stepUntil(sim, () => sim.state.orbs.length > 0);

    expect(decide(level, sim, 'idle')).toEqual([]);
  });

  it('16.2: the random variant places a random affordable card every 3 s', () => {
    const level = createTestLevel({
      activeLanes: [2],
      skyDrops: false,
      firstWaveDelay: 120,
      waves: [{ spawns: [] }],
    });
    const sim = createSim(level, [card('sparkbolt_gremlin')], level.seed);
    stepUntil(sim, () => sim.state.tick >= 90);
    alignToDecisionTick(sim);
    const commands = decideCommands({
      level,
      state: sim.state,
      botId: 'random',
      rng: createRng(1),
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('place');
  });
});

describe('16.2 bot run smoke test', () => {
  it('16.2: a recommended bot run returns a complete result on W1-L01', () => {
    const level = levelById['w1_l01'];
    expect(level).toBeDefined();
    if (level === undefined) {
      return;
    }
    const result = runBotRun(level, 'recommended', 0);

    expect(result.levelId).toBe('w1_l01');
    expect(result.botId).toBe('recommended');
    expect(result.runSeed).toBe(0);
    expect(['won', 'lost']).toContain(result.status);
    expect(result.durationTicks).toBeGreaterThan(0);
    expect(result.stars).toBeGreaterThanOrEqual(0);
    expect(result.stars).toBeLessThanOrEqual(3);
    expect(result.essenceAvailable).toBeGreaterThanOrEqual(level.startEssence);
    expect(result.timedOut).toBe(false);
  });

  it('16.2: every variant produces a result on W1-L01', () => {
    const level = levelById['w1_l01'];
    expect(level).toBeDefined();
    if (level === undefined) {
      return;
    }
    for (const botId of ['idle', 'random', 'commons', 'recommended', 'whale'] as const) {
      const result = runBotRun(level, botId, 1);
      expect(result.botId).toBe(botId);
      expect(result.durationTicks).toBeGreaterThan(0);
    }
  });
});
