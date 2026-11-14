import { Group, type PerspectiveCamera, type Scene } from 'three';

import { rules } from '../data/rules';
import type { SimEvent, SimState } from '../sim/types';
import { createAmbientMotes } from './ambientMotes';
import { fitLevelCamera } from './cameraFit';
import { createEnvironmentLayer } from './environment';
import { createGrid, type Grid, type LevelViewOptions } from './grid';
import { GROUND_SURFACE, setGroundCorruption, setGroundSurfaceTime } from './groundSurface';
import { createOrbLayer } from './orbs';
import { createParticleBursts, type ParticleBursts } from './particles';
import { createPortalVortex } from './portalVortex';
import { createPropSpriteLayer } from './propSprites';
import { createProjectileLayer } from './projectiles';
import { createCameraShake, createSceneStage, createUnitLayerStack } from './sceneParts';
import type { UnitLayer } from './units';
import { readDebugVfx } from './vfx/debugVfx';
import { createVfxLayer } from './vfx/index';

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
  resize(aspect: number): void;
  dispose(): void;
}

/** Applies one tick of sim events to the unit layers (spec 11.3, 11.7). */
export function applyUnitEvents(events: readonly SimEvent[], units: UnitLayer): void {
  for (const event of events) {
    switch (event.type) {
      case 'defenderPlaced':
        units.spawnDefender(event.id, event.defenderId, event.lane, event.col, event.stars);
        break;
      case 'defenderMerged':
        // Spec 9.6: a merge jumps 0.4 units, spins 360 degrees and grows to the new star scale.
        units.merge(event.id, event.stars);
        break;
      case 'defenderRemoved':
        // Spec 11.7: remove after the 0.4 s death animation, not on the removal event itself.
        units.die(event.id);
        break;
      case 'enemySpawned':
        // Enemies enter at the spawn point right of the grid, inside the portal (spec 3.1).
        units.spawnEnemy(event.id, event.enemyId, event.lane, rules.grid.enemySpawnX);
        break;
      case 'enemyDied':
        // Spec 11.7: the purple poof death animation runs before the object is removed.
        units.die(event.id);
        break;
      case 'hit':
        // Spec 9.2: every hit flashes the struck unit white for 0.08 s.
        units.flash(event.targetId);
        break;
      case 'attack':
        // Spec 9.6/12.5: attackers play their attack clip, enemies their eat clip.
        units.playAttack(event.sourceId);
        break;
      case 'orbSpawned':
        // Spec 9.6: the producer on this tile pulses its produce clip when its orb spawns.
        units.playProduceAt(event.lane, event.x);
        break;
      case 'levelWon':
        // Spec 9.6: every living defender plays the victory clip.
        units.playVictory();
        break;
      default:
        // Status, combo, wave and trap effects are handled by the VFX layer and the
        // audio bridge of issue #75; the unit layer ignores them here.
        break;
    }
  }
}

/**
 * Creates the level renderer: the spec 9.1 camera and fitted view, the World 1
 * environment (issue #73, greybox grid as the loading/failure fallback), defender and
 * enemy models/capsules, projectiles, Essence orbs and tick interpolation.
 */
export function createLevelScene(options: LevelViewOptions): LevelScene {
  const { scene, camera } = createSceneStage();

  // The final World 1 environment (issue #73) replaces the greybox grid as soon as the
  // GLB has loaded; the grid stays on screen during loading and if loading fails, so the
  // level is always playable and the 9.1 camera/pointer mapping is unchanged.
  let grid: Grid | null = createGrid(options);
  scene.add(grid.group);
  const environment = createEnvironmentLayer(options);
  scene.add(environment.group);
  // 2.5D pixel-art props replace the hidden 3D edge props (issue #114).
  const propSprites = createPropSpriteLayer(camera);
  scene.add(propSprites.group);
  // Living scene (issue #115): animated portal swirl and drifting ambient motes.
  const portalVortex = createPortalVortex();
  const ambientMotes = createAmbientMotes(Math.min(window.devicePixelRatio, 2));
  scene.add(portalVortex.group, ambientMotes.object);
  // The campaign portal corrupts the far columns (spec 9.2).
  setGroundCorruption(GROUND_SURFACE.corruptionStrength);
  const sceneStartMs = performance.now();
  void environment.ready.then((loaded) => {
    if (!loaded || grid === null) {
      return;
    }
    scene.remove(grid.group);
    grid.dispose();
    grid = null;
  });

  // Spec 9.7 (issue #75): one shared particle system for the 9.6 animations and all
  // VFX, plus the VFX layer with its sprite billboards, damage numbers and bars.
  const particles: ParticleBursts = createParticleBursts();
  const shake = createCameraShake(camera);
  const vfx = createVfxLayer({
    particles,
    onShake: shake.request,
    debugVfx: readDebugVfx(window.location.search),
  });
  const unitStack = createUnitLayerStack(scene, camera, particles);
  const unitLayers = unitStack.layers;
  const projectileGroup = new Group();
  const orbGroup = new Group();
  scene.add(projectileGroup, orbGroup, particles.object, vfx.object);
  const projectiles = createProjectileLayer(projectileGroup);
  const orbs = createOrbLayer(orbGroup);

  // The loop calls `handleEvents` once per tick; the renderer stores positions once per
  // tick and lerps between the last two ticks (spec 11.4).
  let tickCount = 0;
  let lastSnapshotTick = -1;
  let lastDrawMs = performance.now();

  /** Copies the current sim positions into the interpolation store. */
  function snapshot(state: Readonly<SimState>): void {
    for (const layer of unitLayers) {
      layer.sync(state.defenders, state.enemies);
    }
    projectiles.sync(state.projectiles);
    orbs.sync(state.orbs, ORB_HEIGHT);
  }

  return {
    scene,
    camera,
    handleEvents: (events): void => {
      tickCount += 1;
      vfx.handleEvents(events);
      for (const layer of unitLayers) {
        applyUnitEvents(events, layer);
      }
      for (const event of events) {
        if (event.type === 'projectileSpawned') {
          projectiles.spawn(event.id, event.kind, event.x, event.lane);
        } else if (event.type === 'projectileEnded') {
          projectiles.remove(event.id);
        } else if (event.type === 'orbSpawned') {
          orbs.spawn(event.id, event.x, event.lane, ORB_HEIGHT);
        } else if (event.type === 'orbCollected' || event.type === 'orbExpired') {
          orbs.remove(event.id);
        }
      }
    },
    draw: (state, alpha): void => {
      if (tickCount !== lastSnapshotTick) {
        snapshot(state);
        lastSnapshotTick = tickCount;
      }
      for (const layer of unitLayers) {
        layer.apply(alpha);
      }
      projectiles.apply(alpha);
      orbs.apply(alpha);
      const now = performance.now();
      const deltaSeconds = Math.min(Math.max((now - lastDrawMs) / 1000, 0), 0.1);
      lastDrawMs = now;
      propSprites.update(camera);
      const sceneSeconds = (now - sceneStartMs) / 1000;
      setGroundSurfaceTime(sceneSeconds);
      portalVortex.update(sceneSeconds);
      ambientMotes.update(sceneSeconds);
      vfx.update(state, deltaSeconds, camera);
      particles.update(deltaSeconds);
      // Spec 9.7: 0.05 unit camera shake for 0.15 s on heavy hits, trap fire and
      // boss/Ogre smashes; the camera returns to its fitted position afterwards.
      shake.update(now);
    },
    resize: (aspect): void => {
      fitLevelCamera(camera, aspect);
      shake.refit();
    },
    dispose: (): void => {
      vfx.dispose();
      particles.dispose();
      unitStack.dispose();
      projectiles.dispose();
      orbs.dispose();
      propSprites.dispose();
      portalVortex.dispose();
      ambientMotes.dispose();
      environment.dispose();
      grid?.dispose();
      grid = null;
      scene.clear();
    },
  };
}
