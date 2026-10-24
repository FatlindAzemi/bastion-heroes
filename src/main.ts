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

  // TODO(#27): remove the greybox preview route when the debug URL lands.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('greybox')) {
    void import('./render/greyboxPreview').then(({ startGreyboxPreview }) => {
      startGreyboxPreview(renderer);
    });
    return;
  }

  mountUi(root);
  startRenderLoop(() => {
    renderer.draw();
  });
}

boot();
