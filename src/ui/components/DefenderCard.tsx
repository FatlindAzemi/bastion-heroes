/**
 * Shared collection card for the Loadout screen (spec 3.12, 9.8): placeholder
 * faction portrait, rarity frame, Essence cost badge and the role/damage badge.
 * Final portraits arrive with M3 issue 3.11; this is the greybox stand-in.
 */
import { factionColor, rarityColor } from '../hud/factionStyles';
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

/** Greybox collection card with a rarity frame, cost badge and role/damage badge (spec 9.8). */
export function DefenderCard({ card, selected, disabled, onSelect }: DefenderCardProps) {
  const classNames = ['defender-card'];
  if (selected) {
    classNames.push('defender-card--selected');
  }
  const portraitBackground = [
    'radial-gradient(circle at 50% 28%, rgba(244, 251, 255, 0.4) 0%, rgba(244, 251, 255, 0) 58%)',
    'linear-gradient(160deg, rgba(27, 27, 47, 0.08) 0%, rgba(27, 27, 47, 0.6) 100%)',
    factionColor(card.faction),
  ].join(', ');
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
      <span class="defender-card__portrait" style={{ background: portraitBackground }}>
        <span class="defender-card__blob" aria-hidden="true" />
      </span>
      <span class="defender-card__rarity" aria-hidden="true">
        {card.rarity}
      </span>
      <span class="defender-card__badge" aria-hidden="true">
        {badgeLabel(card)}
      </span>
      <span class="defender-card__name">{card.name}</span>
      <span class="defender-card__cost" aria-hidden="true">
        <span class="defender-card__essence-icon" />
        {card.cost}
      </span>
      <span class="defender-card__level" aria-hidden="true">
        Lv {card.cardLevel}
      </span>
    </button>
  );
}
