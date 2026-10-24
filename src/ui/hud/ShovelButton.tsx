import { Icon } from '../components/Icon';

/** Props of the shovel button at the end of the card bar (spec 3.7, 9.8). */
export interface ShovelButtonProps {
  readonly active: boolean;
  readonly shaking: boolean;
  readonly onToggle: () => void;
}

/** Shovel button (spec 9.8, 72 x 72 px): tap it, then tap a defender to remove it (spec 3.7). */
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
      <Icon name="shovel" class="hud-button__icon hud-shovel__icon" />
    </button>
  );
}
