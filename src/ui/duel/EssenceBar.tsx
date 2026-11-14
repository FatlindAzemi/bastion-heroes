import { Icon } from '../components/Icon';

/** Props of the Duel Essence bar (spec 18.3, 18.9). */
export interface EssenceBarProps {
  readonly essence: number;
  readonly max: number;
  /** Progress to the next point, 0..1. */
  readonly progress: number;
}

/** Fill of one segment: full below the counter, the current one fills smoothly. */
function segmentFill(index: number, essence: number, progress: number): number {
  if (index < essence) {
    return 1;
  }
  return index === essence ? Math.min(Math.max(progress, 0), 1) : 0;
}

/**
 * Essence bar above the hand (spec 18.9): 10 segments, the current segment fills
 * smoothly towards the next point, and the whole number sits in the Essence orb.
 */
export function EssenceBar({ essence, max, progress }: EssenceBarProps) {
  return (
    <div class="duel-essence" data-testid="duel-essence" data-essence={essence}>
      <span class="duel-essence__orb" role="status" aria-label={`Essence ${essence}`}>
        <Icon name="essence" class="duel-essence__orb-icon" />
        <span class="duel-essence__value">{essence}</span>
      </span>
      <div class="duel-essence__track" aria-hidden="true">
        {Array.from({ length: max }, (_, index) => {
          const fill = segmentFill(index, essence, progress);
          return (
            <span key={index} class={`duel-essence__segment${fill >= 1 ? ' is-full' : ''}`}>
              <span class="duel-essence__fill" style={{ transform: `scaleX(${fill})` }} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
