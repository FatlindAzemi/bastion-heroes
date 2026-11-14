import { duelCardView } from './duelCards';
import { DuelCard } from './DuelCard';
import { NextCard } from './NextCard';
import type { DuelInteraction } from './useDuelInteraction';

/** Props of the hand row: the "next" card and the 4 hand cards (spec 18.9). */
export interface DuelHandProps {
  readonly hand: readonly string[];
  readonly next: string;
  readonly essence: number;
  readonly interaction: DuelInteraction;
}

/** The "next" card on the left and the 4 playable cards in their slots (spec 18.4, 18.9). */
export function DuelHand({ hand, next, essence, interaction }: DuelHandProps) {
  const nextCard = duelCardView(next);
  const rejection = interaction.rejection;
  return (
    <div class="duel-hand">
      {nextCard === null ? null : <NextCard card={nextCard} />}
      <div class="duel-hand__cards">
        {hand.map((cardId, slot) => {
          const card = duelCardView(cardId);
          if (card === null) {
            return null;
          }
          const shaking = rejection !== null && rejection.slot === slot;
          return (
            <DuelCard
              key={`${slot}-${cardId}-${shaking ? rejection.nonce : 'idle'}`}
              card={card}
              held={interaction.heldSlot === slot}
              affordable={card.cost <= essence}
              shaking={shaking}
              onPointerDown={(event): void => interaction.onCardPointerDown(slot, event)}
              onPointerMove={interaction.onCardPointerMove}
              onPointerUp={interaction.onCardPointerUp}
              onKeyboardSelect={(): void => interaction.onCardKeyboardSelect(slot)}
            />
          );
        })}
      </div>
    </div>
  );
}
