/**
 * The Duel renderer (spec 18.1, 18.7, 9.1, 9.7, 11.7; issue #129): the shared board
 * with a bastion at each end, both sides' units with their side rings, both sides'
 * trap rollers and the gate-hit and trap VFX. It draws the viewer's own side at the
 * bottom: for the north player every position is mirrored by `duelView.ts`, never
 * in the sim. Units, projectiles and hit VFX reuse the campaign layers unchanged.
 */
import { Group, type PerspectiveCamera, type Scene } from 'three';

import { DUEL_BOARD, raiderSpawnXOf } from '../../sim/duel';
import type { DuelEvent, DuelState, Side } from '../../sim/duel';
import type { SimEvent } from '../../sim/types';
import { createAmbientMotes } from '../ambientMotes';
import { fitLevelCamera } from '../cameraFit';
import { createGrid, type Grid } from '../grid';
import { setGroundCorruption, setGroundSurfaceTime } from '../groundSurface';
import { applyUnitEvents } from '../levelScene';
import { createParticleBursts } from '../particles';
import { createProjectileLayer } from '../projectiles';
import { createPropSpriteLayer } from '../propSprites';
import type { RenderSimState } from '../renderState';
import { createCameraShake, createSceneStage, createUnitLayerStack } from '../sceneParts';
import type { UnitLayer } from '../units';
import { createVfxLayer } from '../vfx/index';
import { columnToWorldX, laneToWorldZ, simXToWorldX } from '../worldMapping';
import { createDuelEffects } from './duelEffects';
import { createDuelEnvironment } from './duelEnvironment';
import { duelViewEvents, duelViewState, simPointOfView, viewLane, viewX } from './duelView';
import { createSideRings, type SideRingUnit } from './sideRings';
import { createTrapRollers } from './trapRollers';

/** What the Duel renderer needs to know: whose view it draws (spec 18.1). */
export interface DuelViewOptions {
  readonly viewSide: Side;
  /** Debug slow motion of the effect clock (0..1, default 1); the debug Duel URL sets it. */
  readonly timeScale?: number;
}

/** The Duel renderer surface: like a level scene, fed with Duel state and events. */
export interface DuelScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly viewSide: Side;
  /** Applies one Duel tick's events (spec 11.7, 19.11). */
  handleEvents(events: readonly DuelEvent[]): void;
  /** Stores the latest tick once and lerps every object by alpha (0..1, spec 11.4). */
  draw(state: Readonly<DuelState>, alpha: number): void;
  /** Converts a ground point of the drawn board into sim coordinates (x, z = lane + 0.5). */
  viewToSim(worldX: number, worldZ: number): { readonly x: number; readonly z: number };
  resize(aspect: number): void;
  dispose(): void;
}

/** The side-ring list of one tick in view coordinates (spec 18.1). */
function ringUnits(view: RenderSimState, viewSide: Side): SideRingUnit[] {
  const units: SideRingUnit[] = [];
  for (const defender of view.defenders) {
    const x = columnToWorldX(defender.col);
    units.push({
      id: defender.id,
      x,
      z: laneToWorldZ(defender.lane),
      own: defender.side === viewSide,
    });
  }
  for (const raider of view.enemies) {
    const x = simXToWorldX(raider.x);
    units.push({ id: raider.id, x, z: laneToWorldZ(raider.lane), own: raider.side === viewSide });
  }
  return units;
}

/**
 * Applies one tick to the unit layers. A Duel raider appears at its side's spawn
 * point (18.1), not at the campaign portal, so `enemySpawned` is placed here.
 */
function applyDuelUnitEvents(
  events: readonly DuelEvent[],
  viewEvents: readonly SimEvent[],
  viewSide: Side,
  layers: readonly UnitLayer[],
): void {
  const others = viewEvents.filter((event) => event.type !== 'enemySpawned');
  for (const layer of layers) {
    applyUnitEvents(others, layer);
    for (const event of events) {
      if (event.type === 'enemySpawned') {
        const x = viewX(raiderSpawnXOf(event.side), viewSide);
        layer.spawnEnemy(event.id, event.enemyId, viewLane(event.lane, viewSide), x);
      }
    }
  }
}

/** Creates the Duel renderer for the player of `options.viewSide`. */
export function createDuelScene(options: DuelViewOptions): DuelScene {
  const { viewSide } = options;
  const { scene, camera } = createSceneStage();
  // The greybox grid shows while the World 1 model loads and if it fails (as in a level).
  let grid: Grid | null = createGrid(DUEL_BOARD);
  const environment = createDuelEnvironment();
  const propSprites = createPropSpriteLayer(camera);
  const ambientMotes = createAmbientMotes(Math.min(window.devicePixelRatio, 2));
  scene.add(grid.group, environment.group, propSprites.group, ambientMotes.object);
  // The Duel board has a bastion at both ends and no portal: no violet corruption (18.1).
  setGroundCorruption(0);
  void environment.ready.then((loaded) => {
    if (loaded && grid !== null) {
      scene.remove(grid.group);
      grid.dispose();
      grid = null;
    }
  });

  const particles = createParticleBursts();
  const shake = createCameraShake(camera);
  const vfx = createVfxLayer({ particles, onShake: shake.request });
  const unitStack = createUnitLayerStack(scene, camera, particles);
  const sideRings = createSideRings();
  const trapRollers = createTrapRollers();
  const projectileGroup = new Group();
  scene.add(sideRings.mesh, trapRollers.mesh, projectileGroup, particles.object, vfx.object);
  const projectiles = createProjectileLayer(projectileGroup);
  const effects = createDuelEffects({
    viewSide,
    particles,
    vfx,
    shake: shake.request,
    flashBastion: environment.flash,
  });
  const clock = {
    ticks: 0,
    snapshotTick: -1,
    lastDrawMs: performance.now(),
    startMs: performance.now(),
  };
  let view: RenderSimState | null = null;

  /** Stores the mirrored state of the latest tick (spec 11.4). */
  function snapshot(state: Readonly<DuelState>): RenderSimState {
    const next = duelViewState(state, viewSide);
    for (const layer of unitStack.layers) {
      layer.sync(next.defenders, next.enemies);
    }
    projectiles.sync(next.projectiles);
    sideRings.sync(ringUnits(next, viewSide));
    return next;
  }

  /** Advances every per-frame animation. */
  function animate(state: Readonly<DuelState>, current: RenderSimState): void {
    const now = performance.now();
    const frameSeconds = Math.min(Math.max((now - clock.lastDrawMs) / 1000, 0), 0.1);
    const deltaSeconds = frameSeconds * (options.timeScale ?? 1);
    clock.lastDrawMs = now;
    const sceneSeconds = (now - clock.startMs) / 1000;
    propSprites.update(camera);
    setGroundSurfaceTime(sceneSeconds);
    ambientMotes.update(sceneSeconds);
    trapRollers.update(state, viewSide);
    effects.update(state, deltaSeconds);
    environment.update(deltaSeconds);
    vfx.update(current, deltaSeconds, camera);
    particles.update(deltaSeconds);
    shake.update(now);
  }

  return {
    scene,
    camera,
    viewSide,
    handleEvents: (events): void => {
      clock.ticks += 1;
      const viewEvents = duelViewEvents(events, viewSide);
      vfx.handleEvents(viewEvents);
      applyDuelUnitEvents(events, viewEvents, viewSide, unitStack.layers);
      for (const event of viewEvents) {
        if (event.type === 'projectileSpawned') {
          projectiles.spawn(event.id, event.kind, event.x, event.lane);
        } else if (event.type === 'projectileEnded') {
          projectiles.remove(event.id);
        }
      }
      effects.handleEvents(events);
    },
    draw: (state, alpha): void => {
      if (view === null || clock.ticks !== clock.snapshotTick) {
        view = snapshot(state);
        clock.snapshotTick = clock.ticks;
      }
      for (const layer of unitStack.layers) {
        layer.apply(alpha);
      }
      projectiles.apply(alpha);
      sideRings.apply(alpha);
      animate(state, view);
    },
    viewToSim: (worldX, worldZ) => simPointOfView(worldX, worldZ, viewSide),
    resize: (aspect): void => {
      fitLevelCamera(camera, aspect);
      shake.refit();
    },
    dispose: (): void => {
      vfx.dispose();
      particles.dispose();
      unitStack.dispose();
      projectiles.dispose();
      sideRings.dispose();
      trapRollers.dispose();
      propSprites.dispose();
      ambientMotes.dispose();
      environment.dispose();
      grid?.dispose();
      grid = null;
      scene.clear();
    },
  };
}
