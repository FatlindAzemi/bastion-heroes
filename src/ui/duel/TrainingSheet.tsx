import { playSfx } from '../../platform/audio';
import { Icon } from '../components/Icon';
import { BOT_LEVEL_NAMES } from './duelHudText';
import type { TrainingBotLevel } from './types';

/** Props of the Training bot picker (spec 18.10, 20.6). */
export interface TrainingSheetProps {
  readonly onStart: (level: TrainingBotLevel) => void;
  readonly onClose: () => void;
}

/** One-line descriptions of the three bot levels of spec 18.10. */
const LEVEL_HINTS: Readonly<Record<TrainingBotLevel, string>> = {
  easy: 'Plays random cards',
  normal: 'Counters your strongest lane',
  hard: 'Saves Essence for counters, pushes open lanes',
};

const LEVELS: readonly TrainingBotLevel[] = ['easy', 'normal', 'hard'];

/**
 * Training entry (spec 18.10, 20.6): a bottom sheet over Home that picks the bot
 * level and starts a local Duel. Training gives no trophies and no rewards.
 */
export function TrainingSheet({ onStart, onClose }: TrainingSheetProps) {
  return (
    <div
      class="training-sheet"
      data-testid="training-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Training"
    >
      <button type="button" class="training-sheet__scrim" aria-label="Close" onClick={onClose} />
      <div class="training-sheet__panel glass-panel">
        <span class="training-sheet__handle" aria-hidden="true" />
        <header class="training-sheet__header">
          <Icon name="swords" class="training-sheet__icon" />
          <div>
            <h2 class="training-sheet__title">Training</h2>
            <p class="training-sheet__subtitle">1v1 Duel against an AI bot · no trophies</p>
          </div>
        </header>
        <div class="training-sheet__levels">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              class={`training-level training-level--${level}`}
              data-testid={`training-${level}`}
              onClick={(): void => {
                playSfx('button_tap');
                onStart(level);
              }}
            >
              <span class="training-level__name">{BOT_LEVEL_NAMES[level]}</span>
              <span class="training-level__hint">{LEVEL_HINTS[level]}</span>
              <Icon name="play" class="training-level__go" />
            </button>
          ))}
        </div>
        <button
          type="button"
          class="training-sheet__cancel"
          data-testid="training-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
