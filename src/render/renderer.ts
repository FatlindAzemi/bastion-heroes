import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { SimEvent, SimState } from '../sim/types';
import { createDebugOverlay } from './debugOverlay';
import type { LevelViewOptions } from './grid';
import { createLevelScene, type LevelScene } from './levelScene';
import { createTitleScene } from './titleScene';

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
  const titleStartedAtMs = performance.now();
  // Spec 11.7: draw calls, triangles and fps in a backquote overlay; `?perf=1` opens it.
  const debugOverlay = createDebugOverlay(
    container,
    new URLSearchParams(window.location.search).has('perf'),
  );

  let levelScene: LevelScene | null = null;

  container.appendChild(renderer.domElement);

  const resize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    titleCamera.aspect = width / height;
    titleCamera.updateProjectionMatrix();
    levelScene?.resize(width / height);
  };
  resize();
  window.addEventListener('resize', resize);

  /** Records the `renderer.info` numbers of the frame that was just rendered. */
  const recordDebugFrame = (): void => {
    debugOverlay.recordFrame(performance.now(), {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    });
  };

  /** Animates and renders the title scene with its gentle camera sway (spec 9.7). */
  const drawTitle = (): void => {
    const elapsedSeconds = (performance.now() - titleStartedAtMs) / 1000;
    title.update(elapsedSeconds);
    titleCamera.position.x = CAMERA_POSITION.x + Math.sin(elapsedSeconds * 0.23) * 0.16;
    titleCamera.position.y = CAMERA_POSITION.y + Math.sin(elapsedSeconds * 0.31) * 0.04;
    titleCamera.lookAt(CAMERA_TARGET);
    renderer.render(titleScene, titleCamera);
  };

  return {
    canvas: renderer.domElement,
    draw: (state?: Readonly<SimState>, alpha = 0): void => {
      if (levelScene === null) {
        drawTitle();
      } else {
        if (state !== undefined) {
          levelScene.draw(state, alpha);
        }
        renderer.render(levelScene.scene, levelScene.camera);
      }
      recordDebugFrame();
    },
    handleEvents: (events): void => {
      levelScene?.handleEvents(events);
    },
    showLevel: (options): LevelScene => {
      levelScene?.dispose();
      levelScene = createLevelScene(options);
      resize();
      return levelScene;
    },
    dispose: (): void => {
      window.removeEventListener('resize', resize);
      debugOverlay.dispose();
      levelScene?.dispose();
      renderer.dispose();
    },
  };
}
