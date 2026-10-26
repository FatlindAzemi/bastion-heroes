import { CardPortrait } from '../components/CardPortrait';
import { Icon } from '../components/Icon';
import { rarityColor } from '../hud/factionStyles';
import type { LoadoutSlots } from './loadoutState';
import type { CollectionCardView } from './types';

/** One loadout slot button; tapping a filled slot removes its card (issue #49). */
function LoadoutSlot({
  card,
  index,
  disabled,
  onRemove,
}: {
  readonly card: CollectionCardView | null;
  readonly index: number;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}) {
  if (card === null) {
    return (
      <button
        type="button"
        class="loadout-slot"
        data-testid="loadout-slot"
        data-filled="false"
        aria-label={`Empty slot ${index + 1}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <span class="loadout-slot__empty" aria-hidden="true">
          +
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      class="loadout-slot"
      data-testid="loadout-slot"
      data-filled="true"
      data-defender-id={card.defenderId}
      style={{ borderColor: rarityColor(card.rarity) }}
      aria-label={`Remove ${card.name}`}
      disabled={disabled}
      onClick={onRemove}
    >
      <CardPortrait
        defenderId={card.defenderId}
        faction={card.faction}
        rarity={card.rarity}
        class="loadout-slot__portrait"
      />
      <span class="loadout-slot__name">{card.name}</span>
      <span class="loadout-slot__cost essence-badge" aria-hidden="true">
        <Icon name="essence" class="loadout-slot__essence-icon" />
        {card.cost}
      </span>
    </button>
  );
}

/** Props of the loadout slots panel (spec 3.12 rule 2, 11.8). */
export interface LoadoutSlotsPanelProps {
  readonly slots: LoadoutSlots;
  readonly collection: readonly CollectionCardView[];
  readonly filledCount: number;
  readonly fixed: boolean;
  readonly onRemoveCard: (slotIndex: number) => void;
}

/** Loadout slots panel: the level's slots plus the fixed-loadout / fill hints (spec 3.12). */
export function LoadoutSlotsPanel({
  slots,
  collection,
  filledCount,
  fixed,
  onRemoveCard,
}: LoadoutSlotsPanelProps) {
  const cardById = new Map(collection.map((card) => [card.defenderId, card] as const));
  const complete = filledCount === slots.length;
  return (
    <section class="loadout-slots-panel glass-panel" aria-label="Loadout slots">
      <header class="loadout-slots-panel__header">
        <h2 class="screen__section-title">Slots</h2>
        <span class="loadout-slots-panel__count">
          {filledCount} / {slots.length}
        </span>
      </header>
      <div class="loadout-slots">
        {slots.map((slot, index) => (
          <LoadoutSlot
            key={index}
            card={slot === null ? null : (cardById.get(slot.defenderId) ?? null)}
            index={index}
            disabled={fixed}
            onRemove={() => onRemoveCard(index)}
          />
        ))}
      </div>
      {fixed ? (
        <p class="loadout-note" data-testid="fixed-loadout-note">
          Tutorial level: this loadout is fixed.
        </p>
      ) : null}
      {!fixed && !complete ? (
        <p class="loadout-note loadout-note--hint">Fill every slot to fight.</p>
      ) : null}
      <p class="loadout-help">Tap a card to slot it. Tap a filled slot to bench it.</p>
    </section>
  );
}
