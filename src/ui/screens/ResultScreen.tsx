import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { formatAmount } from './format';
import { resultRewardRows, resultView } from './resultView';
import type { ResultOptions } from './shellTypes';

/**
 * Result overlay of a finished level run (issue #113, spec 11.8, M4 rewards): the
 * Victory/Defeat banner over the frozen field, the 0-3 star rating, the reward rows
 * (gold, gems, card unlock, chests), and Next Level / Open Chests / Retry / Levels.
 * It owns its root when mounted through `mountResult`, so the level canvas stays
 * visible dimmed behind it.
 */
export function ResultScreen({
  outcome,
  stars,
  levelName,
  rewards,
  nextLevelName,
  onNext,
  chestCount,
  onOpenChests,
  onRetry,
  onLevels,
}: ResultOptions) {
  const view = resultView(outcome, stars);
  const rewardRows = resultRewardRows(rewards);
  const showNext = nextLevelName !== undefined && onNext !== undefined;
  const showChests = (chestCount ?? 0) > 0 && onOpenChests !== undefined;
  return (
    <div
      class={`result-overlay result-overlay--${outcome}`}
      data-testid="result-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={view.heading}
    >
      <div class="result-panel glass-panel">
        <span class="result-panel__trim" aria-hidden="true" />
        <span class="result-panel__crest" aria-hidden="true">
          <Icon name={view.won ? 'crest' : 'skull'} class="result-panel__crest-icon" />
        </span>
        <p class="result-panel__eyebrow">{levelName}</p>
        <h1 class="result-panel__title">{view.heading}</h1>
        <span class="result-panel__rule" aria-hidden="true" />
        <p class="result-panel__subtitle">{view.subtitle}</p>
        <div class="result-stars" role="img" aria-label={`${stars} of 3 stars`}>
          {view.starStates.map((earned, index) => (
            <Icon
              key={index}
              name={earned ? 'star' : 'starEmpty'}
              class={`result-stars__star${earned ? ' result-stars__star--earned' : ''}`}
            />
          ))}
        </div>
        {rewardRows.length === 0 ? (
          <p class="result-panel__hint">
            {view.won
              ? 'The road to the Bastion stays open.'
              : 'Regroup at the gate and try again.'}
          </p>
        ) : (
          <div class="result-rewards" data-testid="result-rewards">
            {rewardRows.map((row) => (
              <div class="result-reward" key={row.id} data-reward={row.id}>
                <Icon name={row.icon} class="result-reward__icon" />
                <span class="result-reward__label">{row.label}</span>
                <span class="result-reward__value">{row.value}</span>
              </div>
            ))}
          </div>
        )}
        {showNext ? (
          <p class="result-panel__next" data-testid="result-next-label">
            Next: {nextLevelName}
          </p>
        ) : null}
        <div class="result-panel__actions">
          {showNext ? (
            <Button variant="primary" onClick={onNext} testId="result-next">
              Next Level
            </Button>
          ) : null}
          <Button
            variant={view.won && !showNext ? 'secondary' : 'primary'}
            onClick={onRetry}
            testId="result-retry"
          >
            Retry
          </Button>
          <Button
            variant={view.won && !showNext ? 'primary' : 'secondary'}
            onClick={onLevels}
            testId="result-levels"
          >
            Levels
          </Button>
          {showChests ? (
            <Button variant="buy" onClick={onOpenChests} testId="result-chests">
              Open Chests ({formatAmount(chestCount ?? 0)})
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
