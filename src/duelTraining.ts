/**
 * Training (spec 18.10, 20.6; issue #130): a whole Duel run locally against a bot,
 * without the server. It wires the recorded local match host (#126, #128), one bot
 * (#127), the Duel renderer (#129) and the Duel HUD (18.9), and ends on the result
 * screen. Training gives no trophies and no rewards.
 */
import { duelRules } from './data';
import {
  duelHudEventsOf,
  duelHudStateOf,
  TRAINING_BOT_SIDE,
  TRAINING_SIDE,
  trainingOpponent,
  trainingOutcomeOf,
} from './duelTrainingView';
import { advance } from './loop';
import { playMusic, playSfx } from './platform/audio';
import type { GameRenderer } from './render';
import type { DuelEvent } from './sim/duel';
import { createDuelBot, playDuelBotTurn, type DuelBot } from './sim/duelBot';
import { createRecordedDuelMatch, type LocalDuelMatch } from './sim/duelMatch';
import { mountDuelHud, mountDuelResult, type DuelHudHandle, type TrainingBotLevel } from './ui';

/** Pause between the end of the match and the result screen, so the last hit reads. */
const RESULT_DELAY_MS = 1200;

/** What the shell passes to start Training. */
export interface TrainingRunOptions {
  readonly level: TrainingBotLevel;
  /** "Play again" on the result screen: a new Training match at the same level. */
  readonly onPlayAgain: () => void;
  /** "Home" on the result screen. */
  readonly onHome: () => void;
}

/** A running Training match; `dispose` stops the loop and removes its overlays. */
export interface TrainingRunHandle {
  dispose(): void;
}

/** The parts of one Training match. */
interface TrainingMatch {
  readonly match: LocalDuelMatch;
  readonly bot: DuelBot;
}

/** A fresh 32-bit seed. Seeds are picked outside the sim (spec 3.2), so this may be random. */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/**
 * The recorded local match and the bot. Both players use the Arena 1 starter deck,
 * the one legal deck every player has (spec 20.2); deck building is D2.6 / D4.
 */
function createTrainingMatch(level: TrainingBotLevel): TrainingMatch {
  const deck = duelRules.arenas[0]?.unlocksCardIds ?? [];
  const recorded = createRecordedDuelMatch({
    seed: randomSeed(),
    players: {
      south: { deck, privateSeed: randomSeed() },
      north: { deck, privateSeed: randomSeed() },
    },
  });
  const bot = createDuelBot({ level, side: TRAINING_BOT_SIDE, seed: randomSeed() });
  return { match: recorded.match, bot };
}

/** Sounds of one tick that exist already (Duel audio is D2.5). */
function playTickAudio(events: readonly DuelEvent[]): void {
  if (events.some((event) => event.type === 'trapFired')) {
    playSfx('trap');
  }
}

/** Runs the 30 Hz fixed-tick loop (spec 11.4); `onTicks` steps, `onDraw` draws. Returns a stop. */
function runFrameLoop(onTick: () => void, onDraw: (alpha: number) => void): () => void {
  let accumulatorSeconds = 0;
  let lastTimeMs = performance.now();
  let request = 0;
  const frame = (timeMs: number): void => {
    const advanced = advance(accumulatorSeconds, (timeMs - lastTimeMs) / 1000, 1);
    accumulatorSeconds = advanced.accumulatorSeconds;
    lastTimeMs = timeMs;
    for (let tick = 0; tick < advanced.ticks; tick += 1) {
      onTick();
    }
    onDraw(advanced.alpha);
    request = requestAnimationFrame(frame);
  };
  request = requestAnimationFrame(frame);
  return (): void => cancelAnimationFrame(request);
}

/** Mounts the Duel HUD on the match; `alpha` gives the loop's interpolation for the bars. */
function mountTrainingHud(
  root: HTMLElement,
  renderer: GameRenderer,
  training: TrainingMatch,
  level: TrainingBotLevel,
  alpha: () => number,
): DuelHudHandle {
  const { match } = training;
  const opponent = trainingOpponent(level);
  return mountDuelHud(root, {
    readState: () => duelHudStateOf(match.state, match.handOf(TRAINING_SIDE), opponent, alpha()),
    actions: {
      play: (cardId, lane, col) => match.play(TRAINING_SIDE, { cardId, lane, col }),
      setHeldKind: (kind): void => renderer.setDuelPlacementHint(kind),
      surrender: (): void => match.surrender(TRAINING_SIDE),
    },
    pointerToWorld: renderer.pointerToWorld,
  });
}

/** Mounts the result screen of a finished match with the victory or defeat sting. */
function mountTrainingResult(
  root: HTMLElement,
  match: LocalDuelMatch,
  options: TrainingRunOptions,
): { dispose(): void } | null {
  const ended = match.state.result;
  if (ended === null) {
    return null;
  }
  const outcome = trainingOutcomeOf(ended.winner);
  playSfx(outcome === 'won' ? 'level_win' : 'level_lose');
  playMusic(outcome === 'won' ? 'victory' : 'defeat');
  return mountDuelResult(root, {
    outcome,
    reason: ended.reason,
    ownGate: match.state.sides[TRAINING_SIDE].gateHealth,
    opponentGate: match.state.sides[TRAINING_BOT_SIDE].gateHealth,
    maxGate: duelRules.gate.gateHealth,
    training: true,
    botLevel: options.level,
    onPlayAgain: options.onPlayAgain,
    onHome: options.onHome,
  });
}

/** Starts one Training match on the renderer and returns its handle. */
export function startTrainingRun(
  root: HTMLElement,
  renderer: GameRenderer,
  options: TrainingRunOptions,
): TrainingRunHandle {
  const training = createTrainingMatch(options.level);
  const { match, bot } = training;
  renderer.showDuel({ viewSide: TRAINING_SIDE });
  playMusic('world1_calm');
  const run = { alpha: 0, resultTimer: 0 };
  let hud: DuelHudHandle | null = mountTrainingHud(
    root,
    renderer,
    training,
    options.level,
    () => run.alpha,
  );
  let result: { dispose(): void } | null = null;
  const finish = (): void => {
    hud?.dispose();
    hud = null;
    renderer.setDuelPlacementHint(null);
    result = mountTrainingResult(root, match, options);
  };
  // One tick in the order of #127/#128: bot, human (taps arrive between frames), `step()`.
  const stepTick = (): void => {
    if (match.state.result !== null) {
      return;
    }
    playDuelBotTurn(bot, match);
    const events = match.step();
    renderer.handleDuelEvents(events);
    hud?.handleEvents(duelHudEventsOf(events));
    playTickAudio(events);
    if (match.state.result !== null) {
      run.resultTimer = window.setTimeout(finish, RESULT_DELAY_MS);
    }
  };
  const stopLoop = runFrameLoop(stepTick, (alpha) => {
    run.alpha = match.state.result === null ? alpha : 0;
    renderer.drawDuel(match.state, run.alpha);
  });
  return {
    dispose: (): void => {
      stopLoop();
      window.clearTimeout(run.resultTimer);
      hud?.dispose();
      result?.dispose();
      renderer.setDuelPlacementHint(null);
    },
  };
}
