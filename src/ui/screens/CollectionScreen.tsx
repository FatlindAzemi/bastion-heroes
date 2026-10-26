import { useState } from 'preact/hooks';

import { defenderById } from '../../data';
import { MAX_CARD_LEVEL } from '../../data/economy';
import type { DefenderDef } from '../../data/schemas';
import { ownedCardCount, type SaveData, type UpgradeResult } from '../../meta';
import { playSfx } from '../../platform/audio';
import { Button } from '../components/Button';
import { CardPortrait } from '../components/CardPortrait';
import { CurrencyPill } from '../components/CurrencyPill';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { rarityColor } from '../hud/factionStyles';
import { createCollectionEntries, type CollectionEntry } from './collection';

/** Props of the M4 Collection screen (spec 8.6). */
export interface CollectionScreenProps {
  readonly save: SaveData;
  /** Returns to the screen the collection was opened from. */
  readonly onBack: () => void;
  /** Spends shards and gold; the shell persists the returned save. */
  readonly onUpgrade: (defenderId: string) => UpgradeResult;
}

/** Readable names of the roles (spec 5.1). */
const ROLE_LABELS: Readonly<Record<string, string>> = {
  producer: 'Producer',
  shooter: 'Shooter',
  wall: 'Wall',
  control: 'Control',
  support: 'Support',
  trap: 'Trap',
};

/** Readable names of the damage types (spec 4.1). */
const DAMAGE_LABELS: Readonly<Record<string, string>> = {
  pierce: 'Pierce',
  blast: 'Blast',
  arcane: 'Arcane',
};

/** Readable names of the elements (spec 4.6). */
const ELEMENT_LABELS: Readonly<Record<string, string>> = {
  fire: 'Fire',
  frost: 'Frost',
  storm: 'Storm',
  poison: 'Poison',
  none: 'None',
};

/** Human labels of the ★3 bonuses (spec 5.2). */
const STAR3_LABELS: Readonly<Record<string, string>> = {
  splash_radius_up: 'Larger splash radius',
  range_up: 'Longer attack range',
  producer_orb_value_up: 'Richer Essence orbs',
  reflect_melee: 'Reflects part of melee damage',
  fire_patch: 'Leaves a burning fire patch',
  piercing_arrow: 'Arrows pierce through targets',
  slow_duration_up: 'Longer Slow duration',
  double_bolt: 'Fires a second bolt',
};

/** Short role flavour for the card detail (the data registry has no prose field). */
const ROLE_BLURBS: Readonly<Record<string, string>> = {
  producer: 'Keeps the Essence flowing so the lane never runs dry.',
  shooter: 'Turns Essence into steady damage from the back line.',
  wall: 'Holds a lane by soaking everything the Gloom throws at it.',
  control: 'Bends the battlefield with slows, freezes and area control.',
  support: 'Lifts the defenders around it with auras and utility.',
  trap: 'Waits in ambush and punishes enemies that step on it.',
};

/** Formats one stat value with a dash for cards that do not use it. */
function statValue(value: number | undefined, suffix = ''): string {
  return value === undefined || value === 0 ? '—' : `${value}${suffix}`;
}

/** Human label of a ★3 bonus, including the numeric parameter when one exists. */
function star3BonusLabel(defender: DefenderDef): string {
  const label = STAR3_LABELS[defender.star3Bonus] ?? defender.star3Bonus.replace(/_/g, ' ');
  const params = Object.values(defender.star3Params ?? {});
  if (params.length === 0) {
    return label;
  }
  return `${label} (${params.map((value) => String(value)).join(', ')})`;
}

/** Message shown after an upgrade attempt. */
function upgradeMessage(result: UpgradeResult, newLevel: number): string {
  switch (result) {
    case 'ok':
      return `Upgraded to level ${newLevel}!`;
    case 'maxed':
      return 'This card is already at max level.';
    case 'notEnoughShards':
      return 'Not enough shards yet. Open chests to find duplicates.';
    case 'notEnoughGold':
      return 'Not enough gold for this upgrade.';
    case 'locked':
      return 'Win the card first before upgrading it.';
  }
}

/**
 * M4 Collection screen (spec 8.6): all cards sorted owned first, rarity and Essence
 * cost, four per row on phones. Locked cards show the dark silhouette; owned cards
 * show their level, shard progress and a green arrow when an upgrade is affordable.
 * Tapping a card opens the detail sheet with its stats, ★3 bonus and Upgrade button.
 */
export function CollectionScreen({ save, onBack, onUpgrade }: CollectionScreenProps) {
  const entries = createCollectionEntries(save);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [glow, setGlow] = useState(false);
  const selected = entries.find((entry) => entry.card.defenderId === selectedId) ?? null;
  const owned = ownedCardCount(save);

  const openCard = (entry: CollectionEntry): void => {
    playSfx('card_select');
    setMessage(null);
    setGlow(false);
    setSelectedId(entry.card.defenderId);
  };

  const closeDetail = (): void => {
    setSelectedId(null);
    setMessage(null);
    setGlow(false);
  };

  const upgrade = (): void => {
    if (selected === null) {
      return;
    }
    const result = onUpgrade(selected.card.defenderId);
    const nextLevel = Math.min(MAX_CARD_LEVEL, selected.card.cardLevel + 1);
    setMessage(upgradeMessage(result, nextLevel));
    if (result === 'ok') {
      playSfx('upgrade');
      setGlow(true);
      window.setTimeout(() => setGlow(false), 700);
    }
  };

  return (
    <main class="screen collection-screen" data-testid="collection-screen">
      <div class="screen__inner">
        <ScreenHeader
          eyebrow="Your roster"
          title="Collection"
          badge={`${owned} / ${entries.length}`}
          onBack={onBack}
          backTestId="collection-back"
        />
        <div class="screen__wallet">
          <CurrencyPill kind="gold" value={save.gold} testId="collection-gold" />
          <CurrencyPill kind="gems" value={save.gems} testId="collection-gems" />
          <span class="collection-screen__hint">Tap a card for stats</span>
        </div>
        <div class="screen__body collection-body">
          <div class="collection-grid collection-grid--full" data-testid="collection-grid">
            {entries.map((entry) => (
              <CollectionTile key={entry.card.defenderId} entry={entry} onOpen={openCard} />
            ))}
          </div>
        </div>
      </div>
      {selected === null ? null : (
        <CardDetail
          entry={selected}
          glow={glow}
          message={message}
          canAfford={save.gold >= (selected.goldCost ?? 0)}
          onUpgrade={upgrade}
          onClose={closeDetail}
        />
      )}
    </main>
  );
}

/** One grid tile: portrait or dark silhouette, rarity frame, level and shards. */
function CollectionTile({
  entry,
  onOpen,
}: {
  readonly entry: CollectionEntry;
  readonly onOpen: (entry: CollectionEntry) => void;
}) {
  const { card, owned, shards, shardsNeeded, maxed, canUpgrade } = entry;
  const progress = shardsNeeded > 0 ? Math.min(100, (shards / shardsNeeded) * 100) : 100;
  return (
    <button
      type="button"
      class={`collection-tile${owned ? '' : ' collection-tile--locked'}${canUpgrade ? ' collection-tile--upgradable' : ''}`}
      style={{ borderColor: rarityColor(card.rarity) }}
      data-testid="collection-entry"
      data-defender-id={card.defenderId}
      data-owned={owned}
      data-can-upgrade={canUpgrade}
      aria-label={
        owned
          ? `${card.name}, level ${card.cardLevel}, ${shards} of ${shardsNeeded} shards`
          : `${card.name}, locked`
      }
      onClick={(): void => onOpen(entry)}
    >
      {owned ? (
        <CardPortrait
          defenderId={card.defenderId}
          faction={card.faction}
          rarity={card.rarity}
          class="collection-tile__portrait"
        />
      ) : (
        <span class="collection-tile__silhouette" aria-hidden="true">
          <span class="collection-tile__question">?</span>
        </span>
      )}
      <span class="collection-tile__rarity" aria-hidden="true">
        {card.rarity}
      </span>
      <span class="collection-tile__name">{card.name}</span>
      {owned ? (
        <>
          <span class="collection-tile__level" aria-hidden="true">
            Lv {card.cardLevel}
          </span>
          <span class="collection-tile__shards" aria-hidden="true">
            {maxed ? (
              <span class="collection-tile__maxed">MAX</span>
            ) : (
              <>
                <span class="collection-tile__bar">
                  <span
                    class="collection-tile__fill"
                    style={{ width: `${progress.toFixed(0)}%` }}
                  />
                </span>
                <span class="collection-tile__count">
                  {shards}/{shardsNeeded}
                </span>
              </>
            )}
          </span>
          {canUpgrade ? (
            <span class="collection-tile__arrow" aria-hidden="true">
              <Icon name="plus" class="collection-tile__arrow-icon" />
            </span>
          ) : null}
        </>
      ) : (
        <span class="collection-tile__locked-label" aria-hidden="true">
          Locked
        </span>
      )}
    </button>
  );
}

/** One of the card detail stat entries. */
interface StatRow {
  readonly label: string;
  readonly value: string;
}

/** The stat list of spec 8.6 in a compact two-column grid. */
function statRows(defender: DefenderDef): readonly StatRow[] {
  return [
    { label: 'Cost', value: `${defender.cost} Essence` },
    { label: 'Health', value: String(defender.hp) },
    { label: 'Damage', value: statValue(defender.damage) },
    { label: 'Interval', value: statValue(defender.attackIntervalS, 's') },
    { label: 'Range', value: statValue(defender.range, ' tiles') },
    {
      label: 'Damage type',
      value:
        defender.damageType === undefined
          ? 'None'
          : (DAMAGE_LABELS[defender.damageType] ?? defender.damageType),
    },
    { label: 'Element', value: ELEMENT_LABELS[defender.element] ?? defender.element },
    { label: 'Cooldown', value: `${defender.cooldownS}s` },
  ];
}

/** Detail sheet with the large portrait, stats, ★3 bonus and the Upgrade action. */
function CardDetail({
  entry,
  glow,
  message,
  canAfford,
  onUpgrade,
  onClose,
}: {
  readonly entry: CollectionEntry;
  readonly glow: boolean;
  readonly message: string | null;
  readonly canAfford: boolean;
  readonly onUpgrade: () => void;
  readonly onClose: () => void;
}) {
  const { card, owned, shards, shardsNeeded, maxed, canUpgrade } = entry;
  const defender = defenderById[card.defenderId];
  const upgradeEnabled = owned && canUpgrade && canAfford;
  return (
    <div
      class="collection-detail-overlay"
      data-testid="collection-detail"
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} details`}
      onClick={onClose}
    >
      <div class="collection-detail glass-panel" onClick={(event): void => event.stopPropagation()}>
        <button
          type="button"
          class="collection-detail__close"
          aria-label="Close card details"
          data-testid="collection-close"
          onClick={onClose}
        >
          <Icon name="close" class="collection-detail__close-icon" />
        </button>
        <div class={`collection-detail__hero${glow ? ' collection-detail__hero--glow' : ''}`}>
          {owned ? (
            <CardPortrait
              defenderId={card.defenderId}
              faction={card.faction}
              rarity={card.rarity}
              class="collection-detail__portrait"
            />
          ) : (
            <span class="collection-detail__silhouette" aria-hidden="true">
              ?
            </span>
          )}
        </div>
        <div class="collection-detail__head">
          <span class="collection-detail__rarity" style={{ color: rarityColor(card.rarity) }}>
            {card.rarity}
          </span>
          <h2 class="collection-detail__name">{card.name}</h2>
          <span class="collection-detail__meta">
            {ROLE_LABELS[card.role] ?? card.role} · {card.faction}
            {owned ? ` · Lv ${card.cardLevel}` : ' · Locked'}
          </span>
        </div>
        <p class="collection-detail__blurb">
          {defender === undefined
            ? 'A defender of the Bastion.'
            : (ROLE_BLURBS[defender.role] ?? 'A defender of the Bastion.')}
        </p>
        <div class="collection-detail__stats">
          {(defender === undefined ? [] : statRows(defender)).map((row) => (
            <div class="collection-detail__stat" key={row.label}>
              <span class="collection-detail__stat-label">{row.label}</span>
              <span class="collection-detail__stat-value">{row.value}</span>
            </div>
          ))}
        </div>
        {defender === undefined ? null : (
          <div class="collection-detail__bonus">
            <span class="collection-detail__bonus-tag">★3</span>
            <span>{star3BonusLabel(defender)}</span>
          </div>
        )}
        {owned ? (
          <div class="collection-detail__upgrade">
            <div class="collection-detail__upgrade-info">
              {maxed ? (
                <span class="collection-detail__maxed">Max level reached</span>
              ) : (
                <>
                  <span class="collection-detail__shards">
                    <Icon name="essence" class="collection-detail__shard-icon" />
                    {shards} / {shardsNeeded} shards
                  </span>
                  <span class="collection-detail__cost">
                    {entry.goldCost} gold · next level {card.cardLevel + 1}
                  </span>
                </>
              )}
            </div>
            <Button
              variant="buy"
              onClick={onUpgrade}
              disabled={!upgradeEnabled}
              testId="collection-upgrade"
            >
              {maxed ? 'Maxed' : 'Upgrade'}
            </Button>
          </div>
        ) : (
          <p class="collection-detail__locked-note">
            Win this card from a level or find it in a chest.
          </p>
        )}
        {message === null ? null : (
          <p class="collection-detail__message" data-testid="collection-message">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
