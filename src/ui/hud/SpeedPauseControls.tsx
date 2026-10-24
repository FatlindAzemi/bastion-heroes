import { Icon } from '../components/Icon';
import type { HudSpeed } from './types';

/** Props of the speed toggle and pause buttons in the top right corner (spec 3.2, 9.8). */
export interface SpeedPauseControlsProps {
  readonly speed: HudSpeed;
  readonly paused: boolean;
  readonly onToggleSpeed: () => void;
  readonly onTogglePause: () => void;
}

/**
 * Speed toggle (1×/2×) and pause/play button (spec 3.2, 9.8), wired to the
 * `GameLoop` control API of #25. Pause opens the minimal resume overlay; the full
 * pause menu (Restart/Settings/Quit) is milestone M4.
 */
export function SpeedPauseControls({
  speed,
  paused,
  onToggleSpeed,
  onTogglePause,
}: SpeedPauseControlsProps) {
  return (
    <div class="hud-controls">
      <button
        type="button"
        class="hud-button hud-button--secondary hud-button--speed"
        onClick={onToggleSpeed}
        aria-label={`Speed ${speed} times`}
      >
        <Icon name="speed" class="hud-button__icon hud-button__icon--speed" />
        <span class="hud-button__label hud-outlined-text">{speed}×</span>
      </button>
      <button
        type="button"
        class="hud-button hud-button--secondary hud-button--pause"
        onClick={onTogglePause}
        aria-label={paused ? 'Resume' : 'Pause'}
      >
        <Icon name={paused ? 'play' : 'pause'} class="hud-button__icon" />
      </button>
    </div>
  );
}
