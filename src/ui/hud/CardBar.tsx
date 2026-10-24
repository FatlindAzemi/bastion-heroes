import { Card } from '../components/Card';
import type { HudCardView } from './types';
import { ShovelButton } from './ShovelButton';

/** Props of the card bar: the loadout cards plus the shovel at their end (spec 9.8, 3.7). */
export interface CardBarProps {
  readonly cards: readonly HudCardView[];
  readonly selectedIndex: number | null;
  readonly shakeCardIndex: number | null;
  readonly shovelActive: boolean;
  readonly shovelShaking: boolean;
  readonly onSelectCard: (index: number) => void;
  readonly onToggleShovel: () => void;
}

/** The in-level card bar with the loadout cards and the shovel button (spec 9.8). */
export function CardBar({
  cards,
  selectedIndex,
  shakeCardIndex,
  shovelActive,
  shovelShaking,
  onSelectCard,
  onToggleShovel,
}: CardBarProps) {
  return (
    <div class="hud-card-bar">
      {cards.map((card, index) => (
        <Card
          key={card.defenderId}
          card={card}
          selected={selectedIndex === index}
          shaking={shakeCardIndex === index}
          onSelect={() => onSelectCard(index)}
        />
      ))}
      <ShovelButton active={shovelActive} shaking={shovelShaking} onToggle={onToggleShovel} />
    </div>
  );
}
