import { Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene } from 'three';

import { rules } from '../data/rules';
import type { SimEvent, SimState } from '../sim/types';
import { fitLevelCamera } from './cameraFit';
import { createGrid, type Grid, type LevelViewOptions } from './grid';
import { GREYBOX_COLORS } from './greyboxPalette';
import { createOrbLayer, type OrbLayer } from './orbs';
import { createProjectileLayer, type ProjectileLayer } from './projectiles';
import { createUnitLayer, type UnitLayer } from './units';

/**
 * Camera FOV of spec 9.1. The distance is fitted to the aspect ratio by
 * `fitLevelCamera` so the whole playfield stays visible on phones and desktops and the
 * top 14 % of the screen stays free for the HUD (spec 9.1).
 */
const CAMERA_FOV = 32;

/**
 * Greybox orb hover height. The sim state has no orb y yet; when issue #19 adds the
 * falling orb, only the two adapter calls passing this value change (spec 3.3).
 */
const ORB_HEIGHT = 0.5 * rules.grid.tileSize;

/** The greybox level renderer: scene, camera, entity layers and event handling. */
export interface LevelScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Applies one simulation tick's events: spawns, despawns and star changes (spec 11.7). */
  handleEvents(events: readonly SimEvent[]): void;
  /** Stores the state of the latest tick once per tick and lerps all objects (spec 11.4). */
  draw(state: Readonly<SimState>, alpha: number): void;
  resize(aspect: number, hudTopFraction?: number): void;
  dispose(): void;
}

/** Applies one tick of sim events to the three entity layers (spec 11.3, 11.7). */
function applyEvents(
  events: readonly SimEvent[],
  units: UnitLayer,
  projectiles: ProjectileLayer,
  orbs: OrbLayer,
): void {
  for (const event of events) {
    switch (event.type) {
      case 'defenderPlaced':
        units.spawnDefender(event.id, event.defenderId, event.lane, event.col, event.stars);
        break;
      case 'defenderMerged':
        units.setStars(event.id, event.stars);
        break;
      case 'defenderRemoved':
        units.remove(event.id);
        break;
      case 'enemySpawned':
        // Enemies enter at the spawn point right of the grid, inside the portal (spec 3.1).
        units.spawnEnemy(event.id, event.enemyId, event.lane, rules.grid.enemySpawnX);
        break;
      case 'enemyDied':
        units.remove(event.id);
        break;
      case 'hit':
        // Spec 9.2: every hit flashes the struck unit white for 0.08 s.
        units.flash(event.targetId);
        break;
      case 'attack':
        // Spec 9.6/12.5: attackers play their attack clip, enemies their eat clip.
        units.playAttack(event.sourceId);
        break;
      case 'projectileSpawned':
        projectiles.spawn(event.id, event.kind, event.x, event.lane);
        break;
      case 'projectileEnded':
        projectiles.remove(event.id);
        break;
      case 'orbSpawned':
        // Spec 9.6: producers pulse their produce clip when an orb spawns.
        units.playProduce();
        orbs.spawn(event.id, event.x, event.lane, ORB_HEIGHT);
        break;
      case 'orbCollected':
      case 'orbExpired':
        orbs.remove(event.id);
        break;
      case 'levelWon':
        // Spec 9.6: every living defender plays the victory clip.
        units.playVictory();
        break;
      default:
        // Attack, hit, status, combo, wave, trap and level events are VFX and audio (M3,
        // spec 9.6/9.7); the greybox renderer ignores them.
        break;
    }
  }
}

/**
 * Creates the greybox level renderer of issue #24: spec 9.1 camera, spec 9.4 tile grid,
 * defender/enemy capsules, projectile spheres, Essence orbs and tick interpolation.
 */
export function createLevelScene(options: LevelViewOptions): LevelScene {
  const scene = new Scene();
  scene.background = new Color(GREYBOX_COLORS.sky);

  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 60);
  fitLevelCamera(camera, 1);

  // Spec 9.2: one warm key light from the upper left front plus the cool hemisphere fill.
  // No real-time shadows; the greybox units get no shadows until M3 (issue 3.4).
  const keyLight = new DirectionalLight(0xfff2d9, 2.2);
  keyLight.position.set(-6, 9, 6);
  scene.add(keyLight);
  scene.add(new HemisphereLight(0xbfe3ff, 0x6b8f4e, 0.9));

  const grid: Grid = createGrid(options);
  scene.add(grid.group);

  const unitGroup = new Group();
  const projectileGroup = new Group();
  const orbGroup = new Group();
  scene.add(unitGroup, projectileGroup, orbGroup);
  const units = createUnitLayer(unitGroup);
  const projectiles = createProjectileLayer(projectileGroup);
  const orbs = createOrbLayer(orbGroup);

  // The loop calls `handleEvents` once per tick; the renderer stores positions once per
  // tick and lerps between the last two ticks (spec 11.4).
  let tickCount = 0;
  let lastSnapshotTick = -1;

  /** Copies the current sim positions into the interpolation store. */
  function snapshot(state: Readonly<SimState>): void {
    units.sync(state.defenders, state.enemies);
    projectiles.sync(state.projectiles);
    orbs.sync(state.orbs, ORB_HEIGHT);
  }

  return {
    scene,
    camera,
    handleEvents: (events): void => {
      tickCount += 1;
      applyEvents(events, units, projectiles, orbs);
    },
    draw: (state, alpha): void => {
      if (tickCount !== lastSnapshotTick) {
        snapshot(state);
        lastSnapshotTick = tickCount;
      }
      units.apply(alpha);
      projectiles.apply(alpha);
      orbs.apply(alpha);
    },
    resize: (aspect, hudTopFraction): void => {
      fitLevelCamera(camera, aspect, hudTopFraction);
    },
    dispose: (): void => {
      units.dispose();
      projectiles.dispose();
      orbs.dispose();
      grid.dispose();
      scene.clear();
    },
  };
}
