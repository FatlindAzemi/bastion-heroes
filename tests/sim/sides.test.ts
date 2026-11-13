import { describe, expect, it } from 'vitest';

import { defenderById, rules } from '../../src/data';
import { collectAuraDamageBuffs } from '../../src/sim/behaviors/aura';
import { applyAfterHitCombos } from '../../src/sim/combat/combos';
import { updateDefenders } from '../../src/sim/combat/defenderActions';
import { removeDeadDefenders, removeDeadEnemies } from '../../src/sim/combat/deaths';
import {
  findBlockingDefender,
  updateEnemies,
  updateKnockback,
  walkForward,
} from '../../src/sim/combat/enemyActions';
import { spawnFirePatch, updateFirePatches } from '../../src/sim/combat/firePatches';
import { updateProjectiles } from '../../src/sim/combat/projectiles';
import {
  advanceX,
  attackSide,
  baseLineXOf,
  defenderSide,
  distanceAhead,
  enemySide,
  forwardOf,
  isAheadOf,
  laneEndX,
  mirrorX,
  opposingSide,
} from '../../src/sim/combat/side';
import { applyStatus, hasStatus, updateStatusEffects } from '../../src/sim/combat/status';
import { findTarget } from '../../src/sim/combat/targeting';
import { spawnEnemy } from '../../src/sim/enemies/spawn';
import { tileCenterX, type TerrainLayout } from '../../src/sim/grid';
import type { CombatState, DefenderState, EnemyState, Side, SimEvent } from '../../src/sim/types';

/** A board without terrain, like the Duel board of spec 18.1. */
const FLAT_BOARD: TerrainLayout = { activeLanes: [0, 1, 2, 3, 4], terrain: [] };

/** A bare combat state: the shared code needs nothing else of a sim (spec 19.11). */
function createCombatState(): CombatState {
  return { tick: 0, nextId: 1, defenders: [], enemies: [], projectiles: [], firePatches: [] };
}

/** Adds an active defender of the roster directly to the state; `side` undefined = campaign. */
function addDefender(
  state: CombatState,
  defenderId: string,
  lane: number,
  col: number,
  side?: Side,
  stars: 1 | 2 | 3 = 1,
): DefenderState {
  const defenderDef = defenderById[defenderId];
  if (defenderDef === undefined) {
    throw new Error(`unknown defender ${defenderId}`);
  }
  const defender: DefenderState = {
    id: state.nextId,
    ...(side === undefined ? {} : { side }),
    defenderId,
    lane,
    col,
    stars,
    hp: defenderDef.hp,
    maxHp: defenderDef.hp,
    cardLevel: 1,
    activeAtTick: 0,
    nextOrbTick: null,
    nextAttackTick: 0,
    trapReadyAtTick: null,
    trapRearmed: false,
    attackCount: 0,
    burstShotsRemaining: 0,
  };
  state.nextId += 1;
  state.defenders.push(defender);
  return defender;
}

/** Adds a walking unit; `side` undefined = campaign enemy. */
function addEnemy(
  state: CombatState,
  enemyId: string,
  lane: number,
  x: number,
  side?: Side,
): EnemyState {
  const enemy = spawnEnemy(state, enemyId, lane, x, 0, [], side);
  if (enemy === undefined) {
    throw new Error(`unknown enemy ${enemyId}`);
  }
  return enemy;
}

/** One tick of the shared combat phases, in the order both sims use (spec 11.3, 19.11). */
function stepCombat(state: CombatState): SimEvent[] {
  const events: SimEvent[] = [];
  updateDefenders(state, events);
  updateProjectiles(state, events);
  updateStatusEffects(state, FLAT_BOARD, events);
  updateFirePatches(state, events);
  updateEnemies(state, events);
  removeDeadEnemies(state, events);
  removeDeadDefenders(state, events);
  state.tick += 1;
  return events;
}

describe('side helpers (spec 18.1)', () => {
  it('south moves towards +x and north towards -x', () => {
    expect(forwardOf('south')).toBe(1);
    expect(forwardOf('north')).toBe(-1);
    expect(opposingSide('south')).toBe('north');
    expect(opposingSide('north')).toBe('south');
    expect(advanceX(4, 1.5, 1)).toBe(5.5);
    expect(advanceX(4, 1.5, -1)).toBe(2.5);
    expect(isAheadOf(5, 4, 1)).toBe(true);
    expect(isAheadOf(5, 4, -1)).toBe(false);
    expect(isAheadOf(4, 4, 1)).toBe(false);
    expect(distanceAhead(4, 6, 1)).toBe(2);
    expect(distanceAhead(4, 6, -1)).toBe(-2);
  });

  it('units without a side are the campaign sides: defenders south, enemies north', () => {
    expect(defenderSide({})).toBe('south');
    expect(enemySide({})).toBe('north');
    expect(attackSide({})).toBe('south');
    expect(defenderSide({ side: 'north' })).toBe('north');
    expect(enemySide({ side: 'south' })).toBe('south');
    expect(attackSide({ side: 'north' })).toBe('north');
  });

  it('mirrors the board between the base lines at x = 0 and x = 9', () => {
    expect(baseLineXOf('south')).toBe(rules.grid.baseLineX);
    expect(baseLineXOf('north')).toBe(9);
    expect(mirrorX(0.4)).toBe(8.6);
    expect(laneEndX(1)).toBe(rules.grid.enemySpawnX);
    expect(laneEndX(-1)).toBe(mirrorX(rules.grid.enemySpawnX));
  });
});

describe('side-aware targeting (spec 4.4, 18.1)', () => {
  it('a north attacker targets the south unit closest to the north bastion', () => {
    const state = createCombatState();
    const far = addEnemy(state, 'gloomling', 2, 2.0, 'south');
    const near = addEnemy(state, 'gloomling', 2, 6.0, 'south');
    addEnemy(state, 'gloomling', 2, 7.0, 'north'); // own raider: never a target
    const target = findTarget(state.enemies, { lane: 2, fromX: 7.5, side: 'north' });
    expect(target?.id).toBe(near.id);
    expect(target?.id).not.toBe(far.id);
  });

  it('a north attacker ignores units more than 0.3 tiles behind it and beyond its range', () => {
    const state = createCombatState();
    addEnemy(state, 'gloomling', 0, 7.9, 'south'); // 0.4 behind an attacker at 7.5
    addEnemy(state, 'gloomling', 0, 3.0, 'south'); // 4.5 ahead, out of range 4
    expect(findTarget(state.enemies, { lane: 0, fromX: 7.5, rangeTiles: 4, side: 'north' })).toBe(
      undefined,
    );
    const onTile = addEnemy(state, 'gloomling', 0, 7.7, 'south'); // 0.2 behind: still valid
    expect(
      findTarget(state.enemies, { lane: 0, fromX: 7.5, rangeTiles: 4, side: 'north' })?.id,
    ).toBe(onTile.id);
  });

  it('a south attacker never targets a south unit', () => {
    const state = createCombatState();
    addEnemy(state, 'gloomling', 1, 5.0, 'south');
    expect(findTarget(state.enemies, { lane: 1, fromX: 0.5, side: 'south' })).toBe(undefined);
    const foe = addEnemy(state, 'gloomling', 1, 6.0, 'north');
    expect(findTarget(state.enemies, { lane: 1, fromX: 0.5, side: 'south' })?.id).toBe(foe.id);
  });
});

describe('side-aware projectiles (spec 4.3, 18.1)', () => {
  it('a north defender fires towards -x and hits only south units', () => {
    const state = createCombatState();
    const defender = addDefender(state, 'sparkbolt_gremlin', 2, 7, 'north');
    const ownRaider = addEnemy(state, 'gloomling', 2, 6.5, 'north');
    const foe = addEnemy(state, 'gloomling', 2, 5.0, 'south');
    const events: SimEvent[] = [];
    updateDefenders(state, events);
    const projectile = state.projectiles[0];
    expect(projectile?.side).toBe('north');
    expect(events).toContainEqual({ type: 'attack', sourceId: defender.id, targetId: foe.id });

    let hitEvents: SimEvent[] = [];
    for (let tick = 0; tick < 30 && hitEvents.length === 0; tick += 1) {
      const tickEvents: SimEvent[] = [];
      const xBefore = state.projectiles[0]?.x ?? 0;
      updateProjectiles(state, tickEvents);
      const xAfter = state.projectiles[0]?.x;
      if (xAfter !== undefined) {
        expect(xAfter).toBeLessThan(xBefore);
      }
      hitEvents = tickEvents.filter((event) => event.type === 'hit');
    }
    expect(hitEvents).toHaveLength(1);
    expect(hitEvents[0]).toMatchObject({ targetId: foe.id });
    expect(ownRaider.hp).toBe(ownRaider.maxHp);
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(state.projectiles).toHaveLength(0);
  });

  it('a north projectile that hits nothing ends past the mirrored lane end', () => {
    const state = createCombatState();
    addDefender(state, 'sparkbolt_gremlin', 0, 8, 'north');
    const foe = addEnemy(state, 'gloomling', 0, 1.0, 'south');
    updateDefenders(state, []);
    state.enemies.splice(state.enemies.indexOf(foe), 1);
    let ticks = 0;
    while (state.projectiles.length > 0 && ticks < 200) {
      updateProjectiles(state, []);
      ticks += 1;
    }
    // 8.5 -> -0.5 at 6 tiles/s is 9 tiles: 45 ticks, plus the tick that passes the end.
    expect(ticks).toBe(46);
  });

  it('a fire patch only burns units of the other side', () => {
    const state = createCombatState();
    const own = addEnemy(state, 'gloomling', 1, 4.0, 'north');
    const foe = addEnemy(state, 'gloomling', 1, 4.1, 'south');
    spawnFirePatch(state, 1, 4.0, { radiusTiles: 0.5, durationTicks: 60 }, 'north');
    updateFirePatches(state, []);
    expect(hasStatus(foe, 'burn')).toBe(true);
    expect(hasStatus(own, 'burn')).toBe(false);
  });
});

describe('side-aware walking, blocking and specials (spec 3.8, 4.5, 18.6)', () => {
  it('a south unit walks towards +x and is knocked back towards -x', () => {
    const state = createCombatState();
    const raider = addEnemy(state, 'gloomling', 0, 2.0, 'south');
    walkForward(raider, 3);
    expect(raider.x).toBeCloseTo(2.1, 10);
    applyStatus(0, raider, { kind: 'knockback', distanceTiles: 1.2 }, []);
    expect(updateKnockback(raider)).toBe(true);
    expect(raider.x).toBeLessThan(2.1);
  });

  it('a south unit is blocked by a north defender ahead of it, never by a south defender', () => {
    const state = createCombatState();
    const ownWall = addDefender(state, 'iron_granny', 3, 5, 'south');
    const raider = addEnemy(state, 'gloomling', 3, tileCenterX(5) - 0.3, 'south');
    expect(findBlockingDefender(state, raider)).toBe(undefined);
    const enemyWall = addDefender(state, 'iron_granny', 3, 5, 'north');
    expect(findBlockingDefender(state, raider)?.id).toBe(enemyWall.id);
    raider.x = tileCenterX(5) + 0.3; // already past the tile centre: no longer blocked
    expect(findBlockingDefender(state, raider)).toBe(undefined);
    expect(ownWall.hp).toBe(ownWall.maxHp);
  });

  it('auras only buff defenders of their own side', () => {
    const auraDef = Object.values(defenderById).find((def) => def?.pattern === 'aura');
    if (auraDef === undefined) {
      return; // no aura defender in the roster yet
    }
    const state = createCombatState();
    const shooter = addDefender(state, 'sparkbolt_gremlin', 2, 4, 'south');
    addDefender(state, auraDef.id, 2, 5, 'north');
    expect(collectAuraDamageBuffs(state, shooter)).toEqual([]);
    addDefender(state, auraDef.id, 1, 4, 'south');
    expect(collectAuraDamageBuffs(state, shooter)).toHaveLength(1);
  });

  it('a combo only spreads among the units of the side that was hit', () => {
    const state = createCombatState();
    const target = addEnemy(state, 'gloomling', 2, 5.0, 'north');
    const sameSide = addEnemy(state, 'gloomling', 2, 5.4, 'north');
    const attackerSide = addEnemy(state, 'gloomling', 2, 4.6, 'south');
    applyStatus(0, target, { kind: 'slow' }, []);
    const events: SimEvent[] = [];
    applyAfterHitCombos(state, 0, 'fire', 'blast', target, events);
    expect(events).toContainEqual({ type: 'combo', combo: 'steam', x: 5.0, lane: 2 });
    expect(sameSide.hp).toBeLessThan(sameSide.maxHp);
    expect(hasStatus(sameSide, 'stun')).toBe(true);
    expect(attackerSide.hp).toBe(attackerSide.maxHp);
    expect(hasStatus(attackerSide, 'stun')).toBe(false);
  });

  it('a Gloom Priest only heals units of its own side', () => {
    const state = createCombatState();
    const priest = addEnemy(state, 'gloom_priest', 2, 4.0, 'south');
    const ally = addEnemy(state, 'gloomling', 2, 4.5, 'south');
    const foe = addEnemy(state, 'gloomling', 2, 3.5, 'north');
    ally.hp -= 500;
    foe.hp -= 500;
    state.tick = priest.nextHealTick ?? 0;
    updateEnemies(state, []);
    expect(ally.hp).toBeGreaterThan(ally.maxHp - 500);
    expect(foe.hp).toBe(foe.maxHp - 500);
  });

  it('a south Gloom Ogre throws its unit forward towards +x, onto its own side', () => {
    const state = createCombatState();
    const ogre = addEnemy(state, 'gloom_ogre', 1, 3.0, 'south');
    ogre.hp = 1;
    updateEnemies(state, []);
    const thrown = state.enemies.find((enemy) => enemy.id !== ogre.id);
    expect(thrown?.side).toBe('south');
    expect(thrown?.x).toBeGreaterThan(3.0);
    expect(thrown?.x).toBeLessThanOrEqual(baseLineXOf('north'));
  });
});

/** The roster used by the mirror scenario: every implemented attack pattern and special. */
const MIRROR_DEFENDERS: readonly [string, number, number, 1 | 2 | 3][] = [
  ['sparkbolt_gremlin', 0, 1, 3],
  ['rune_archer', 1, 0, 3],
  ['frost_witch', 1, 2, 1],
  ['pyro_fox', 1, 1, 3],
  ['boomcap_brewer', 2, 1, 1],
  ['snowpup_yeti', 2, 0, 1],
  ['iron_granny', 2, 3, 3],
  ['iron_granny', 0, 3, 1],
];

const MIRROR_ENEMIES: readonly [string, number, number][] = [
  ['gloomling', 0, 8.0],
  ['shieldbearer', 0, 8.6],
  ['pothead', 1, 7.3],
  ['shade_wisp', 1, 8.2],
  ['gloom_priest', 1, 8.8],
  ['gloom_ogre', 2, 6.4],
  ['gloomling', 2, 6.9],
  ['bat_swarm', 2, 7.7],
];

/** Builds the scenario in campaign orientation (no sides) or mirrored with sides swapped in x. */
function createMirrorScenario(mirrored: boolean): CombatState {
  const state = createCombatState();
  for (const [defenderId, lane, col, stars] of MIRROR_DEFENDERS) {
    if (mirrored) {
      addDefender(state, defenderId, lane, rules.grid.columnCount - 1 - col, 'north', stars);
    } else {
      addDefender(state, defenderId, lane, col, undefined, stars);
    }
  }
  for (const [enemyId, lane, x] of MIRROR_ENEMIES) {
    if (mirrored) {
      addEnemy(state, enemyId, lane, mirrorX(x), 'south');
    } else {
      addEnemy(state, enemyId, lane, x);
    }
  }
  return state;
}

/** The side-independent part of a state: who is alive, with which health and statuses. */
function unitSummary(state: CombatState): unknown {
  return {
    defenders: state.defenders.map((defender) => [defender.id, defender.hp, defender.attackCount]),
    enemies: state.enemies.map((enemy) => [
      enemy.id,
      enemy.hp,
      enemy.shieldHp,
      enemy.blockedByDefenderId,
      enemy.statuses.map((status) => [status.kind, status.expiresAtTick]),
    ]),
    projectiles: state.projectiles.map((projectile) => [projectile.id, projectile.lane]),
    firePatches: state.firePatches.map((patch) => patch.id),
  };
}

/** Events without their world x, which is mirrored between the two runs. */
function withoutX(events: readonly SimEvent[]): unknown[] {
  return events.map((event) => ('x' in event ? { ...event, x: null } : event));
}

/**
 * Ticks compared event by event. Mirroring is `9 - x`, which is exact only up to
 * floating-point rounding, so over a long fight one hit can land a tick earlier
 * on one side; the first seconds are far away from such a boundary.
 */
const EXACT_MIRROR_TICKS = 300;

/** The ids of the units that died, in order of death. */
function deathIds(events: readonly SimEvent[]): number[] {
  return events.flatMap((event) =>
    event.type === 'enemyDied' || event.type === 'defenderRemoved' ? [event.id] : [],
  );
}

describe('mirror symmetry of the shared combat code (spec 18.1, 19.11)', () => {
  it('a north-defends-against-south fight mirrors the campaign fight tick by tick', () => {
    const campaign = createMirrorScenario(false);
    const mirrored = createMirrorScenario(true);
    const eventTypes = new Set<string>();
    for (let tick = 0; tick < EXACT_MIRROR_TICKS; tick += 1) {
      const campaignEvents = stepCombat(campaign);
      const mirroredEvents = stepCombat(mirrored);
      campaignEvents.forEach((event) => eventTypes.add(event.type));
      expect(withoutX(mirroredEvents)).toEqual(withoutX(campaignEvents));
      expect(unitSummary(mirrored)).toEqual(unitSummary(campaign));
      campaign.enemies.forEach((enemy, index) => {
        expect(mirrored.enemies[index]?.x).toBeCloseTo(mirrorX(enemy.x), 6);
      });
      campaign.projectiles.forEach((projectile, index) => {
        expect(mirrored.projectiles[index]?.x).toBeCloseTo(mirrorX(projectile.x), 6);
      });
    }
    // The window really exercised the shared code, not an idle board.
    for (const type of ['attack', 'projectileSpawned', 'projectileEnded', 'hit', 'statusApplied']) {
      expect(eventTypes).toContain(type);
    }
  });

  it('the mirrored fight ends with the same deaths and survivors as the campaign fight', () => {
    const campaign = createMirrorScenario(false);
    const mirrored = createMirrorScenario(true);
    const campaignDeaths: number[] = [];
    const mirroredDeaths: number[] = [];
    for (let tick = 0; tick < 2400; tick += 1) {
      campaignDeaths.push(...deathIds(stepCombat(campaign)));
      mirroredDeaths.push(...deathIds(stepCombat(mirrored)));
    }
    expect(campaignDeaths.length).toBeGreaterThan(0);
    expect(mirroredDeaths).toEqual(campaignDeaths);
    expect(mirrored.enemies.map((enemy) => enemy.id)).toEqual(
      campaign.enemies.map((enemy) => enemy.id),
    );
    expect(mirrored.defenders.map((defender) => defender.id)).toEqual(
      campaign.defenders.map((defender) => defender.id),
    );
  });

  it('two mirrored fights on one board do not touch each other', () => {
    const state = createCombatState();
    const southDefender = addDefender(state, 'sparkbolt_gremlin', 0, 1, 'south');
    const northDefender = addDefender(state, 'sparkbolt_gremlin', 0, 7, 'north');
    const southRaider = addEnemy(state, 'gloomling', 0, 3.0, 'south');
    const northRaider = addEnemy(state, 'gloomling', 0, 6.0, 'north');
    for (let tick = 0; tick < 90; tick += 1) {
      const events = stepCombat(state);
      for (const event of events) {
        if (event.type === 'attack' && event.sourceId === southDefender.id) {
          expect(event.targetId).toBe(northRaider.id);
        }
        if (event.type === 'attack' && event.sourceId === northDefender.id) {
          expect(event.targetId).toBe(southRaider.id);
        }
      }
    }
    expect(southRaider.x).toBeGreaterThan(3.0);
    expect(northRaider.x).toBeLessThan(6.0);
    expect(southRaider.hp).toBe(northRaider.hp);
    expect(southRaider.hp).toBeLessThan(southRaider.maxHp);
  });
});
