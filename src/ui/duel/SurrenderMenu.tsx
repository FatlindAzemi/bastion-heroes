import { useState } from 'preact/hooks';

import { playSfx } from '../../platform/audio';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

/** Props of the surrender button and its confirmation (spec 18.9). */
export interface SurrenderMenuProps {
  readonly disabled: boolean;
  readonly onSurrender: () => void;
}

/**
 * Pause-style round button, top right (spec 18.9). The Duel has no pause (18.2), so
 * the match keeps running behind the confirmation panel.
 */
export function SurrenderMenu({ disabled, onSurrender }: SurrenderMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        class="hud-button hud-button--secondary duel-menu-button"
        aria-label="Match menu"
        data-testid="duel-menu"
        disabled={disabled}
        onClick={(): void => {
          playSfx('button_tap');
          setOpen(true);
        }}
      >
        <Icon name="flag" class="hud-button__icon" />
      </button>
      {open && !disabled ? (
        <div class="duel-surrender" data-testid="duel-surrender" role="dialog" aria-modal="true">
          <div class="duel-surrender__panel glass-panel">
            <span class="duel-surrender__crest" aria-hidden="true">
              <Icon name="flag" class="duel-surrender__crest-icon" />
            </span>
            <p class="duel-surrender__title">Surrender?</p>
            <p class="duel-surrender__subtitle">
              The match keeps running. Giving up counts as a loss.
            </p>
            <div class="duel-surrender__actions">
              <Button
                variant="primary"
                onClick={(): void => setOpen(false)}
                testId="duel-keep-fighting"
              >
                Keep fighting
              </Button>
              <Button variant="danger" onClick={onSurrender} testId="duel-surrender-confirm">
                Surrender
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
