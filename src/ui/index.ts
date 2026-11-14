import { createElement, render } from 'preact';

import { App } from './app';
import { DuelHud } from './duel/DuelHud';
import { DuelResultScreen } from './duel/DuelResultScreen';
import type {
  DuelHudBus,
  DuelHudHandle,
  DuelHudOptions,
  DuelResultHandle,
  DuelResultOptions,
} from './duel/types';
import { Hud } from './hud/Hud';
import type { HudBus, HudHandle, HudOptions } from './hud/types';
import type { ScoutFlowHandle, ScoutFlowOptions } from './screens/types';
import type { ResultHandle, ResultOptions, ShellHandle, ShellOptions } from './screens/shellTypes';
import './styles/tokens.css';
import './styles/global.css';
import './styles/cards.css';
import './styles/hud.css';
import './styles/screens.css';
import './styles/meta.css';
import './styles/duel.css';

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
 * (spec 13.7) uses it; the playable shell replaces it for the normal flow. Returns
 * a handle so `src/main.ts` can remove the screens before the HUD mounts.
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
 * Mounts the playable shell of issue #113: Title -> Level Select -> Scouting ->
 * Loadout -> `onFight(levelId, loadout)`. The shell is transparent on the title
 * screen so the 3D title scene keeps drawing behind the logo. `src/main.ts` owns
 * the level run and disposes this shell while a level is active.
 */
export function mountShell(container: HTMLElement, options: ShellOptions): ShellHandle {
  const uiRoot = document.createElement('div');
  uiRoot.className = 'ui-root shell-root';
  container.appendChild(uiRoot);
  render(createElement(App, { shell: options }), uiRoot);
  return {
    dispose: (): void => {
      render(null, uiRoot);
      uiRoot.remove();
    },
  };
}

/**
 * Mounts the Victory/Defeat result overlay of issue #113 over the frozen level
 * canvas: the 0-3 star rating plus Retry and Levels. The caller disposes it before
 * starting the next level or remounting the shell.
 */
export function mountResult(container: HTMLElement, options: ResultOptions): ResultHandle {
  const uiRoot = document.createElement('div');
  uiRoot.className = 'ui-root result-root';
  container.appendChild(uiRoot);
  render(createElement(App, { result: options }), uiRoot);
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

/**
 * Mounts the Duel HUD of spec 18.9 over the Duel canvas and returns its handle. The
 * Training loop forwards per-tick rejections and phase changes to `handleEvents`.
 */
export function mountDuelHud(container: HTMLElement, options: DuelHudOptions): DuelHudHandle {
  const hudRoot = document.createElement('div');
  hudRoot.className = 'ui-root hud-root duel-hud-root';
  container.appendChild(hudRoot);
  const bus: DuelHudBus = { listener: null };
  render(createElement(DuelHud, { ...options, bus }), hudRoot);
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

/** Mounts the Duel result screen (spec 18.9, 20.6) over the frozen Duel board. */
export function mountDuelResult(
  container: HTMLElement,
  options: DuelResultOptions,
): DuelResultHandle {
  const uiRoot = document.createElement('div');
  uiRoot.className = 'ui-root result-root';
  container.appendChild(uiRoot);
  render(createElement(DuelResultScreen, options), uiRoot);
  return {
    dispose: (): void => {
      render(null, uiRoot);
      uiRoot.remove();
    },
  };
}

export type {
  DuelHeldKind,
  DuelHudActions,
  DuelHudEvent,
  DuelHudHandle,
  DuelHudOptions,
  DuelHudPhase,
  DuelHudRejectReason,
  DuelHudStateView,
  DuelEndReason,
  DuelOpponentView,
  DuelOutcome,
  DuelResultHandle,
  DuelResultOptions,
  TrainingBotLevel,
} from './duel/types';
export type {
  HudActions,
  HudBannerKind,
  HudBossView,
  HudEvent,
  HudHandle,
  HudOptions,
  HudStateView,
  HudTipView,
} from './hud/types';
export type {
  ResultHandle,
  ResultOptions,
  ResultOutcome,
  ResultStars,
  ShellHandle,
  ShellLevel,
  ShellOptions,
  ShellScreenName,
} from './screens/shellTypes';
export type { LoadoutChoice, ScoutFlowHandle, ScoutFlowOptions } from './screens/types';
