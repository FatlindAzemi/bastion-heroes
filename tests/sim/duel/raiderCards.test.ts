import { describe, expect, it } from 'vitest';
import { duelRules, enemyById } from '../../../src/data';
import { countRaiders, raiderSpawnXOf } from '../../../src/sim/duel';
import type { Side } from '../../../src/sim/duel';
import {
  addRaider,
  createStartedSim,
  eventsOfType,
  playDefender,
  playRaider,
  raiderStepTiles,
  raidersOf,
  rejectReasons,
  setEssence,
  stepTicks,
  ticks,
} from './duelTestKit';

const SUMMON_DELAY_TICKS = ticks(duelRules.raiders.summonDelayS);
const RAIDER_CAP = duelRules.raiders.maxLivingRaiders;
const SIDES: readonly Side[] = ['south', 'north'];

/** Fills a side with active raiders in lane 4, far from every other test unit. */
function fillRaiders(sim: ReturnType<typeof createStartedSim>, side: Side, count: number): void {
  for (let index = 0; index < count; index += 1) {
    addRaider(sim, side, 'bat_swarm', 4, 4.5);
  }
}

describe('playing raider cards (spec 18.5)', () => {
  it.each(SIDES)('%s may play a raider into each of the five lanes', (side) => {
    for (let lane = 0; lane < 5; lane += 1) {
      const sim = createStartedSim();
      const events = playRaider(sim, side, 'pothead', lane);
      expect(rejectReasons(events)).toEqual([]);
      expect(sim.state.summons).toMatchObject([{ side, enemyId: 'pothead', lane }]);
    }
  });

  it.each(SIDES)('the raider of %s appears at its spawn point and pays the Duel cost', (side) => {
    const sim = createStartedSim();
    const essence = sim.state.sides[side].essence;
    const events = playRaider(sim, side, 'pothead', 2);
    const cost = enemyById['pothead']?.duel?.cost ?? 0;

    expect(sim.state.sides[side].essence).toBe(essence - cost);
    expect(eventsOfType(events, 'enemySpawned')).toEqual([
      { type: 'enemySpawned', side, id: expect.any(Number), enemyId: 'pothead', lane: 2 },
    ]);
    const summon = sim.state.summons[0];
    expect(summon?.raider).toMatchObject({ side, lane: 2, x: raiderSpawnXOf(side) });
    expect(raiderSpawnXOf(side)).toBe(side === 'south' ? 0.4 : 8.6);
  });

  it('becomes active after 1.0 s: it does not move during the summon, then walks', () => {
    const sim = createStartedSim();
    playRaider(sim, 'south', 'pothead', 2);
    const playedTick = sim.state.tick - 1;
    expect(sim.state.summons[0]?.activeAtTick).toBe(playedTick + SUMMON_DELAY_TICKS);

    stepTicks(sim, SUMMON_DELAY_TICKS - 1);
    expect(sim.state.enemies).toEqual([]);
    expect(sim.state.summons[0]?.raider?.x).toBe(0.4);

    sim.step();
    expect(sim.state.summons).toEqual([]);
    const [raider] = raidersOf(sim, 'south');
    expect(raider?.x).toBeCloseTo(0.4 + raiderStepTiles('pothead'), 10);
  });

  it('cannot be targeted during the summon', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 0, 0);
    stepTicks(sim, ticks(0.5));
    playRaider(sim, 'north', 'pothead', 0);

    const summonEvents = stepTicks(sim, SUMMON_DELAY_TICKS - 1);
    expect(eventsOfType(summonEvents, 'attack')).toEqual([]);
    expect(eventsOfType(summonEvents, 'projectileSpawned')).toEqual([]);

    const activeEvents = stepTicks(sim, 2);
    expect(eventsOfType(activeEvents, 'attack')).toHaveLength(1);
  });

  it('cannot attack or block during the summon', () => {
    const sim = createStartedSim();
    const intruder = addRaider(sim, 'north', 'gloomling', 0, 0.8);
    playRaider(sim, 'south', 'pothead', 0);

    const summonEvents = stepTicks(sim, SUMMON_DELAY_TICKS - 1);
    expect(eventsOfType(summonEvents, 'attack')).toEqual([]);
    expect(intruder.x).toBeCloseTo(0.8 - SUMMON_DELAY_TICKS * raiderStepTiles('gloomling'), 10);

    // Active: both stand within 0.55 of each other, so they block each other and fight.
    const activeEvents = sim.step();
    const [summoned] = raidersOf(sim, 'south');
    expect(intruder.blockedByEnemyId).toBe(summoned?.id);
    expect(summoned?.blockedByEnemyId).toBe(intruder.id);
    expect(eventsOfType(activeEvents, 'attack')).toHaveLength(2);
  });

  it('a Gloom Priest heals one interval after it became active', () => {
    const sim = createStartedSim();
    playRaider(sim, 'south', 'gloom_priest', 1);
    const playedTick = sim.state.tick - 1;
    stepTicks(sim, SUMMON_DELAY_TICKS);
    const healIntervalTicks = ticks(enemyById['gloom_priest']?.healIntervalS ?? 0);
    expect(raidersOf(sim, 'south')[0]?.nextHealTick).toBe(
      playedTick + SUMMON_DELAY_TICKS + healIntervalTicks,
    );
  });

  it('a rejected command changes nothing', () => {
    const sim = createStartedSim();
    setEssence(sim, 'south', 1);
    const before = JSON.stringify({ ...sim.state, tick: 0 });
    const command = { type: 'playRaider', side: 'south', cardId: 'pothead', lane: 2 } as const;
    sim.enqueue(command, sim.state.tick);
    expect(sim.step()).toEqual([
      { type: 'commandRejected', side: 'south', reason: 'notEnoughEssence', command },
    ]);
    expect(JSON.stringify({ ...sim.state, tick: 0 })).toBe(before);
  });

  it('rejects cards that are not Duel raiders and lanes outside the grid', () => {
    const sim = createStartedSim();
    expect(rejectReasons(playRaider(sim, 'south', 'sparkbolt_gremlin', 0))).toEqual([
      'invalidCard',
    ]);
    expect(rejectReasons(playRaider(sim, 'south', 'morvak', 0))).toEqual(['invalidCard']);
    expect(rejectReasons(playRaider(sim, 'south', 'no_such_card', 0))).toEqual(['invalidCard']);
    expect(rejectReasons(playRaider(sim, 'south', 'pothead', 5))).toEqual(['invalidTile']);
    expect(rejectReasons(playRaider(sim, 'south', 'pothead', -1))).toEqual(['invalidTile']);
    expect(rejectReasons(playRaider(sim, 'south', 'pothead', 1.5))).toEqual(['invalidTile']);
    expect(sim.state.summons).toEqual([]);
  });
});

describe('multi-summon cards (spec 18.8)', () => {
  it('the Gloomling card summons 2 Gloomlings 0.6 s apart for one cost', () => {
    const sim = createStartedSim();
    const essence = sim.state.sides.north.essence;
    const firstEvents = playRaider(sim, 'north', 'gloomling', 3);
    const gapTicks = ticks(enemyById['gloomling']?.duel?.summonGapS ?? 0);
    expect(gapTicks).toBe(18);

    expect(sim.state.sides.north.essence).toBe(essence - 2);
    expect(eventsOfType(firstEvents, 'enemySpawned')).toHaveLength(1);
    expect(sim.state.summons).toHaveLength(2);

    const beforeSecond = stepTicks(sim, gapTicks - 1);
    expect(eventsOfType(beforeSecond, 'enemySpawned')).toEqual([]);
    expect(eventsOfType(sim.step(), 'enemySpawned')).toHaveLength(1);

    // The second Gloomling becomes active 0.6 s after the first and walks 0.6 s behind it.
    stepTicks(sim, SUMMON_DELAY_TICKS - gapTicks);
    expect(raidersOf(sim, 'north')).toHaveLength(1);
    stepTicks(sim, gapTicks);
    const [first, second] = raidersOf(sim, 'north');
    expect(sim.state.summons).toEqual([]);
    expect((second?.x ?? 0) - (first?.x ?? 0)).toBeCloseTo(
      gapTicks * raiderStepTiles('gloomling'),
      10,
    );
  });

  it('every other raider card summons 1 raider', () => {
    for (const cardId of ['pothead', 'shieldbearer', 'shade_wisp', 'bat_swarm', 'gloom_priest']) {
      const sim = createStartedSim();
      playRaider(sim, 'south', cardId, 0);
      expect(sim.state.summons).toHaveLength(1);
    }
  });
});

describe('raider cap (spec 18.6)', () => {
  it.each(SIDES)('rejects a raider card of %s at 12 living raiders', (side) => {
    const sim = createStartedSim();
    fillRaiders(sim, side, RAIDER_CAP);
    const essence = sim.state.sides[side].essence;
    expect(rejectReasons(playRaider(sim, side, 'pothead', 0))).toEqual(['tooManyRaiders']);
    expect(sim.state.sides[side].essence).toBe(essence);
    expect(sim.state.summons).toEqual([]);
  });

  it('counts each side on its own', () => {
    const sim = createStartedSim();
    fillRaiders(sim, 'south', RAIDER_CAP);
    expect(rejectReasons(playRaider(sim, 'north', 'pothead', 0))).toEqual([]);
  });

  it('accepts a card below the cap and counts raiders that are still being summoned', () => {
    const sim = createStartedSim();
    fillRaiders(sim, 'south', RAIDER_CAP - 1);
    expect(rejectReasons(playRaider(sim, 'south', 'pothead', 0))).toEqual([]);
    expect(countRaiders(sim.state, 'south')).toBe(RAIDER_CAP);
    expect(rejectReasons(playRaider(sim, 'south', 'bat_swarm', 0))).toEqual(['tooManyRaiders']);
  });

  it('rejects a card whose raiders do not all fit (default of #137)', () => {
    const sim = createStartedSim();
    fillRaiders(sim, 'south', RAIDER_CAP - 1);
    expect(rejectReasons(playRaider(sim, 'south', 'gloomling', 0))).toEqual(['tooManyRaiders']);
    expect(rejectReasons(playRaider(sim, 'south', 'pothead', 0))).toEqual([]);
  });

  it('frees a slot when a raider dies', () => {
    const sim = createStartedSim();
    fillRaiders(sim, 'south', RAIDER_CAP);
    const [victim] = raidersOf(sim, 'south');
    if (victim !== undefined) {
      victim.hp = 0;
    }
    sim.step();
    expect(rejectReasons(playRaider(sim, 'south', 'pothead', 0))).toEqual([]);
  });
});
