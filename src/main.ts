import { defenderById, levelById, rules } from './data';
import { LevelDef } from './data/schemas';
import { createDebugLoadout, fastForward, parseDebugUrl, type DebugLevelRequest } from './debug';
import { startGameLoop, startRenderLoop, type GameLoop } from './loop';
import { createRenderer, type GameRenderer } from './render';
import { createSim } from './sim';
import type { Command, SimEvent, SimState } from './sim/types';
import {
  mountHud,
  mountUi,
  type HudActions,
  type HudEvent,
  type HudHandle,
  type HudStateView,
} from './ui';

/** The sim surface the HUD bridge reads and drives (spec 11.3). */
interface HudSim {
  readonly state: Readonly<SimState>;
  enqueue(command: Command): void;
}

/** Maps the sim's rejected-command events to the HUD feedback events (spec 3.4). */
function mapHudEvents(events: readonly SimEvent[]): HudEvent[] {
  const hudEvents: HudEvent[] = [];
  for (const event of events) {
    if (event.type === 'commandRejected') {
      hudEvents.push({ type: 'commandRejected', reason: event.reason });
    }
  }
  return hudEvents;
}

/** Projects one sim state into the HUD view types (spec 3.5, 9.8). */
function readHudState(sim: HudSim, loop: GameLoop): HudStateView {
  const state = sim.state;
  const tickSeconds = 1 / rules.tick.tickRate;
  const cards = state.loadout.map((entry, index) => {
    const definition = defenderById[entry.defenderId];
    const remainingTicks = Math.max(0, (state.cardCooldownEndTicks[index] ?? 0) - state.tick);
    const totalTicks = Math.max(1, Math.round((definition?.cooldownS ?? 0) * rules.tick.tickRate));
    return {
      defenderId: entry.defenderId,
      name: definition?.name ?? entry.defenderId,
      faction: definition?.faction ?? 'forge',
      rarity: definition?.rarity ?? 'common',
      cost: definition?.cost ?? 0,
      cooldownRemainingSeconds: remainingTicks * tickSeconds,
      cooldownFraction: Math.min(remainingTicks / totalTicks, 1),
    };
  });
  return {
    essence: state.essence,
    cards,
    defenders: state.defenders.map((defender) => ({
      id: defender.id,
      lane: defender.lane,
      col: defender.col,
    })),
    orbs: state.orbs.map((orb) => ({ id: orb.id, lane: orb.lane, x: orb.x })),
    paused: loop.isPaused(),
    speed: loop.getSpeed(),
  };
}

/** Turns HUD intents into sim commands and game-loop calls (spec 11.3, 3.2). */
function createHudActions(sim: HudSim, loop: GameLoop): HudActions {
  return {
    place: (cardIndex, lane, col) => {
      const entry = sim.state.loadout[cardIndex];
      if (entry !== undefined) {
        sim.enqueue({ type: 'place', defenderId: entry.defenderId, lane, col });
      }
    },
    shovel: (lane, col) => sim.enqueue({ type: 'shovel', lane, col }),
    collectOrb: (orbId) => sim.enqueue({ type: 'collectOrb', orbId }),
    togglePause: () => loop.togglePause(),
    toggleSpeed: () => loop.setSpeed(loop.getSpeed() === 1 ? 2 : 1),
  };
}

/** Shows a readable debug-URL error panel instead of crashing the client (issue #27). */
function showDebugError(root: HTMLElement, message: string): void {
  console.error(message);
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'padding:24px;box-sizing:border-box;background:#1b1b2f;color:#f4fbff;' +
    'font-family:monospace;font-size:18px;text-align:center;z-index:99;';
  panel.textContent = message;
  root.appendChild(panel);
}

/**
 * Boots the debug level run of issue #27: real sim, greybox renderer, HUD and the
 * fixed-tick loop. The sim is fast-forwarded `tick` steps before the loop starts,
 * so the first rendered frame already shows the requested tick (spec 13.7).
 */
function startDebugLevel(
  root: HTMLElement,
  renderer: GameRenderer,
  request: DebugLevelRequest,
): void {
  const levelDefinition = levelById[request.levelId];
  if (levelDefinition === undefined) {
    showDebugError(root, `Debug URL: unknown level "${request.levelId}".`);
    return;
  }
  const level = LevelDef.parse(levelDefinition);
  const sim = createSim(level, createDebugLoadout(level), request.seed);
  renderer.showLevel(level);
  fastForward(sim, request.tick, (events) => renderer.handleEvents(events));

  let hud: HudHandle | null = null;
  const levelRenderer = {
    handleEvents: (events: readonly SimEvent[]): void => {
      renderer.handleEvents(events);
      hud?.handleEvents(mapHudEvents(events));
    },
    draw: (state: Readonly<SimState>, alpha: number): void => {
      renderer.draw(state, alpha);
    },
  };
  const loop = startGameLoop({ sim, renderer: levelRenderer });
  hud = mountHud(root, {
    readState: () => readHudState(sim, loop),
    actions: createHudActions(sim, loop),
    pointerToWorld: renderer.pointerToWorld,
  });
}

/** Boots the game client: a full-screen 3D canvas under the Preact UI overlay. */
function boot(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Boot failed: #app element is missing from index.html');
  }
  const debugUrl = parseDebugUrl(window.location.search);
  if (debugUrl.kind === 'error') {
    showDebugError(root, debugUrl.message);
    return;
  }
  const renderer = createRenderer(root);
  if (debugUrl.kind === 'level') {
    startDebugLevel(root, renderer, debugUrl);
    return;
  }
  mountUi(root);
  startRenderLoop(() => {
    renderer.draw();
  });
}

boot();
