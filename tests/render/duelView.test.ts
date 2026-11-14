import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  BOARD_CENTER_X,
  BOARD_CENTER_Z,
  halfTurnMatrix,
} from '../../src/render/duel/bastionGeometry';
import {
  duelViewEvents,
  duelViewState,
  simPointOfView,
  viewColumn,
  viewLane,
  viewX,
} from '../../src/render/duel/duelView';
import { fitLevelCamera } from '../../src/render/cameraFit';
import { columnToWorldX, laneToWorldZ } from '../../src/render/worldMapping';
import type { DuelEvent } from '../../src/sim/duel';
import { createDuelBot, playDuelBotTurn } from '../../src/sim/duelBot';
import { createLocalDuelMatch } from '../../src/sim/duelMatch';
import { OTHER_DECK, STARTER_DECK } from '../sim/duelMatch/duelMatchTestKit';

/** A hard-vs-hard bot match stepped `ticks` ticks (spec 18.10). */
function playedMatch(ticks: number) {
  const match = createLocalDuelMatch({
    seed: 7,
    players: {
      south: { deck: STARTER_DECK, privateSeed: 1 },
      north: { deck: OTHER_DECK, privateSeed: 2 },
    },
  });
  const bots = (['south', 'north'] as const).map((side, index) =>
    createDuelBot({ level: 'hard', side, seed: 40 + index }),
  );
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const bot of bots) {
      playDuelBotTurn(bot, match);
    }
    match.step();
  }
  return match;
}

/** Where a tap on the drawn ground point lands, through the real 9.1 camera. */
function tapOnDrawnPoint(worldX: number, worldZ: number): { x: number; z: number } {
  const camera = new PerspectiveCamera(32, 390 / 844, 0.1, 60);
  fitLevelCamera(camera, 390 / 844);
  camera.updateMatrixWorld();
  const screen = new Vector3(worldX, 0, worldZ).project(camera);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(screen.x, screen.y), camera);
  const hit = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
  if (hit === null) {
    throw new Error('the tap ray missed the ground');
  }
  return { x: hit.x, z: hit.z };
}

describe('Duel view mirror (spec 18.1)', () => {
  it('keeps the south view as is', () => {
    expect(viewX(2.25, 'south')).toBe(2.25);
    expect(viewLane(1, 'south')).toBe(1);
    expect(viewColumn(3, 'south')).toBe(3);
  });

  it('mirrors the north view: x becomes 9 - x, lane becomes 4 - lane', () => {
    expect(viewX(2.25, 'north')).toBe(6.75);
    expect(viewX(9, 'north')).toBe(0);
    expect(viewLane(1, 'north')).toBe(3);
    expect(viewColumn(8, 'north')).toBe(0);
    expect(viewColumn(5, 'north')).toBe(3);
  });

  it('draws each side at the bottom: own base line at x = 0 in both views', () => {
    expect(viewX(0, 'south')).toBe(0);
    expect(viewX(9, 'north')).toBe(0);
  });

  it('mirrors pointer mapping for north: a tap on a drawn tile hits the sim tile under it', () => {
    // North defender tile lane 1, col 6 is drawn at lane 3, col 2 in the north view.
    const drawn = tapOnDrawnPoint(columnToWorldX(2), laneToWorldZ(3));
    const sim = simPointOfView(drawn.x, drawn.z, 'north');
    expect(Math.floor(sim.x)).toBe(6);
    expect(Math.floor(sim.z)).toBe(1);
    const south = simPointOfView(drawn.x, drawn.z, 'south');
    expect(Math.floor(south.x)).toBe(2);
    expect(Math.floor(south.z)).toBe(3);
  });

  it('turns the bastion half around the board centre exactly like the view mirror', () => {
    const point = new Vector3(0, 1, laneToWorldZ(0)).applyMatrix4(halfTurnMatrix());
    expect(point.x).toBeCloseTo(9);
    expect(point.y).toBeCloseTo(1);
    expect(point.z).toBeCloseTo(laneToWorldZ(4));
    expect(BOARD_CENTER_X).toBe(4.5);
    expect(BOARD_CENTER_Z).toBe(2.5);
  });
});

describe('Duel view state and events (spec 18.1, 19.11)', () => {
  it('mirrors every unit and projectile for north and never changes the sim state', () => {
    const match = playedMatch(1500);
    const before = JSON.stringify(match.state.defenders);
    const view = duelViewState(match.state, 'north');
    expect(view.defenders.length).toBe(match.state.defenders.length);
    match.state.defenders.forEach((defender, index) => {
      expect(view.defenders[index]?.col).toBe(8 - defender.col);
      expect(view.defenders[index]?.lane).toBe(4 - defender.lane);
      expect(view.defenders[index]?.side).toBe(defender.side);
    });
    match.state.enemies.forEach((raider, index) => {
      expect(view.enemies[index]?.x).toBeCloseTo(9 - raider.x);
    });
    expect(JSON.stringify(match.state.defenders)).toBe(before);
  });

  it('also draws summoned raiders standing at their spawn point (spec 18.5)', () => {
    const match = playedMatch(1500);
    const standing = match.state.summons.filter((summon) => summon.raider !== null).length;
    const view = duelViewState(match.state, 'south');
    expect(view.enemies.length).toBe(match.state.enemies.length + standing);
  });

  it('mirrors unit events and drops Duel-only events', () => {
    const events: DuelEvent[] = [
      {
        type: 'defenderPlaced',
        id: 1,
        side: 'north',
        defenderId: 'pyro_fox',
        lane: 0,
        col: 7,
        stars: 1,
      },
      { type: 'projectileSpawned', id: 2, side: 'north', kind: 'arrow', x: 7.5, lane: 0 },
      { type: 'trapFired', side: 'north', lane: 0 },
      { type: 'gateDamaged', side: 'north', amount: 1, health: 7 },
    ];
    const view = duelViewEvents(events, 'north');
    expect(view.map((event) => event.type)).toEqual(['defenderPlaced', 'projectileSpawned']);
    expect(view[0]).toMatchObject({ lane: 4, col: 1 });
    expect(view[1]).toMatchObject({ lane: 4, x: 1.5 });
  });
});
