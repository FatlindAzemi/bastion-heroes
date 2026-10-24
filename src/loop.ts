import { rules } from './data/rules';
import type { SimEvent, SimState } from './sim/types';

/** Fixed simulation step in seconds (spec 3.2: 30 ticks per second, value from the data rules). */
const TICK_SECONDS = 1 / rules.tick.tickRate;

/**
 * Frame deltas are capped at 0.25 s before they reach the accumulator, so returning from a
 * long stall or a backgrounded tab cannot cause a spiral of death (spec 11.4).
 */
const MAX_FRAME_DELTA_SECONDS = 0.25;

/** The interpolation alpha stays strictly below 1 (spec 11.4: alpha is 0..1). */
const MAX_ALPHA = 1 - 1e-9;

/** Game speed from spec 3.2: 1x or 2x speed; 0 is only used internally while paused. */
export type GameSpeed = 1 | 2;

/** The part of the simulation the loop drives (spec 11.3; `createSim` is the real implementation). */
export interface LoopSim {
  readonly state: Readonly<SimState>;
  /** Advances exactly one fixed tick and returns its events (spec 11.3). */
  step(): SimEvent[];
}

/** The part of the renderer the loop drives (spec 11.4; `GameRenderer` satisfies it). */
export interface LoopRenderer {
  /** Applies one tick of sim events to the visual scene (spec 11.4). */
  handleEvents(events: readonly SimEvent[]): void;
  /** Draws one frame; alpha (0..1) is the interpolation between the last two ticks (spec 11.4). */
  draw(state: Readonly<SimState>, alpha: number): void;
}

/** Result of one frame's fixed-tick accumulator update (spec 11.4). */
export interface LoopAdvance {
  /** Whole fixed ticks to step before drawing this frame. */
  readonly ticks: number;
  /** Interpolation alpha in [0, 1) between the last tick and the next one. */
  readonly alpha: number;
  /** Accumulator left after stepping, in seconds. */
  readonly accumulatorSeconds: number;
}

/** Options of `startGameLoop` (spec 11.4). */
export interface GameLoopOptions {
  readonly sim: LoopSim;
  readonly renderer: LoopRenderer;
  /** Initial game speed (spec 3.2). Defaults to 1x. */
  readonly speed?: GameSpeed;
  /** Bind Space (pause) and Digit1/Digit2 (speed) on the window. Defaults to true. */
  readonly keyboard?: boolean;
}

/**
 * Controls the running game loop for the HUD (#26) and the debug URL (#27):
 * pause/resume, 1x/2x speed and a stop that removes every listener.
 */
export interface GameLoop {
  setSpeed(speed: GameSpeed): void;
  getSpeed(): GameSpeed;
  pause(): void;
  resume(): void;
  togglePause(): void;
  isPaused(): boolean;
  stop(): void;
}

/**
 * Advances the fixed-tick accumulator by one rendered frame (spec 11.4, 3.2).
 * `frameDeltaSeconds` is the wall-clock time since the previous frame; `speed` is 0 while
 * paused and 1 or 2 otherwise. The frame delta is capped at 0.25 s before the speed is
 * applied, exactly like the spec pseudocode, so a long stall cannot run away.
 */
export function advance(
  accumulatorSeconds: number,
  frameDeltaSeconds: number,
  speed: number,
): LoopAdvance {
  const cappedDeltaSeconds = Math.min(Math.max(frameDeltaSeconds, 0), MAX_FRAME_DELTA_SECONDS);
  const addedSeconds = cappedDeltaSeconds * Math.max(speed, 0);
  const totalSeconds = Math.max(accumulatorSeconds, 0) + addedSeconds;
  const ticks = Math.floor(totalSeconds / TICK_SECONDS);
  const remainderSeconds = Math.max(totalSeconds - ticks * TICK_SECONDS, 0);
  const alpha = Math.min(remainderSeconds / TICK_SECONDS, MAX_ALPHA);
  return { ticks, alpha, accumulatorSeconds: remainderSeconds };
}

/** Binds Space (pause) and Digit1/Digit2 (speed); returns the unbind function (spec 3.2). */
function bindKeyboardShortcuts(loop: Pick<GameLoop, 'togglePause' | 'setSpeed'>): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        loop.togglePause();
        break;
      case 'Digit1':
        loop.setSpeed(1);
        break;
      case 'Digit2':
        loop.setSpeed(2);
        break;
      default:
        break;
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return (): void => window.removeEventListener('keydown', onKeyDown);
}

/**
 * Pauses the loop when the tab is hidden (spec 11.4 background rule). Resuming is left to
 * the pause UI (Capacitor's `appStateChange` wiring stays in M6).
 */
function bindVisibilityPause(loop: Pick<GameLoop, 'pause'>): () => void {
  const onVisibilityChange = (): void => {
    if (document.hidden) {
      loop.pause();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return (): void => document.removeEventListener('visibilitychange', onVisibilityChange);
}

/**
 * Starts the fixed 30 Hz game loop of spec 11.4: steps the sim in whole ticks, applies each
 * tick's events to the renderer, then draws once per animation frame with the leftover alpha.
 */
export function startGameLoop(options: GameLoopOptions): GameLoop {
  const { sim, renderer } = options;
  let speed: GameSpeed = options.speed ?? 1;
  let paused = false;
  let stopped = false;
  let accumulatorSeconds = 0;
  let lastTimeMs = performance.now();
  let frameRequest = 0;

  const loop: GameLoop = {
    setSpeed: (nextSpeed): void => {
      speed = nextSpeed;
    },
    getSpeed: (): GameSpeed => speed,
    pause: (): void => {
      paused = true;
    },
    resume: (): void => {
      paused = false;
    },
    togglePause: (): void => {
      paused = !paused;
    },
    isPaused: (): boolean => paused,
    stop: (): void => {
      stopped = true;
      cancelAnimationFrame(frameRequest);
      unbindKeyboard();
      unbindVisibility();
    },
  };

  /** One animation frame: step every whole tick that fits, then draw once (spec 11.4). */
  function frame(timeMs: number): void {
    if (stopped) {
      return;
    }
    const frameDeltaSeconds = (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    const advanced = advance(accumulatorSeconds, frameDeltaSeconds, paused ? 0 : speed);
    accumulatorSeconds = advanced.accumulatorSeconds;
    for (let tick = 0; tick < advanced.ticks; tick += 1) {
      renderer.handleEvents(sim.step());
    }
    renderer.draw(sim.state, advanced.alpha);
    frameRequest = requestAnimationFrame(frame);
  }

  const unbindKeyboard = options.keyboard === false ? (): void => {} : bindKeyboardShortcuts(loop);
  const unbindVisibility = bindVisibilityPause(loop);
  frameRequest = requestAnimationFrame(frame);
  return loop;
}

/**
 * Runs a callback once per rendered animation frame without a simulation. Used by the title
 * screen, which has no level; the fixed 30 Hz loop above drives an active level (spec 11.4).
 */
export function startRenderLoop(onFrame: (deltaMs: number) => void): void {
  let lastTimeMs = performance.now();
  const frame = (timeMs: number): void => {
    onFrame(timeMs - lastTimeMs);
    lastTimeMs = timeMs;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
