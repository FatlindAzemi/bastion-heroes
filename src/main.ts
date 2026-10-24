import { defenderById, rules } from './data';
import { startGameLoop, startRenderLoop, type GameLoop } from './loop';
import { createRenderer } from './render';
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

/** Boots the game client: a full-screen 3D canvas under the Preact UI overlay. */
function boot(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Boot failed: #app element is missing from index.html');
  }
  const renderer = createRenderer(root);

  // TODO(#27): remove the greybox preview route when the debug URL lands. It drives the
  // real fixed-tick loop and HUD, so both paths are exercised in the browser. #27 mounts
  // the same HUD for a real level: createSim(...) + renderer.showLevel(level) + the loop
  // below + mountHud(root, { readState, actions, pointerToWorld: renderer.pointerToWorld }).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('greybox')) {
    void import('./render/greyboxPreview').then(({ showGreyboxPreview }) => {
      const sim = showGreyboxPreview(renderer);
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
    });
    return;
  }

  mountUi(root);
  startRenderLoop(() => {
    renderer.draw();
  });
}

boot();
