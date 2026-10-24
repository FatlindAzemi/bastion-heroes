import { startGameLoop, startRenderLoop } from './loop';
import { createRenderer } from './render';
import { mountUi } from './ui';

/** Boots the game client: a full-screen 3D canvas under the Preact UI overlay. */
function boot(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Boot failed: #app element is missing from index.html');
  }
  const renderer = createRenderer(root);

  // TODO(#27): remove the greybox preview route when the debug URL lands. It drives the
  // same fixed-tick loop as a real level, so the loop path is exercised in the browser.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('greybox')) {
    void import('./render/greyboxPreview').then(({ showGreyboxPreview }) => {
      const sim = showGreyboxPreview(renderer);
      startGameLoop({ sim, renderer });
    });
    return;
  }

  mountUi(root);
  startRenderLoop(() => {
    renderer.draw();
  });
}

boot();
