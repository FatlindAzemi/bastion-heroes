import { DefenderCard } from '../components/DefenderCard';
import type { CollectionCardView } from './types';

/** Props of the collection grid of the Loadout screen (spec 3.12 rule 2). */
export interface LoadoutCollectionProps {
  readonly collection: readonly CollectionCardView[];
  readonly selectedIds: ReadonlySet<string>;
  /** True for the fixed tutorial levels, whose collection is not editable. */
  readonly fixed: boolean;
  readonly onSelect: (card: CollectionCardView) => void;
}

/** Collection panel: every owned card as a rarity-framed arcade card (spec 9.8). */
export function LoadoutCollection({
  collection,
  selectedIds,
  fixed,
  onSelect,
}: LoadoutCollectionProps) {
  return (
    <section class="loadout-collection" aria-label="Your collection">
      <header class="loadout-collection__header">
        <h2 class="screen__section-title">Collection</h2>
        <span class="loadout-collection__count">{collection.length} cards</span>
      </header>
      <div class="collection-grid">
        {collection.map((card) => (
          <DefenderCard
            key={card.defenderId}
            card={card}
            selected={selectedIds.has(card.defenderId)}
            disabled={fixed}
            onSelect={() => onSelect(card)}
          />
        ))}
      </div>
    </section>
  );
}
