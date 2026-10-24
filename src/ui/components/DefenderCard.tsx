/**
 * Shared collection card for the Loadout screen (spec 3.12, 9.8): the M3 portrait on
 * the rarity gradient, rarity frame, Essence cost badge with the orb icon and the
 * role/damage badge. The same portrait and cost treatment is used by the in-level
 * card bar, so the two views stay visually consistent (issue #76).
 */
import { CardPortrait } from './CardPortrait';
import { Icon } from './Icon';
import { rarityColor } from '../hud/factionStyles';
import type { CollectionCardView } from '../screens/types';

/** Readable role names of the card badge (spec 5.1). */
const ROLE_LABELS: Readonly<Record<string, string>> = {
  producer: 'Producer',
  shooter: 'Shooter',
  wall: 'Wall',
  control: 'Control',
  support: 'Support',
  trap: 'Trap',
};

/** Readable damage type names of the card badge (spec 4.1). */
const DAMAGE_LABELS: Readonly<Record<string, string>> = {
  pierce: 'Pierce',
  blast: 'Blast',
  arcane: 'Arcane',
};

/** Props of one collection card. */
export interface DefenderCardProps {
  readonly card: CollectionCardView;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}

/** Returns the role and, for attacking cards, the damage type shown on the badge. */
function badgeLabel(card: CollectionCardView): string {
  const role = ROLE_LABELS[card.role] ?? card.role;
  if (card.damageType === null) {
    return role;
  }
  return `${role} · ${DAMAGE_LABELS[card.damageType] ?? card.damageType}`;
}

/** Collection card with a rarity frame, portrait, cost badge and role/damage badge (spec 9.8). */
export function DefenderCard({ card, selected, disabled, onSelect }: DefenderCardProps) {
  const classNames = ['defender-card'];
  if (selected) {
    classNames.push('defender-card--selected');
  }
  return (
    <button
      type="button"
      class={classNames.join(' ')}
      style={{ borderColor: rarityColor(card.rarity) }}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${card.name}, ${card.cost} Essence`}
      data-testid="collection-card"
    >
      <CardPortrait
        defenderId={card.defenderId}
        faction={card.faction}
        rarity={card.rarity}
        class="defender-card__portrait"
      />
      <span class="defender-card__rarity" aria-hidden="true">
        {card.rarity}
      </span>
      <span class="defender-card__badge" aria-hidden="true">
        {badgeLabel(card)}
      </span>
      <span class="defender-card__name">{card.name}</span>
      <span class="defender-card__cost essence-badge" aria-hidden="true">
        <Icon name="essence" class="defender-card__essence-icon" />
        {card.cost}
      </span>
      <span class="defender-card__level" aria-hidden="true">
        Lv {card.cardLevel}
      </span>
    </button>
  );
}
