import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

/** Props of the pause overlay (spec 3.2, 9.8; Restart and Quit wired by issue #113). */
export interface PausedOverlayProps {
  readonly onResume: () => void;
  /** Restarts the current level; the Restart button is hidden while absent. */
  readonly onRestart?: () => void;
  /** Quits to the level select; the Quit button is hidden while absent. */
  readonly onQuit?: () => void;
}

/**
 * Portrait pause menu: dims the frozen field and offers Resume plus, when the host
 * provides the callbacks, Restart and Quit (spec 9.8, 11.8). The old debug HUDs
 * without the callbacks keep showing the single Resume button.
 */
export function PausedOverlay({ onResume, onRestart, onQuit }: PausedOverlayProps) {
  return (
    <div class="hud-paused" data-testid="pause-overlay">
      <div class="hud-paused__panel glass-panel">
        <span class="hud-paused__trim" aria-hidden="true" />
        <span class="hud-paused__crest" aria-hidden="true">
          <Icon name="pause" class="hud-paused__crest-icon" />
        </span>
        <div class="hud-paused__header">
          <p class="hud-paused__title">Paused</p>
          <p class="hud-paused__subtitle">Take a breath. The lane holds.</p>
        </div>
        <div class="hud-paused__actions">
          <Button variant="primary" onClick={onResume} testId="pause-resume">
            Resume
          </Button>
          {onRestart === undefined ? null : (
            <Button variant="buy" onClick={onRestart} testId="pause-restart">
              Restart
            </Button>
          )}
          {onQuit === undefined ? null : (
            <Button variant="danger" onClick={onQuit} testId="pause-quit">
              Quit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
