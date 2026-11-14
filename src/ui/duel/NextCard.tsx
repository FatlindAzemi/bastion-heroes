import { CardPortrait } from '../components/CardPortrait';
import { rarityColor } from '../hud/factionStyles';
import type { DuelCardView } from './duelCards';

/** Props of the "next" card left of the hand (spec 18.4, 18.9). */
export interface NextCardProps {
  readonly card: DuelCardView;
}

/** The small "next" card at 60 % size; it is information only, not a button (spec 18.9). */
export function NextCard({ card }: NextCardProps) {
  return (
    <div class="duel-next" data-testid="duel-next" data-card-id={card.cardId}>
      <span class="duel-next__label">Next</span>
      <span class="duel-next__card" style={{ borderColor: rarityColor(card.rarity) }}>
        <CardPortrait
          defenderId={card.cardId}
          faction={card.faction}
          rarity={card.rarity}
          class="duel-next__portrait"
        />
        <span class="duel-next__cost">{card.cost}</span>
      </span>
    </div>
  );
}
