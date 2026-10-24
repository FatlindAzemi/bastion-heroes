import { createElement, render } from 'preact';

import { App } from './app';
import { Hud } from './hud/Hud';
import type { HudBus, HudHandle, HudOptions } from './hud/types';
import type { ScoutFlowHandle, ScoutFlowOptions } from './screens/types';
import './styles/tokens.css';
import './styles/global.css';
import './styles/cards.css';
import './styles/hud.css';
import './styles/screens.css';

/** Mounts the Preact UI overlay on top of the 3D canvas (spec 11.8). */
export function mountUi(container: HTMLElement): void {
  const uiRoot = document.createElement('div');
  uiRoot.className = 'ui-root';
  container.appendChild(uiRoot);
  render(createElement(App, { flow: undefined }), uiRoot);
}

/**
 * Mounts the Scouting -> Loadout screen flow (spec 11.8, issue #49) as an opaque
 * Preact overlay over the canvas. The temporary `?level=<id>&scout=1` debug entry
 * (spec 13.7) uses it; the World Map that replaces it is M4. Returns a handle so
 * `src/main.ts` can remove the screens before the HUD mounts.
 */
export function mountScoutFlow(container: HTMLElement, options: ScoutFlowOptions): ScoutFlowHandle {
  const uiRoot = document.createElement('div');
  uiRoot.className = 'ui-root screens-root';
  container.appendChild(uiRoot);
  render(createElement(App, { flow: options }), uiRoot);
  return {
    dispose: (): void => {
      render(null, uiRoot);
      uiRoot.remove();
    },
  };
}

/**
 * Mounts the in-level HUD over the canvas (spec 9.8) and returns its handle. The caller
 * forwards the per-tick command feedback events to `handleEvents` for the red reason text
 * and the control shake (spec 3.4); #27 wires this to the real level run.
 */
export function mountHud(container: HTMLElement, options: HudOptions): HudHandle {
  const hudRoot = document.createElement('div');
  hudRoot.className = 'ui-root hud-root';
  container.appendChild(hudRoot);
  const bus: HudBus = { listener: null };
  render(createElement(Hud, { ...options, bus }), hudRoot);
  return {
    handleEvents: (events): void => {
      bus.listener?.(events);
    },
    dispose: (): void => {
      render(null, hudRoot);
      hudRoot.remove();
    },
  };
}

export type {
  HudActions,
  HudBannerKind,
  HudBossView,
  HudEvent,
  HudHandle,
  HudOptions,
  HudStateView,
} from './hud/types';
export type { LoadoutChoice, ScoutFlowHandle, ScoutFlowOptions } from './screens/types';
