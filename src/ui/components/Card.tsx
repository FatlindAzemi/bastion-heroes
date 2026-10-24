import { Icon } from './Icon';
import { CardPortrait } from './CardPortrait';
import type { HudCardView } from '../hud/types';
import { rarityColor } from '../hud/factionStyles';

/** Props of one loadout card in the card bar (spec 3.5, 9.8). */
export interface CardProps {
  readonly card: HudCardView;
  readonly selected: boolean;
  readonly shaking: boolean;
  readonly onSelect: () => void;
}

/**
 * Final loadout card (spec 9.8 card visual): the M3 portrait on a rarity gradient
 * inside the rarity frame, Essence cost with the orb icon in the bottom left, star
 * pips at ★2/★3, and the cooldown overlay that shrinks from top to bottom with the
 * remaining seconds (spec 3.5). The accessible name keeps the defender name and
 * cost, which the Playwright e2e tests use.
 */
export function Card({ card, selected, shaking, onSelect }: CardProps) {
  const cooldownPercent = Math.round(Math.min(Math.max(card.cooldownFraction, 0), 1) * 100);
  const cooldownSeconds = Math.ceil(card.cooldownRemainingSeconds);
  const classNames = ['hud-card'];
  if (selected) {
    classNames.push('hud-card--selected');
  }
  if (shaking) {
    classNames.push('hud-card--shake');
  }
  if (cooldownPercent > 0) {
    classNames.push('hud-card--cooling');
  }
  const pipCount = card.stars >= 2 ? card.stars : 0;
  return (
    <button
      type="button"
      class={classNames.join(' ')}
      style={{ borderColor: rarityColor(card.rarity) }}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${card.name}, ${card.cost} Essence`}
    >
      <CardPortrait
        defenderId={card.defenderId}
        faction={card.faction}
        rarity={card.rarity}
        class="hud-card__portrait"
      />
      {pipCount > 0 ? (
        <span class="hud-card__stars" aria-hidden="true">
          {Array.from({ length: pipCount }, (_, index) => (
            <Icon key={index} name="star" class="hud-card__star" />
          ))}
        </span>
      ) : null}
      <span class="hud-card__cost" aria-hidden="true">
        <Icon name="essence" class="hud-card__essence-icon" />
        {card.cost}
      </span>
      {cooldownPercent > 0 ? (
        <span
          class="hud-card__cooldown"
          style={{ height: `${cooldownPercent}%` }}
          aria-hidden="true"
        />
      ) : null}
      {cooldownPercent > 0 ? <span class="hud-card__cooldown-label">{cooldownSeconds}</span> : null}
    </button>
  );
}
