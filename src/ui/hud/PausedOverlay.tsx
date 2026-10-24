/** Props of the minimal pause overlay (spec 3.2; the full M4 pause menu is out of scope). */
export interface PausedOverlayProps {
  readonly onResume: () => void;
}

/**
 * Minimal pause overlay for the greybox milestone: dim the field and offer Resume.
 * The full pause menu (Restart, Settings, Quit) is milestone M4 (spec 9.8, 11.8).
 */
export function PausedOverlay({ onResume }: PausedOverlayProps) {
  return (
    <div class="hud-paused">
      <div class="hud-paused__panel">
        <p class="hud-paused__title">Paused</p>
        <button
          type="button"
          class="hud-button hud-button--primary hud-paused__resume"
          onClick={onResume}
        >
          Resume
        </button>
      </div>
    </div>
  );
}
