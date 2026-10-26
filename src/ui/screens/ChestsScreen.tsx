import { useEffect, useRef, useState } from 'preact/hooks';

import { defenderById } from '../../data';
import { chestDefinitions, type ChestDef, type ChestId, type Rarity } from '../../data/economy';
import { type ChestOpenResult, type ChestPurchaseResult, type SaveData } from '../../meta';
import { playSfx } from '../../platform/audio';
import { Button } from '../components/Button';
import { CardPortrait } from '../components/CardPortrait';
import { CurrencyPill } from '../components/CurrencyPill';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { formatAmount } from './format';

/** Props of the M4 chest inventory (spec 8.4). */
export interface ChestsScreenProps {
  readonly save: SaveData;
  /** Returns to the screen the chests were opened from. */
  readonly onBack: () => void;
  /** Consumes one chest and returns its flip result, or null when none is left. */
  readonly onOpen: (chestId: ChestId) => ChestOpenResult | null;
  /** Buys a gem chest (Magic/Legendary) and returns the transaction result. */
  readonly onBuy: (chestId: ChestId) => ChestPurchaseResult;
}

/** Rarity order of the odds table on screen (Common first, like spec 8.4). */
const ODDS_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Card-flip sound per rarity (spec 9.9). */
const FLIP_SFX: Readonly<
  Record<
    Rarity,
    | 'card_flip_common'
    | 'card_flip_rare'
    | 'card_flip_epic'
    | 'card_flip_legendary'
    | 'card_flip_mythic'
  >
> = {
  common: 'card_flip_common',
  rare: 'card_flip_rare',
  epic: 'card_flip_epic',
  legendary: 'card_flip_legendary',
  mythic: 'card_flip_mythic',
};

/** Phase of the opening animation: shaking chest, then the card flips. */
type OpeningPhase = 'shake' | 'reveal';

/** The live opening animation. */
interface OpeningState {
  readonly result: ChestOpenResult;
  readonly phase: OpeningPhase;
  readonly revealed: number;
}

/** Percentage label of one odds value, e.g. 4.5%. */
function oddsLabel(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`;
}

/** One-line source note of a chest. */
function chestSource(definition: ChestDef): string {
  return definition.gemPrice === undefined ? 'Campaign reward' : 'Gem chest';
}

/**
 * M4 chest screen (spec 8.4): the inventory of the five chest types with Open and
 * gem-purchase actions, the visible odds panel on every chest, the Legendary pity
 * meter and the animated opening (shake, burst, one rarity-glowing card flip at a
 * time, then Collect). The shell applies the transaction before the animation plays.
 */
export function ChestsScreen({ save, onBack, onOpen, onBuy }: ChestsScreenProps) {
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const [oddsFor, setOddsFor] = useState<ChestId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = (): void => {
    for (const timer of timers.current) {
      window.clearTimeout(timer);
    }
    timers.current = [];
  };

  useEffect((): (() => void) => clearTimers, []);

  const open = (chestId: ChestId): void => {
    if (opening !== null) {
      return;
    }
    const result = onOpen(chestId);
    if (result === null) {
      setMessage('No chest of that type left. Win levels or buy one with gems.');
      return;
    }
    setMessage(null);
    playSfx('chest_shake');
    setOpening({ result, phase: 'shake', revealed: 0 });
    timers.current.push(
      window.setTimeout(() => {
        playSfx('chest_open');
        setOpening({ result, phase: 'reveal', revealed: 0 });
        result.stacks.forEach((stack, index) => {
          timers.current.push(
            window.setTimeout(
              () => {
                playSfx(FLIP_SFX[stack.rarity]);
                setOpening({ result, phase: 'reveal', revealed: index + 1 });
              },
              380 * (index + 1),
            ),
          );
        });
      }, 700),
    );
  };

  const buy = (chestId: ChestId): void => {
    const result = onBuy(chestId);
    if (result === 'ok') {
      playSfx('upgrade');
      setMessage('Chest added to your inventory. Open it whenever you like.');
    } else if (result === 'notEnoughGems') {
      setMessage('Not enough gems yet. Earn gems from stars and daily quests.');
    } else {
      setMessage('That chest is not for sale.');
    }
  };

  const finishOpening = (): void => {
    clearTimers();
    setOpening(null);
  };

  const pity = Math.min(save.pity.sinceLegendary, 40);
  const oddsDefinition =
    oddsFor === null ? null : (chestDefinitions.find((def) => def.id === oddsFor) ?? null);
  return (
    <main class="screen chests-screen" data-testid="chests-screen">
      <div class="screen__inner">
        <ScreenHeader
          eyebrow="Spoils of the Glowfields"
          title="Chests"
          onBack={onBack}
          backTestId="chests-back"
        />
        <div class="screen__wallet">
          <CurrencyPill kind="gold" value={save.gold} testId="chests-gold" />
          <CurrencyPill kind="gems" value={save.gems} testId="chests-gems" />
          <span class="chests-screen__pity" data-testid="chest-pity">
            Pity {pity}/40
          </span>
        </div>
        {message === null ? null : (
          <p class="meta-toast" data-testid="chests-message">
            {message}
          </p>
        )}
        <div class="screen__body chests-body">
          <ul class="chest-list">
            {chestDefinitions.map((definition) => (
              <ChestRow
                key={definition.id}
                definition={definition}
                count={save.chests[definition.id] ?? 0}
                gems={save.gems}
                disabled={opening !== null}
                onOpen={open}
                onBuy={buy}
                onOdds={(chestId): void => setOddsFor(chestId)}
              />
            ))}
          </ul>
        </div>
      </div>
      {opening === null ? null : <ChestOpening state={opening} onCollect={finishOpening} />}
      {oddsDefinition === null ? null : (
        <ChestOdds definition={oddsDefinition} onClose={(): void => setOddsFor(null)} />
      )}
    </main>
  );
}

/** One inventory row with count, source, Open and gem Buy actions plus the odds button. */
function ChestRow({
  definition,
  count,
  gems,
  disabled,
  onOpen,
  onBuy,
  onOdds,
}: {
  readonly definition: ChestDef;
  readonly count: number;
  readonly gems: number;
  readonly disabled: boolean;
  readonly onOpen: (chestId: ChestId) => void;
  readonly onBuy: (chestId: ChestId) => void;
  readonly onOdds: (chestId: ChestId) => void;
}) {
  const price = definition.gemPrice;
  const affordable = price !== undefined && gems >= price;
  return (
    <li class="chest-row" data-testid={`chest-row-${definition.id}`} data-count={count}>
      <span class="chest-row__icon-wrap" aria-hidden="true">
        <Icon name="chest" class="chest-row__icon" />
        {count > 0 ? <span class="chest-row__count">{count}</span> : null}
      </span>
      <span class="chest-row__text">
        <span class="chest-row__name">{definition.name}</span>
        <span class="chest-row__source">
          {count > 0 ? `${count} ready to open` : chestSource(definition)}
        </span>
      </span>
      <span class="chest-row__actions">
        <button
          type="button"
          class="chest-row__info"
          aria-label={`${definition.name} drop odds`}
          data-testid={`chest-info-${definition.id}`}
          onClick={(): void => onOdds(definition.id)}
        >
          i
        </button>
        {count > 0 ? (
          <Button
            variant="primary"
            onClick={(): void => onOpen(definition.id)}
            disabled={disabled}
            testId={`chest-open-${definition.id}`}
          >
            Open
          </Button>
        ) : null}
        {price === undefined ? null : (
          <Button
            variant="buy"
            onClick={(): void => onBuy(definition.id)}
            disabled={!affordable || disabled}
            testId={`chest-buy-${definition.id}`}
          >
            <Icon name="gem" class="chest-row__gem-icon" />
            {formatAmount(price)}
          </Button>
        )}
      </span>
    </li>
  );
}

/** The shake -> flip overlay with one card per stack. */
function ChestOpening({
  state,
  onCollect,
}: {
  readonly state: OpeningState;
  readonly onCollect: () => void;
}) {
  const { result, phase, revealed } = state;
  const complete = phase === 'reveal' && revealed >= result.stacks.length;
  return (
    <div
      class="chest-overlay"
      data-testid="chest-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Opening ${result.name}`}
    >
      <div class="chest-overlay__panel glass-panel">
        <p class="chest-overlay__title">{result.name}</p>
        <div
          class={`chest-overlay__chest${phase === 'shake' ? ' chest-overlay__chest--shake' : ''}`}
        >
          <Icon name="chest" class="chest-overlay__chest-icon" />
        </div>
        {phase === 'shake' ? (
          <p class="chest-overlay__wait">Shaking...</p>
        ) : (
          <>
            <p class="chest-overlay__gold" data-testid="chest-gold">
              +{formatAmount(result.gold)} gold
            </p>
            <div class="chest-stacks" data-testid="chest-stacks">
              {result.stacks.map((stack, index) => {
                const defender = defenderById[stack.cardId];
                const shown = index < revealed;
                return (
                  <div
                    key={`${stack.cardId}-${index}`}
                    class={`chest-stack chest-stack--${stack.rarity}${shown ? ' chest-stack--shown' : ''}`}
                    data-rarity={stack.rarity}
                    data-testid="chest-stack"
                  >
                    {shown ? (
                      <>
                        <CardPortrait
                          defenderId={stack.cardId}
                          faction={defender?.faction ?? 'hollow'}
                          rarity={stack.rarity}
                          class="chest-stack__portrait"
                        />
                        <span class="chest-stack__name">{defender?.name ?? stack.cardId}</span>
                        <span class="chest-stack__shards">
                          <Icon name="essence" class="chest-stack__shard-icon" />+{stack.shards}
                        </span>
                        {stack.isNew ? <span class="chest-stack__new">NEW</span> : null}
                      </>
                    ) : (
                      <span class="chest-stack__back" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {complete ? (
          <Button variant="primary" onClick={onCollect} testId="chest-collect">
            Collect
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The required odds table of spec 8.4 rule 7. */
function ChestOdds({
  definition,
  onClose,
}: {
  readonly definition: ChestDef;
  readonly onClose: () => void;
}) {
  return (
    <div
      class="chest-odds-overlay"
      data-testid="chest-odds"
      role="dialog"
      aria-modal="true"
      aria-label={`${definition.name} odds`}
      onClick={onClose}
    >
      <div class="chest-odds glass-panel" onClick={(event): void => event.stopPropagation()}>
        <button
          type="button"
          class="chest-odds__close"
          aria-label="Close chest odds"
          data-testid="chest-odds-close"
          onClick={onClose}
        >
          <Icon name="close" class="chest-odds__close-icon" />
        </button>
        <p class="chest-odds__eyebrow">Drop odds</p>
        <h2 class="chest-odds__title">{definition.name}</h2>
        <div class="chest-odds__facts">
          <span>{formatAmount(definition.gold)} gold</span>
          <span>
            {definition.stacks[0]}–{definition.stacks[1]} cards
          </span>
          <span>{definition.shardBudget} shard budget</span>
        </div>
        <ul class="chest-odds__list">
          {ODDS_ORDER.map((rarity) => (
            <li class="chest-odds__row" key={rarity} data-rarity={rarity}>
              <span class={`chest-odds__rarity chest-odds__rarity--${rarity}`}>{rarity}</span>
              <span class="chest-odds__bar">
                <span
                  class="chest-odds__fill"
                  style={{ width: `${Math.min(100, definition.odds[rarity] * 100)}%` }}
                />
              </span>
              <span class="chest-odds__value">{oddsLabel(definition.odds[rarity])}</span>
            </li>
          ))}
        </ul>
        <p class="chest-odds__note">
          A Legendary or Mythic card resets the pity meter. At 40 silver-or-better chests the next
          stack is a guaranteed Legendary.
        </p>
      </div>
    </div>
  );
}
