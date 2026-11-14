/**
 * Building blocks shared by the campaign level scene and the Duel scene (issue #129):
 * the spec 9.1 camera with the 9.2 lights and sky, the GLB-to-sprite unit layer
 * stack of 11.7 and the 9.7 screen shake. Both scenes compose these, so the Duel
 * looks and behaves exactly like a level without copying the setup code.
 */
import { DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, Vector3 } from 'three';

import { applySky } from './backdrop';
import { fitLevelCamera, LEVEL_CAMERA_FOV } from './cameraFit';
import { readDebugAnimationHold } from './debugAnimation';
import type { ParticleBursts } from './particles';
import { createSpriteUnitLayer } from './sprites';
import { createUnitLayer, type UnitLayer } from './units';
import { SHAKE_AMPLITUDE, SHAKE_DURATION_S } from './vfx/juice';

/** Sprites draw 50 % taller than their measured model height for phone readability (9.3). */
const SPRITE_WORLD_SCALE = 1.5;

/** A scene with the sky, the spec 9.2 lights and the fitted spec 9.1 camera. */
export interface SceneStage {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
}

/** Creates the sky, the 9.2 key and fill lights and the 9.1 portrait camera. */
export function createSceneStage(): SceneStage {
  const scene = new Scene();
  applySky(scene);
  const camera = new PerspectiveCamera(LEVEL_CAMERA_FOV, 1, 0.1, 60);
  fitLevelCamera(camera, 1);
  // Spec 9.2: one warm key light from the upper left front plus the cool hemisphere fill.
  const keyLight = new DirectionalLight(0xfff2d9, 2.2);
  keyLight.position.set(-6, 9, 6);
  scene.add(keyLight);
  scene.add(new HemisphereLight(0xbfe3ff, 0x6b8f4e, 0.9));
  return { scene, camera };
}

/** The live unit layers: the GLB fallback until the sprite atlases load, then sprites (11.7). */
export interface UnitLayerStack {
  /** The layers to drive this frame; shrinks to the sprite layer once it is ready. */
  readonly layers: UnitLayer[];
  dispose(): void;
}

/**
 * Creates the 2.5D sprite unit layer plus the GLB unit layer of M3 as its fallback
 * (spec 11.7). The GLB layer stays visible until the atlases loaded, then the
 * sprites take over and the 3D layer is disposed.
 */
export function createUnitLayerStack(
  scene: Scene,
  camera: PerspectiveCamera,
  particles: ParticleBursts,
): UnitLayerStack {
  const unitGroup = new Group();
  const glbUnitGroup = new Group();
  scene.add(unitGroup, glbUnitGroup);
  // Debug-only screenshot helper (`?debuganim=kind:progress`), issue #74.
  const debugAnimationHold = readDebugAnimationHold(window.location.search);
  const glbUnits = createUnitLayer(glbUnitGroup, { debugAnimationHold, particles });
  const spriteUnits = createSpriteUnitLayer(unitGroup, {
    camera,
    particles,
    debugAnimationHold,
    worldScale: SPRITE_WORLD_SCALE,
  });
  const layers: UnitLayer[] = [glbUnits, spriteUnits];
  void spriteUnits.ready.then((available) => {
    const index = layers.indexOf(glbUnits);
    if (!available || index < 0) {
      return;
    }
    glbUnitGroup.visible = false;
    layers.splice(index, 1);
    glbUnits.dispose();
  });
  return {
    layers,
    dispose: (): void => {
      for (const layer of layers) {
        layer.dispose();
      }
      layers.length = 0;
    },
  };
}

/** The spec 9.7 screen shake of one camera. */
export interface CameraShake {
  /** Starts or extends a 0.15 s shake with at least this amplitude. */
  request(amplitude: number): void;
  /** Offsets the camera while a shake runs, else puts it back on its fitted position. */
  update(nowMs: number): void;
  /** Stores the fitted camera position after a resize. */
  refit(): void;
}

/** Creates the 9.7 shake: random offsets of the fitted camera position, then back. */
export function createCameraShake(camera: PerspectiveCamera): CameraShake {
  const basePosition = new Vector3().copy(camera.position);
  let endsAtMs = 0;
  let amplitude = SHAKE_AMPLITUDE;
  return {
    request: (nextAmplitude): void => {
      endsAtMs = Math.max(endsAtMs, performance.now() + SHAKE_DURATION_S * 1000);
      amplitude = Math.max(amplitude, nextAmplitude);
    },
    update: (nowMs): void => {
      camera.position.copy(basePosition);
      if (nowMs < endsAtMs) {
        camera.position.x += (Math.random() * 2 - 1) * amplitude;
        camera.position.y += (Math.random() * 2 - 1) * amplitude;
      }
    },
    refit: (): void => {
      basePosition.copy(camera.position);
    },
  };
}
