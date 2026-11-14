import { Icon } from '../components/Icon';
import { BOT_LEVEL_NAMES } from './duelHudText';
import { GatePips } from './GatePips';
import type { DuelOpponentView } from './types';

/** Props of the opponent bar at the top (spec 18.9). */
export interface OpponentBarProps {
  readonly opponent: DuelOpponentView;
  readonly gate: number;
  readonly maxGate: number;
}

/**
 * Opponent bar (spec 18.9): name, trophies (in Training the bot level instead, since
 * Training has no trophies, 18.10), the "AI" tag for every bot and the 8 gate pips.
 */
export function OpponentBar({ opponent, gate, maxGate }: OpponentBarProps) {
  const level = opponent.botLevel === null ? null : BOT_LEVEL_NAMES[opponent.botLevel];
  return (
    <div class="duel-opponent" data-testid="duel-opponent">
      <span class="duel-opponent__avatar" aria-hidden="true">
        <Icon name="claw" class="duel-opponent__avatar-icon" />
      </span>
      <div class="duel-opponent__body">
        <div class="duel-opponent__row">
          <span class="duel-opponent__name">{opponent.name}</span>
          {opponent.isBot ? <span class="duel-opponent__ai">AI</span> : null}
          {opponent.trophies === null ? null : (
            <span class="duel-opponent__trophies">{opponent.trophies}</span>
          )}
          {level === null ? null : <span class="duel-opponent__level">{level}</span>}
        </div>
        <GatePips health={gate} max={maxGate} side="enemy" label="Enemy gate" />
      </div>
    </div>
  );
}
