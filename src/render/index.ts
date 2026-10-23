import {
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';

/** The renderer surface the rest of the app uses. */
export interface GameRenderer {
  readonly canvas: HTMLCanvasElement;
  draw(): void;
  dispose(): void;
}

/**
 * Creates the full-screen three.js canvas with a temporary empty scene.
 * The camera starts at the values of spec 9.1. The greybox renderer replaces this in M1 (issue 1.9).
 */
export function createRenderer(container: HTMLElement): GameRenderer {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color(0x9fd8ff);

  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(4.5, 7.5, 10.5);
  camera.lookAt(4.5, 0, 2.6);

  const ground = new Mesh(new PlaneGeometry(40, 32), new MeshBasicMaterial({ color: 0x7ed957 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(4.5, 0, 14.5);
  scene.add(ground);

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
      renderer.render(scene, camera);
    },
    dispose: (): void => {
      window.removeEventListener('resize', resize);
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
    },
  };
}
