/**
 * Shared card portrait visual (spec 9.8, issue #76, issue #114): the pixel-art
 * head-and-shoulders portrait on a gradient in the rarity colour inside a rarity
 * frame, with the faction-coloured gradient stand-in while no portrait exists.
 */
import { factionColor, rarityColor, rarityGradient } from '../hud/factionStyles';
import { portraitSource } from '../portraits';

/** Props of one card portrait area. */
export interface CardPortraitProps {
  readonly defenderId: string;
  readonly faction: string;
  readonly rarity: string;
  /** Sizing class of the surrounding card (the portrait follows its card's box). */
  readonly class?: string;
}

/** Card portrait with the pixel-art portrait, the smooth fallback or the faction blob. */
export function CardPortrait({ defenderId, faction, rarity, class: className }: CardPortraitProps) {
  const source = portraitSource(defenderId);
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
      {source === null ? (
        <span class="card-portrait__blob" />
      ) : (
        <img
          class={`card-portrait__image${source.pixelated ? ' card-portrait__image--pixel' : ''}`}
          src={source.url}
          alt=""
          draggable={false}
        />
      )}
      <span class="card-portrait__inner-shadow" />
      <span class="card-portrait__sheen" />
    </span>
  );
}
