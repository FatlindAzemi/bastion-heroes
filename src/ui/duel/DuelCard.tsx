import { CardPortrait } from '../components/CardPortrait';
import { Icon } from '../components/Icon';
import { rarityColor } from '../hud/factionStyles';
import type { DuelCardView } from './duelCards';

/** Props of one card in the Duel hand (spec 9.8, 18.9). */
export interface DuelCardProps {
  readonly card: DuelCardView;
  readonly held: boolean;
  readonly affordable: boolean;
  /** Shakes the card after a rejected play (spec 3.4); the parent remounts it per shake. */
  readonly shaking: boolean;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly onKeyboardSelect: () => void;
}

/** Card classes for the held, dimmed and shaking states. */
function cardClass(held: boolean, affordable: boolean, shaking: boolean): string {
  const classNames = ['duel-card'];
  if (held) {
    classNames.push('duel-card--held');
  }
  if (!affordable) {
    classNames.push('duel-card--dimmed');
  }
  if (shaking) {
    classNames.push('duel-card--shake');
  }
  return classNames.join(' ');
}

/**
 * Duel hand card (spec 9.8 card visual, 18.9): the portrait on the rarity gradient,
 * the cost badge with the Essence orb in the bottom left and the kind icon (shield =
 * defender, claw = raider) in the top right. Unaffordable cards are dimmed.
 */
export function DuelCard(props: DuelCardProps) {
  const { card, held, affordable, shaking } = props;
  return (
    <button
      type="button"
      class={cardClass(held, affordable, shaking)}
      style={{ borderColor: rarityColor(card.rarity) }}
      aria-pressed={held}
      aria-label={`${card.name}, ${card.kind}, ${card.cost} Essence`}
      data-testid="duel-card"
      data-card-id={card.cardId}
      data-kind={card.kind}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onClick={(event): void => {
        // Pointer presses are handled above; `detail === 0` is a keyboard activation.
        if (event.detail === 0) {
          props.onKeyboardSelect();
        }
      }}
    >
      <CardPortrait
        defenderId={card.cardId}
        faction={card.faction}
        rarity={card.rarity}
        class="duel-card__portrait"
      />
      <span class={`duel-card__kind duel-card__kind--${card.kind}`} aria-hidden="true">
        <Icon name={card.kind === 'defender' ? 'shield' : 'claw'} class="duel-card__kind-icon" />
      </span>
      <span class="duel-card__cost" aria-hidden="true">
        <Icon name="essence" class="duel-card__essence-icon" />
        {card.cost}
      </span>
    </button>
  );
}
