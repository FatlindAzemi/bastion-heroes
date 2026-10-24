import type { HudSpeed } from './types';

/** Props of the speed toggle and pause buttons in the top right corner (spec 3.2, 9.8). */
export interface SpeedPauseControlsProps {
  readonly speed: HudSpeed;
  readonly paused: boolean;
  readonly onToggleSpeed: () => void;
  readonly onTogglePause: () => void;
}

/**
 * Greybox speed toggle (1×/2×) and pause button, wired to the `GameLoop` control API
 * of #25 (spec 3.2). Pause opens the minimal resume overlay, not the M4 pause menu.
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
        {speed}×
      </button>
      <button
        type="button"
        class="hud-button hud-button--secondary hud-button--pause"
        onClick={onTogglePause}
        aria-label={paused ? 'Resume' : 'Pause'}
      >
        {paused ? '▶' : 'II'}
      </button>
    </div>
  );
}
