/**
 * Shared card portrait visual (spec 9.8, issue #76): the M3 Blender portrait on a
 * gradient in the rarity colour inside a rarity frame, with the faction-coloured
 * gradient stand-in while the portrait has not been generated yet (issue #66).
 */
import { factionColor, rarityColor, rarityGradient } from '../hud/factionStyles';
import { portraitUrl } from '../portraits';

/** Props of one card portrait area. */
export interface CardPortraitProps {
  readonly defenderId: string;
  readonly faction: string;
  readonly rarity: string;
  /** Sizing class of the surrounding card (the portrait follows its card's box). */
  readonly class?: string;
}

/** Card portrait with the Blender portrait or the faction-gradient fallback. */
export function CardPortrait({ defenderId, faction, rarity, class: className }: CardPortraitProps) {
  const url = portraitUrl(defenderId);
  const factionHex = factionColor(faction);
  const classNames = className === undefined ? 'card-portrait' : `card-portrait ${className}`;
  return (
    <span
      class={classNames}
      style={{ borderColor: rarityColor(rarity), background: rarityGradient(rarity) }}
      aria-hidden="true"
    >
      <span
        class="card-portrait__faction"
        style={{
          background: `radial-gradient(circle at 50% 26%, ${factionHex} 0%, ${factionHex}00 72%)`,
        }}
      />
      {url === null ? (
        <span class="card-portrait__blob" />
      ) : (
        <img class="card-portrait__image" src={url} alt="" draggable={false} />
      )}
      <span class="card-portrait__sheen" />
    </span>
  );
}
