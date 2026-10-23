import { createElement, render } from 'preact';

import { App } from './app';
import './styles/tokens.css';
import './styles/global.css';

/** Mounts the Preact UI overlay on top of the 3D canvas (spec 11.8). */
export function mountUi(container: HTMLElement): void {
  const uiRoot = document.createElement('div');
  uiRoot.className = 'ui-root';
  container.appendChild(uiRoot);
  render(createElement(App, {}), uiRoot);
}
