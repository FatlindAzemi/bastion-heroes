import { Icon } from './Icon';

/** Props of the shared arcade screen header (issue #114). */
export interface ScreenHeaderProps {
  /** Small uppercase line above the title, e.g. "World 1 - Level 5". */
  readonly eyebrow: string;
  readonly title: string;
  /** Optional pill on the right, e.g. "10 levels". */
  readonly badge?: string;
  /** Shows a round 48 px back button when given. */
  readonly onBack?: () => void;
  /** `data-testid` of the back button for the Playwright flow tests. */
  readonly backTestId?: string;
}

/**
 * Arcade screen header: round back button, eyebrow plus Lilita One title and an
 * optional pill. Shared by the level select, Scouting and Loadout screens so the
 * portrait shell keeps one consistent chrome.
 */
export function ScreenHeader({ eyebrow, title, badge, onBack, backTestId }: ScreenHeaderProps) {
  return (
    <header class="arcade-header">
      {onBack === undefined ? null : (
        <button
          type="button"
          class="arcade-icon-button"
          onClick={onBack}
          aria-label="Back"
          data-testid={backTestId}
        >
          <Icon name="arrowBack" class="arcade-icon-button__icon" />
        </button>
      )}
      <div class="arcade-header__titles">
        <p class="arcade-header__eyebrow">{eyebrow}</p>
        <h1 class="arcade-header__title">{title}</h1>
      </div>
      {badge === undefined ? null : <span class="arcade-header__badge">{badge}</span>}
    </header>
  );
}
