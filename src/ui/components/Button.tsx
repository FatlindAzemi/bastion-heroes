import type { ComponentChildren } from 'preact';

/** Colour roles of the 9.8 button palette: primary green and secondary blue. */
export type ButtonVariant = 'primary' | 'secondary';

/** Props of the shared screen button. */
export interface ButtonProps {
  readonly children: ComponentChildren;
  readonly onClick: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  /** `data-testid` hook for the Playwright screenshot tests (spec 16.5). */
  readonly testId?: string;
}

/**
 * 9.8-styled button for the Scouting and Loadout screens: 16 px radius, 6 px
 * darker bottom edge, 4 px travel when pressed, at least a 48 x 48 px target.
 */
export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled = false,
  testId,
}: ButtonProps) {
  return (
    <button
      type="button"
      class={`screen-button screen-button--${variant}`}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
