import type { LevelDef } from '../../data/schemas';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { LoadoutCollection } from './LoadoutCollection';
import { LoadoutSlotsPanel } from './LoadoutSlotsPanel';
import {
  filledSlotCount,
  hasFixedLoadout,
  isLoadoutComplete,
  type LoadoutSlots,
} from './loadoutState';
import type { CollectionCardView } from './types';

/** Props of the Loadout screen (spec 3.12 rule 2, 11.8, issue #113 portrait). */
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

/**
 * Portrait Loadout screen: the collection grid on top, the level's slots below and
 * the Recommended / Fight! actions in thumb reach. Tutorial levels 1-4 have a
 * fixed pre-chosen loadout and a disabled collection (spec 3.12, 7.2). The 6-slot
 * limit is the M2 rule; save-data persistence is the M4 seam.
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
  const filledCount = filledSlotCount(slots);
  const complete = isLoadoutComplete(slots);
  return (
    <main class="screen loadout-screen" data-testid="loadout-screen">
      <div class="screen__inner">
        <ScreenHeader
          eyebrow={`World ${level.world} - Level ${level.number} - ${level.name}`}
          title="Loadout"
          badge={`${filledCount} / ${slots.length}`}
          onBack={onBack}
          backTestId="loadout-back"
        />
        <div class="screen__body loadout-layout">
          <LoadoutCollection
            collection={collection}
            selectedIds={selectedCardIds(slots)}
            fixed={fixed}
            onSelect={onAddCard}
          />
          <LoadoutSlotsPanel
            slots={slots}
            collection={collection}
            filledCount={filledCount}
            fixed={fixed}
            onRemoveCard={onRemoveCard}
          />
        </div>
        <footer class="screen__actions screen__actions--pinned">
          {fixed ? null : (
            <Button variant="secondary" onClick={onRecommended} testId="loadout-recommended">
              Recommended
            </Button>
          )}
          <Button variant="primary" onClick={onFight} disabled={!complete} testId="loadout-fight">
            Fight!
          </Button>
        </footer>
      </div>
    </main>
  );
}
