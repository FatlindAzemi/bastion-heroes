import { startRenderLoop } from './loop';
import { createRenderer } from './render';
import { mountUi } from './ui';

/** Boots the game client: a full-screen 3D canvas under the Preact UI overlay. */
function boot(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Boot failed: #app element is missing from index.html');
  }
  const renderer = createRenderer(root);
  mountUi(root);
  startRenderLoop(() => {
    renderer.draw();
  });
}

boot();
