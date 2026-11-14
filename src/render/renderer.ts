import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { DuelEvent, DuelState } from '../sim/duel';
import type { SimEvent, SimState } from '../sim/types';
import { createDebugOverlay, type DebugSimInfo } from './debugOverlay';
import { createDuelScene, type DuelScene, type DuelViewOptions } from './duel/duelScene';
import type { PlacementHintKind } from './duel/placementHint';
import type { LevelViewOptions } from './grid';
import { createLevelScene, type LevelScene } from './levelScene';
import { createPostProcessing, type PostProcessing } from './postprocessing';
import { createTitleScene } from './titleScene';
import { createTitleHeroes } from './titleHeroes';

/** Camera position of the title screen (a 3/4 view of the Brightvale gate). */
const CAMERA_POSITION = new Vector3(1.7, 1.82, 9.0);
const CAMERA_TARGET = new Vector3(0.1, 1.5, -3.4);
const CAMERA_FOV = 34;

/** The renderer surface the rest of the app uses. */
export interface GameRenderer {
  readonly canvas: HTMLCanvasElement;
  /**
   * Renders one frame. Without arguments it renders the title scene, or the shown level's
   * last frame. With a sim state it renders the greybox level and lerps the entities by
   * alpha (0..1) between ticks (spec 11.4).
   */
  draw(state?: Readonly<SimState>, alpha?: number): void;
  /** Applies one simulation tick's events; a no-op while the title scene is shown (spec 11.4). */
  handleEvents(events: readonly SimEvent[]): void;
  /** Switches the canvas to the greybox level renderer of issue #24 (spec 9.1, 11.7). */
  showLevel(options: LevelViewOptions): LevelScene;
  /** Switches back from a level to the 3D title scene (shell navigation, spec 11.8). */
  showTitle(): void;
  /**
   * Switches the canvas to the Duel renderer (spec 18.1, issue #129), drawn from the
   * view of `options.viewSide`: the north view is mirrored, never the sim.
   */
  showDuel(options: DuelViewOptions): DuelScene;
  /** Renders one Duel frame and lerps the units by alpha (0..1) between ticks (spec 11.4). */
  drawDuel(state: Readonly<DuelState>, alpha: number): void;
  /** Applies one Duel tick's events; a no-op unless a Duel is shown. */
  handleDuelEvents(events: readonly DuelEvent[]): void;
  /** Shows the board highlight of a held card (spec 18.9); a no-op unless a Duel is shown. */
  setDuelPlacementHint(kind: PlacementHintKind): void;
  /**
   * Converts a DOM pointer position into the world point where its ray hits the ground
   * plane (spec 9.1). The HUD (#26) uses it to turn taps into tiles and orb picks. In a
   * Duel the point is in sim coordinates (x, z = lane + 0.5): the north view's mirror is
   * undone here, so the HUD never mirrors anything itself (spec 18.1).
   */
  pointerToWorld(
    clientX: number,
    clientY: number,
  ): { readonly x: number; readonly z: number } | null;
  dispose(): void;
}

/**
 * Creates the full-screen three.js canvas with the stylized title scene (spec 9.x) and,
 * on demand, the greybox level renderer of M1. One `WebGLRenderer` and one canvas serve
 * both scenes, so the title screen stays the default view.
 */
export function createRenderer(container: HTMLElement): GameRenderer {
  const renderer = new WebGLRenderer({ antialias: true });
  // Spec 11.7: cap the device pixel ratio at 2.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // The post-processing composer renders several passes per frame; keep the renderer
  // statistics across them so the 11.7 draw-call/triangle overlay shows the real totals.
  renderer.info.autoReset = false;

  const titleScene = new Scene();
  titleScene.background = new Color(0x9fd8ff);

  const titleCamera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 140);
  titleCamera.position.copy(CAMERA_POSITION);
  titleCamera.lookAt(CAMERA_TARGET);

  // Spec 9.2: one warm directional key light from the upper left front + a cool
  // hemisphere fill. No real-time shadows; every prop gets a blob shadow.
  const keyLight = new DirectionalLight(0xfff2d9, 2.6);
  keyLight.position.set(-6, 9, 6);
  titleScene.add(keyLight);
  const fillLight = new HemisphereLight(0xbfe3ff, 0x6b8f4e, 0.7);
  titleScene.add(fillLight);

  const title = createTitleScene(titleScene);
  // 2.5D key art on the home screen: defender billboards posed in front of the gate.
  const titleHeroes = createTitleHeroes();
  titleScene.add(titleHeroes.group);
  let titleStartedAtMs = performance.now();
  // Spec 11.7: draw calls, triangles and fps in a backquote overlay; `?perf=1` opens it.
  const debugOverlay = createDebugOverlay(
    container,
    new URLSearchParams(window.location.search).has('perf'),
  );

  // 2.5D post-processing (issue #114): bloom + tilt-shift + colour grade for both the
  // title scene and the level. `?post=0` turns it off (debug/perf).
  const postDisabled = new URLSearchParams(window.location.search).get('post') === '0';
  const postProcessing: PostProcessing = createPostProcessing(renderer, titleScene, titleCamera, {
    enabled: !postDisabled,
    // Gameplay readability first: a wide sharp band over the board, light tilt-shift
    // blur only at the far top and the extreme foreground, gentle bloom for emissives.
    bloomStrength: 0.8,
    bloomThreshold: 1,
    bloomRadius: 0.45,
    focusCenter: 0.46,
    focusHalfHeight: 0.3,
    focusFeather: 0.2,
    blurPixels: 1.6,
    vignetteStrength: 0.26,
    saturation: 1.1,
    contrast: 1.03,
  });

  let levelScene: LevelScene | null = null;
  let duelScene: DuelScene | null = null;

  // Reused for HUD pointer picking: a ray from the level camera against the y = 0 plane.
  const pointer = new Vector2();
  const pointerRaycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const groundHit = new Vector3();

  container.appendChild(renderer.domElement);

  const resize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    titleCamera.aspect = width / height;
    titleCamera.updateProjectionMatrix();
    levelScene?.resize(width / height);
    duelScene?.resize(width / height);
    postProcessing.setSize(width, height);
  };
  resize();
  window.addEventListener('resize', resize);

  /** Records the `renderer.info` numbers plus the sim diagnostics of the frame just rendered. */
  const recordDebugFrame = (simInfo?: DebugSimInfo): void => {
    debugOverlay.recordFrame(
      performance.now(),
      {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      },
      simInfo,
    );
  };

  /** Read-only sim diagnostics for the debug overlay while a level is active (issue #39). */
  const readDebugSimInfo = (state: Readonly<SimState>): DebugSimInfo => ({
    tick: state.tick,
    status: state.status,
    stars: state.stars,
    enemies: state.enemies.length,
    defenders: state.defenders.length,
    orbs: state.orbs.length,
  });

  /** Disposes the shown level or Duel; the title scene is the default view again. */
  const disposeScenes = (): void => {
    levelScene?.dispose();
    levelScene = null;
    duelScene?.dispose();
    duelScene = null;
  };

  /** Animates and renders the title scene with its gentle camera sway (spec 9.7). */
  const drawTitle = (): void => {
    const elapsedSeconds = (performance.now() - titleStartedAtMs) / 1000;
    title.update(elapsedSeconds);
    titleCamera.position.x = CAMERA_POSITION.x + Math.sin(elapsedSeconds * 0.23) * 0.16;
    titleCamera.position.y = CAMERA_POSITION.y + Math.sin(elapsedSeconds * 0.31) * 0.04;
    titleCamera.lookAt(CAMERA_TARGET);
    titleHeroes.update(elapsedSeconds, titleCamera);
    postProcessing.setScene(titleScene, titleCamera);
    postProcessing.render();
  };

  return {
    canvas: renderer.domElement,
    draw: (state?: Readonly<SimState>, alpha = 0): void => {
      renderer.info.reset();
      let simInfo: DebugSimInfo | undefined;
      if (duelScene !== null) {
        postProcessing.setScene(duelScene.scene, duelScene.camera);
        postProcessing.render();
      } else if (levelScene === null) {
        drawTitle();
      } else {
        if (state !== undefined) {
          levelScene.draw(state, alpha);
          simInfo = readDebugSimInfo(state);
        }
        postProcessing.setScene(levelScene.scene, levelScene.camera);
        postProcessing.render();
      }
      recordDebugFrame(simInfo);
    },
    handleEvents: (events): void => {
      levelScene?.handleEvents(events);
    },
    drawDuel: (state, alpha): void => {
      renderer.info.reset();
      if (duelScene !== null) {
        duelScene.draw(state, alpha);
        postProcessing.setScene(duelScene.scene, duelScene.camera);
        postProcessing.render();
      }
      // Draw calls, triangles and fps only; the level diagnostics have no Duel meaning.
      recordDebugFrame();
    },
    handleDuelEvents: (events): void => {
      duelScene?.handleEvents(events);
    },
    setDuelPlacementHint: (kind): void => {
      duelScene?.setPlacementHint(kind);
    },
    showTitle: (): void => {
      disposeScenes();
      titleStartedAtMs = performance.now();
    },
    showDuel: (options): DuelScene => {
      disposeScenes();
      duelScene = createDuelScene(options);
      resize();
      return duelScene;
    },
    showLevel: (options): LevelScene => {
      disposeScenes();
      levelScene = createLevelScene(options);
      resize();
      console.log(
        'CAMDBG ' +
          JSON.stringify({
            pos: levelScene.camera.position.toArray(),
            fov: levelScene.camera.fov,
            aspect: levelScene.camera.aspect,
          }),
      );
      return levelScene;
    },
    pointerToWorld: (clientX, clientY) => {
      const camera = duelScene?.camera ?? levelScene?.camera;
      if (camera === undefined) {
        return null;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        return null;
      }
      pointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -(((clientY - bounds.top) / bounds.height) * 2 - 1),
      );
      pointerRaycaster.setFromCamera(pointer, camera);
      const hit = pointerRaycaster.ray.intersectPlane(groundPlane, groundHit);
      if (hit === null) {
        return null;
      }
      return duelScene === null ? { x: hit.x, z: hit.z } : duelScene.viewToSim(hit.x, hit.z);
    },
    dispose: (): void => {
      window.removeEventListener('resize', resize);
      debugOverlay.dispose();
      postProcessing.dispose();
      titleHeroes.dispose();
      disposeScenes();
      renderer.dispose();
    },
  };
}
