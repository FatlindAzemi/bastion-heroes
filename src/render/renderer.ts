import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

import { createTitleScene } from './titleScene';

/** Camera position of the title screen (a 3/4 view of the Brightvale gate). */
const CAMERA_POSITION = new Vector3(1.7, 1.82, 9.0);
const CAMERA_TARGET = new Vector3(0.1, 1.5, -3.4);
const CAMERA_FOV = 34;

/** The renderer surface the rest of the app uses. */
export interface GameRenderer {
  readonly canvas: HTMLCanvasElement;
  draw(): void;
  dispose(): void;
}

/**
 * Creates the full-screen three.js canvas and the stylized title scene: sun and sky,
 * meadow, Brightvale gate, Gloom rift and floating Essence (spec 9.x). The gameplay
 * renderer of M1 (issue 1.9) will take over the canvas later.
 */
export function createRenderer(container: HTMLElement): GameRenderer {
  const renderer = new WebGLRenderer({ antialias: true });
  // Spec 11.7: cap the device pixel ratio at 2.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color(0x9fd8ff);

  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 140);
  camera.position.copy(CAMERA_POSITION);
  camera.lookAt(CAMERA_TARGET);

  // Spec 9.2: one warm directional key light from the upper left front + a cool
  // hemisphere fill. No real-time shadows; every prop gets a blob shadow.
  const keyLight = new DirectionalLight(0xfff2d9, 2.6);
  keyLight.position.set(-6, 9, 6);
  scene.add(keyLight);
  const fillLight = new HemisphereLight(0xbfe3ff, 0x6b8f4e, 0.7);
  scene.add(fillLight);

  const titleScene = createTitleScene(scene);
  const startedAtMs = performance.now();

  container.appendChild(renderer.domElement);

  const resize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    canvas: renderer.domElement,
    draw: (): void => {
      const elapsedSeconds = (performance.now() - startedAtMs) / 1000;
      titleScene.update(elapsedSeconds);
      // A barely noticeable camera sway keeps the still frame alive (spec 9.7 juice).
      camera.position.x = CAMERA_POSITION.x + Math.sin(elapsedSeconds * 0.23) * 0.16;
      camera.position.y = CAMERA_POSITION.y + Math.sin(elapsedSeconds * 0.31) * 0.04;
      camera.lookAt(CAMERA_TARGET);
      renderer.render(scene, camera);
    },
    dispose: (): void => {
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
