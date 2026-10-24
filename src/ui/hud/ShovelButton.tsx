/** Props of the shovel button at the end of the card bar (spec 3.7, 9.8). */
export interface ShovelButtonProps {
  readonly active: boolean;
  readonly shaking: boolean;
  readonly onToggle: () => void;
}

/** Greybox shovel button: tap it, then tap a defender to remove it (spec 3.7). */
export function ShovelButton({ active, shaking, onToggle }: ShovelButtonProps) {
  const classNames = ['hud-button', 'hud-shovel'];
  if (active) {
    classNames.push('hud-button--selected');
  }
  if (shaking) {
    classNames.push('hud-button--shake');
  }
  return (
    <button
      type="button"
      class={classNames.join(' ')}
      onClick={onToggle}
      aria-pressed={active}
      aria-label="Shovel"
    >
      <span class="hud-shovel__handle" aria-hidden="true" />
      <span class="hud-shovel__blade" aria-hidden="true" />
    </button>
  );
}
