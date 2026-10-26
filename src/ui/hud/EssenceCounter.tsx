import { Icon } from '../components/Icon';

/** Props of the Essence counter in the top left corner (spec 3.3, 9.8). */
export interface EssenceCounterProps {
  readonly essence: number;
}

/**
 * Essence counter of the portrait top status bar (spec 9.8): a rounded dark pill
 * with the teal Essence orb and the big outlined number. The pill yields the
 * counter's width so the progress bar and the controls fit one row at 390 px.
 */
export function EssenceCounter({ essence }: EssenceCounterProps) {
  return (
    <div class="hud-essence" role="status" aria-label={`Essence ${essence}`}>
      <span class="hud-essence__orb-ring" aria-hidden="true">
        <Icon name="essence" class="hud-essence__orb" />
      </span>
      <span class="hud-essence__value">{essence}</span>
    </div>
  );
}
