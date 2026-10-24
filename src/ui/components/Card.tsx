import type { HudCardView } from '../hud/types';
import { factionColor, rarityColor } from '../hud/factionStyles';

/** Props of one loadout card in the card bar (spec 3.5, 9.8). */
export interface CardProps {
  readonly card: HudCardView;
  readonly selected: boolean;
  readonly shaking: boolean;
  readonly onSelect: () => void;
}

/**
 * Greybox loadout card: faction placeholder portrait, Essence cost badge, rarity frame
 * and the cooldown overlay that shrinks from top to bottom with the remaining seconds
 * (spec 3.5, 9.8). Final card art arrives with M3 issue 3.11.
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
  const portraitBackground = [
    'radial-gradient(circle at 50% 30%, rgba(244, 251, 255, 0.35) 0%, rgba(244, 251, 255, 0) 55%)',
    'linear-gradient(160deg, rgba(27, 27, 47, 0.1) 0%, rgba(27, 27, 47, 0.55) 100%)',
    factionColor(card.faction),
  ].join(', ');
  return (
    <button
      type="button"
      class={classNames.join(' ')}
      style={{ borderColor: rarityColor(card.rarity) }}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${card.name}, ${card.cost} Essence`}
    >
      <span
        class="hud-card__portrait"
        style={{ background: portraitBackground }}
        aria-hidden="true"
      >
        <span class="hud-card__blob" />
      </span>
      <span class="hud-card__name">{card.name}</span>
      <span class="hud-card__cost" aria-hidden="true">
        <span class="hud-card__essence-icon" />
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
