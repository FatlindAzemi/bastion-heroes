import { Icon } from '../components/Icon';
import type { HudLevelProgressView } from './types';

/** Props of the bottom-right level progress bar (spec 9.8, 3.10). */
export interface LevelProgressProps {
  readonly progress: HudLevelProgressView;
}

/** Clamps a value into the 0..1 range. */
function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Level progress bar (spec 9.8: 220 x 28 px, bottom right): a fill plus one flag
 * icon per BIG wave and a skull for the final wave (spec 3.10).
 */
export function LevelProgress({ progress }: LevelProgressProps) {
  const fillPercent = Math.round(clampFraction(progress.fillFraction) * 100);
  return (
    <div
      class="hud-progress"
      role="progressbar"
      aria-label="Level progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fillPercent}
    >
      <div class="hud-progress__track">
        <span class="hud-progress__fill" style={{ width: `${fillPercent}%` }} />
        {progress.marks.map((mark, index) => (
          <span
            key={`${mark.kind}-${index}`}
            class={`hud-progress__mark hud-progress__mark--${mark.kind}`}
            style={{ left: `${Math.round(clampFraction(mark.fraction) * 100)}%` }}
          >
            <Icon name={mark.kind === 'final' ? 'skull' : 'flag'} class="hud-progress__icon" />
          </span>
        ))}
      </div>
    </div>
  );
}
