import { describe, expect, it } from 'vitest';

import { duelRules, rules } from '../../../src/data';
import { baseLineXOf } from '../../../src/sim/combat/side';
import {
  DUEL_BOARD,
  DUEL_SIDES,
  createDuelSim,
  ownColumnsOf,
  ownsColumn,
  raiderSpawnXOf,
} from '../../../src/sim/duel';
import { terrainAt } from '../../../src/sim/grid';
import {
  addRaider,
  createStartedSim,
  defenderAt,
  eventsOfType,
  playDefender,
  rejectReasons,
  stepTicks,
} from './duelTestKit';

describe('Duel board (spec 18.1)', () => {
  it('uses the 5 x 9 grid without terrain: every tile is normal', () => {
    expect(DUEL_BOARD.activeLanes).toEqual([0, 1, 2, 3, 4]);
    expect(DUEL_BOARD.terrain).toEqual([]);
    for (let lane = 0; lane < rules.grid.laneCount; lane += 1) {
      for (let col = 0; col < rules.grid.columnCount; col += 1) {
        expect(terrainAt(DUEL_BOARD, lane, col)).toBe('normal');
      }
    }
  });

  it('rejects tiles outside the grid', () => {
    const sim = createStartedSim();
    expect(rejectReasons(playDefender(sim, 'south', 'sparkbolt_gremlin', 5, 0))).toEqual([
      'invalidTile',
    ]);
    expect(rejectReasons(playDefender(sim, 'south', 'sparkbolt_gremlin', 0, -1))).toEqual([
      'invalidTile',
    ]);
    expect(rejectReasons(playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 9))).toEqual([
      'invalidTile',
    ]);
    expect(sim.state.defenders).toEqual([]);
  });

  it('has two sides, south first', () => {
    expect(DUEL_SIDES).toEqual(['south', 'north']);
    expect(Object.keys(createDuelSim(1).state.sides)).toEqual(['south', 'north']);
  });

  it('south owns columns 0-3 and north owns columns 5-8', () => {
    expect(ownColumnsOf('south')).toEqual([0, 1, 2, 3]);
    expect(ownColumnsOf('north')).toEqual([5, 6, 7, 8]);
    for (const col of [0, 1, 2, 3]) {
      expect(ownsColumn('south', col)).toBe(true);
      expect(ownsColumn('north', col)).toBe(false);
    }
    for (const col of [5, 6, 7, 8]) {
      expect(ownsColumn('north', col)).toBe(true);
      expect(ownsColumn('south', col)).toBe(false);
    }
  });

  it('nobody can place a defender on the midline, column 4', () => {
    const sim = createStartedSim();
    expect(duelRules.board.midlineColumn).toBe(4);
    expect(rejectReasons(playDefender(sim, 'south', 'sparkbolt_gremlin', 2, 4))).toEqual([
      'notYourSide',
    ]);
    expect(rejectReasons(playDefender(sim, 'north', 'sparkbolt_gremlin', 2, 4))).toEqual([
      'notYourSide',
    ]);
    expect(sim.state.defenders).toEqual([]);
  });

  it('has the base lines at x = 0 and x = 9 and the raider spawn points at 0.4 and 8.6', () => {
    expect(baseLineXOf('south')).toBe(duelRules.board.southBaseLineX);
    expect(baseLineXOf('north')).toBe(duelRules.board.northBaseLineX);
    expect(raiderSpawnXOf('south')).toBe(0.4);
    expect(raiderSpawnXOf('north')).toBe(8.6);
  });

  it('forward is +x for south units and -x for north units', () => {
    const sim = createStartedSim();
    playDefender(sim, 'south', 'sparkbolt_gremlin', 1, 3);
    playDefender(sim, 'north', 'sparkbolt_gremlin', 3, 5);
    addRaider(sim, 'north', 'gloomling', 1, 7.5);
    addRaider(sim, 'south', 'gloomling', 3, 1.5);

    const spawned = eventsOfType(stepTicks(sim, 20), 'projectileSpawned');
    expect(spawned.map((event) => event.side).sort()).toEqual(['north', 'south']);
    const startX = new Map(sim.state.projectiles.map((shot) => [shot.id, shot.x]));
    stepTicks(sim, 3);
    for (const projectile of sim.state.projectiles) {
      const movedBy = projectile.x - (startX.get(projectile.id) ?? projectile.x);
      expect(Math.sign(movedBy)).toBe(projectile.side === 'south' ? 1 : -1);
    }
    expect(sim.state.projectiles).toHaveLength(2);
  });

  it('keeps absolute coordinates: a north defender is stored on the tile it was played on', () => {
    const sim = createStartedSim();
    playDefender(sim, 'north', 'sparkbolt_gremlin', 0, 8);
    expect(defenderAt(sim, 0, 8)).toMatchObject({ side: 'north', lane: 0, col: 8 });
  });
});
