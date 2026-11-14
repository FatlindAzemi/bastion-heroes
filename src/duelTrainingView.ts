/**
 * Projects the local Training match into the Duel HUD views (spec 18.9) and maps
 * the sim events the HUD reacts to. Pure, so it is unit-tested without a browser
 * (`tests/duelTrainingView.test.ts`). The HUD itself never imports the sim (10.4).
 */
import { duelRules, rules } from './data';
import type { DuelEvent, DuelState, Side } from './sim/duel';
import type { DuelHandView } from './sim/duelMatch';
import type {
  DuelHudEvent,
  DuelHudStateView,
  DuelOpponentView,
  DuelOutcome,
  TrainingBotLevel,
} from './ui';

/** The player's side in Training: always south, drawn at the bottom (spec 18.1). */
export const TRAINING_SIDE: Side = 'south';
/** The bot's side in Training. */
export const TRAINING_BOT_SIDE: Side = 'north';

/** Seconds on the match clock: regular time counts down to 3:00 total, then overdrive (18.2). */
function clockSecondsOf(state: Readonly<DuelState>): number {
  const ticksLeft = Math.max(0, state.phaseEndTick - state.tick);
  const secondsLeft = ticksLeft / rules.tick.tickRate;
  const { regularTimeS, overdriveTimeS } = duelRules.match;
  if (state.phase === 'countdown') {
    return regularTimeS + overdriveTimeS;
  }
  return state.phase === 'regular' ? secondsLeft + overdriveTimeS : secondsLeft;
}

/**
 * Progress to the next Essence point, 0..1 (spec 18.3). `alpha` is the loop's
 * interpolation between ticks, so the current segment fills smoothly.
 */
export function essenceProgressOf(state: Readonly<DuelState>, side: Side, alpha: number): number {
  if (state.sides[side].essence >= duelRules.essence.maxEssence) {
    return 1;
  }
  if (state.nextIncomeTick === null || state.result !== null) {
    return 0;
  }
  const ticksLeft = state.nextIncomeTick - state.tick - alpha;
  return Math.min(Math.max(1 - ticksLeft / state.incomeIntervalTicks, 0), 1);
}

/** The Training bot as the opponent bar shows it: always tagged "AI" (spec 18.10). */
export function trainingOpponent(level: TrainingBotLevel): DuelOpponentView {
  return { name: 'Training Bot', isBot: true, trophies: null, botLevel: level };
}

/** Builds the HUD view of one frame from the public state and the player's own hand. */
export function duelHudStateOf(
  state: Readonly<DuelState>,
  hand: DuelHandView,
  opponent: DuelOpponentView,
  alpha: number,
): DuelHudStateView {
  const own = state.sides[TRAINING_SIDE];
  const ticksLeft = Math.max(0, state.phaseEndTick - state.tick);
  return {
    phase: state.phase,
    clockSeconds: clockSecondsOf(state),
    countdownSeconds: state.phase === 'countdown' ? Math.ceil(ticksLeft / rules.tick.tickRate) : 0,
    essence: own.essence,
    maxEssence: duelRules.essence.maxEssence,
    essenceProgress: essenceProgressOf(state, TRAINING_SIDE, alpha),
    ownGate: own.gateHealth,
    opponentGate: state.sides[TRAINING_BOT_SIDE].gateHealth,
    maxGate: duelRules.gate.gateHealth,
    hand: hand.hand,
    next: hand.next,
    opponent,
    ended: state.result !== null,
  };
}

/** The HUD events of one tick: the player's rejected plays, phase changes and gate hits. */
export function duelHudEventsOf(events: readonly DuelEvent[]): DuelHudEvent[] {
  const hudEvents: DuelHudEvent[] = [];
  for (const event of events) {
    if (event.type === 'commandRejected' && event.side === TRAINING_SIDE) {
      hudEvents.push({ type: 'commandRejected', reason: event.reason });
    } else if (event.type === 'phaseChanged') {
      hudEvents.push({ type: 'phaseChanged', phase: event.phase });
    } else if (event.type === 'gateDamaged') {
      hudEvents.push({ type: 'gateDamaged', own: event.side === TRAINING_SIDE });
    }
  }
  return hudEvents;
}

/** The match result from the player's view (spec 18.2). */
export function trainingOutcomeOf(winner: Side | 'draw'): DuelOutcome {
  if (winner === 'draw') {
    return 'draw';
  }
  return winner === TRAINING_SIDE ? 'won' : 'lost';
}
