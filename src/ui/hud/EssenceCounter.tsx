/** Props of the Essence counter in the top left corner (spec 3.3, 9.8). */
export interface EssenceCounterProps {
  readonly essence: number;
}

/** Greybox Essence counter: teal orb icon plus the current Essence number (spec 9.8). */
export function EssenceCounter({ essence }: EssenceCounterProps) {
  return (
    <div class="hud-essence" role="status" aria-label={`Essence ${essence}`}>
      <span class="hud-essence__orb" aria-hidden="true" />
      <span class="hud-essence__value">{essence}</span>
    </div>
  );
}
