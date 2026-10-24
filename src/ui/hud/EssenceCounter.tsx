import { Icon } from '../components/Icon';

/** Props of the Essence counter in the top left corner (spec 3.3, 9.8). */
export interface EssenceCounterProps {
  readonly essence: number;
}

/** Essence counter (spec 9.8): the teal Essence orb icon plus the outlined number. */
export function EssenceCounter({ essence }: EssenceCounterProps) {
  return (
    <div class="hud-essence" role="status" aria-label={`Essence ${essence}`}>
      <Icon name="essence" class="hud-essence__orb" />
      <span class="hud-essence__value hud-outlined-text">{essence}</span>
    </div>
  );
}
