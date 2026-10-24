import { Button } from '../components/Button';

/** Props of the minimal pause overlay (spec 3.2; the full M4 pause menu is out of scope). */
export interface PausedOverlayProps {
  readonly onResume: () => void;
}

/**
 * Pause overlay: dim the field and offer Resume. The full pause menu (Restart,
 * Settings, Quit) is milestone M4 (spec 9.8, 11.8); the Settings icon and button
 * styles for it already exist, so M4 only adds the handlers.
 */
export function PausedOverlay({ onResume }: PausedOverlayProps) {
  return (
    <div class="hud-paused">
      <div class="hud-paused__panel">
        <p class="hud-paused__title hud-outlined-text">Paused</p>
        <Button variant="primary" onClick={onResume} testId="pause-resume">
          Resume
        </Button>
      </div>
    </div>
  );
}
