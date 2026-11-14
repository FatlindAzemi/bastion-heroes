import { playSfx } from '../../platform/audio';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

/** Props of the round match-menu button, top right (spec 18.9). */
export interface SurrenderButtonProps {
  readonly disabled: boolean;
  readonly onOpen: () => void;
}

/** Pause-style round button, top right (spec 18.9); it opens the surrender confirmation. */
export function SurrenderButton({ disabled, onOpen }: SurrenderButtonProps) {
  return (
    <button
      type="button"
      class="hud-button hud-button--secondary duel-menu-button"
      aria-label="Match menu"
      data-testid="duel-menu"
      disabled={disabled}
      onClick={(): void => {
        playSfx('button_tap');
        onOpen();
      }}
    >
      <Icon name="flag" class="hud-button__icon" />
    </button>
  );
}

/** Props of the surrender confirmation (spec 18.9). */
export interface SurrenderDialogProps {
  readonly onKeepFighting: () => void;
  readonly onSurrender: () => void;
}

/**
 * Surrender confirmation (spec 18.9). The Duel has no pause (18.2), so the match keeps
 * running behind the panel.
 */
export function SurrenderDialog({ onKeepFighting, onSurrender }: SurrenderDialogProps) {
  return (
    <div class="duel-surrender" data-testid="duel-surrender" role="dialog" aria-modal="true">
      <div class="duel-surrender__panel glass-panel">
        <span class="duel-surrender__crest" aria-hidden="true">
          <Icon name="flag" class="duel-surrender__crest-icon" />
        </span>
        <p class="duel-surrender__title">Surrender?</p>
        <p class="duel-surrender__subtitle">The match keeps running. Giving up counts as a loss.</p>
        <div class="duel-surrender__actions">
          <Button variant="primary" onClick={onKeepFighting} testId="duel-keep-fighting">
            Keep fighting
          </Button>
          <Button variant="danger" onClick={onSurrender} testId="duel-surrender-confirm">
            Surrender
          </Button>
        </div>
      </div>
    </div>
  );
}
