import type { LevelDef } from '../../data/schemas';
import { Button } from '../components/Button';
import { CardPortrait } from '../components/CardPortrait';
import { DefenderCard } from '../components/DefenderCard';
import { Icon } from '../components/Icon';
import { rarityColor } from '../hud/factionStyles';
import {
  filledSlotCount,
  hasFixedLoadout,
  isLoadoutComplete,
  type LoadoutSlots,
} from './loadoutState';
import type { CollectionCardView } from './types';

/** Props of the Loadout screen (spec 3.12 rule 2, 11.8). */
export interface LoadoutScreenProps {
  readonly level: LevelDef;
  readonly collection: readonly CollectionCardView[];
  readonly slots: LoadoutSlots;
  readonly onAddCard: (card: CollectionCardView) => void;
  readonly onRemoveCard: (slotIndex: number) => void;
  readonly onRecommended: () => void;
  readonly onFight: () => void;
  readonly onBack: () => void;
}

/** Returns the ids of the cards currently in the loadout. */
function selectedCardIds(slots: LoadoutSlots): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const slot of slots) {
    if (slot !== null) {
      ids.add(slot.defenderId);
    }
  }
  return ids;
}

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

/**
 * Loadout screen: the full M2 collection on the left, the level's slots on the
 * right and Back / Recommended / Fight!. Tutorial levels 1-4 have a fixed
 * pre-chosen loadout and a disabled collection (spec 3.12, 7.2). The 6-slot
 * grid is the M2 limit; save-data persistence is the M4 seam.
 */
export function LoadoutScreen({
  level,
  collection,
  slots,
  onAddCard,
  onRemoveCard,
  onRecommended,
  onFight,
  onBack,
}: LoadoutScreenProps) {
  const fixed = hasFixedLoadout(level);
  const selectedIds = selectedCardIds(slots);
  const filledCount = filledSlotCount(slots);
  const complete = isLoadoutComplete(slots);
  const cardById = new Map(collection.map((card) => [card.defenderId, card] as const));
  return (
    <main class="screen loadout-screen" data-testid="loadout-screen">
      <div class="screen__inner">
        <header class="screen__header">
          <p class="screen__eyebrow">
            World {level.world} - Level {level.number} - {level.name}
          </p>
          <h1 class="screen__title">Loadout</h1>
        </header>
        <div class="screen__body loadout-layout">
          <section class="loadout-collection" aria-label="Your collection">
            <h2 class="screen__section-title">Collection</h2>
            <div class="collection-grid">
              {collection.map((card) => (
                <DefenderCard
                  key={card.defenderId}
                  card={card}
                  selected={selectedIds.has(card.defenderId)}
                  disabled={fixed}
                  onSelect={() => onAddCard(card)}
                />
              ))}
            </div>
          </section>
          <section class="loadout-slots-panel" aria-label="Loadout slots">
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
          </section>
        </div>
        <footer class="screen__actions">
          <Button variant="secondary" onClick={onBack} testId="loadout-back">
            Back
          </Button>
          <div class="screen__actions-group">
            {fixed ? null : (
              <Button variant="secondary" onClick={onRecommended} testId="loadout-recommended">
                Recommended
              </Button>
            )}
            <Button variant="primary" onClick={onFight} disabled={!complete} testId="loadout-fight">
              Fight!
            </Button>
          </div>
        </footer>
      </div>
    </main>
  );
}
