import { formatClock } from './duelHudText';
import type { DuelHudPhase } from './types';

/** Props of the match timer (spec 18.2, 18.9). */
export interface MatchTimerProps {
  readonly seconds: number;
  readonly phase: DuelHudPhase;
}

/** Remaining time, top centre; gold and pulsing in overdrive (spec 18.9). */
export function MatchTimer({ seconds, phase }: MatchTimerProps) {
  const label =
    phase === 'suddenDeath' ? 'Sudden death' : phase === 'overdrive' ? 'Overdrive' : null;
  return (
    <div class={`duel-timer duel-timer--${phase}`} role="timer" data-testid="duel-timer">
      <span class="duel-timer__value">{formatClock(seconds)}</span>
      {label === null ? null : <span class="duel-timer__label">{label}</span>}
    </div>
  );
}
