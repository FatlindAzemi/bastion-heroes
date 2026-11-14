import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { GatePips } from './GatePips';
import { BOT_LEVEL_NAMES, duelResultText } from './duelHudText';
import type { DuelResultOptions } from './types';

/** The Training note in place of the trophy change and rewards (spec 18.10). */
function TrainingNote({ botLevel }: { readonly botLevel: DuelResultOptions['botLevel'] }) {
  const level = botLevel === null ? '' : ` vs ${BOT_LEVEL_NAMES[botLevel]} AI`;
  return (
    <div class="duel-result__note" data-testid="duel-result-note">
      <Icon name="swords" class="duel-result__note-icon" />
      <span>Training{level} · no trophies</span>
    </div>
  );
}

/**
 * Duel result screen (spec 18.9, 20.6): Victory, Defeat or Draw over the frozen
 * board, both gates' remaining health, the trophy change and rewards (none in
 * Training, 18.10), then "Play again" and "Home". It reuses the campaign result
 * panel's chrome so both modes read as one game.
 */
export function DuelResultScreen(options: DuelResultOptions) {
  const text = duelResultText(options.outcome, options.reason);
  const won = options.outcome === 'won';
  return (
    <div
      class={`result-overlay result-overlay--${won ? 'won' : 'lost'} duel-result duel-result--${options.outcome}`}
      data-testid="duel-result"
      data-outcome={options.outcome}
      role="dialog"
      aria-modal="true"
      aria-label={text.heading}
    >
      <div class="result-panel glass-panel">
        <span class="result-panel__trim" aria-hidden="true" />
        <span class="result-panel__crest" aria-hidden="true">
          <Icon
            name={won ? 'crest' : options.outcome === 'draw' ? 'swords' : 'skull'}
            class="result-panel__crest-icon"
          />
        </span>
        <p class="result-panel__eyebrow">{options.training ? 'Training' : 'Duel'}</p>
        <h1 class="result-panel__title">{text.heading}</h1>
        <span class="result-panel__rule" aria-hidden="true" />
        <p class="result-panel__subtitle">{text.subtitle}</p>
        <div class="duel-result__gates">
          <div class="duel-result__gate">
            <span class="duel-result__gate-label">Your gate</span>
            <GatePips health={options.ownGate} max={options.maxGate} side="own" label="Your gate" />
          </div>
          <div class="duel-result__gate">
            <span class="duel-result__gate-label">Enemy gate</span>
            <GatePips
              health={options.opponentGate}
              max={options.maxGate}
              side="enemy"
              label="Enemy gate"
            />
          </div>
        </div>
        {options.training ? <TrainingNote botLevel={options.botLevel} /> : null}
        <div class="result-panel__actions">
          <Button variant="primary" onClick={options.onPlayAgain} testId="duel-play-again">
            Play again
          </Button>
          <Button variant="secondary" onClick={options.onHome} testId="duel-home">
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
