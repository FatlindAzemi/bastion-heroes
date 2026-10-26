import { useState } from 'preact/hooks';

import type { LevelDef } from '../../data/schemas';
import { LoadoutScreen } from './LoadoutScreen';
import { ScoutingScreen } from './ScoutingScreen';
import {
  addCardToLoadout,
  chosenLoadout,
  initialLoadout,
  removeCardFromLoadout,
  replaceLoadout,
  type LoadoutSlots,
} from './loadoutState';
import { recommendLoadout } from './recommendedLoadout';
import { armorTypesForLevel } from './scouting';
import type { CollectionCardView, LoadoutChoice } from './types';

/** Props of the shared Scouting -> Loadout screen flow (spec 11.8, issue #113). */
export interface ScoutLoadoutFlowProps {
  readonly level: LevelDef;
  /** The cards the save owns, at their saved levels (spec 3.12 rule 2, 8.7). */
  readonly collection: readonly CollectionCardView[];
  /** The saved loadout ids of this level, used to pre-fill free slots (spec 3.12 rule 4). */
  readonly savedLoadoutIds?: readonly string[];
  /** Persists the chosen ids after every change, so leaving the screen does not lose them. */
  readonly onLoadoutChange?: (defenderIds: readonly string[]) => void;
  /** "Fight!" hands the chosen 6 cards to the level start. */
  readonly onFight: (loadout: readonly LoadoutChoice[]) => void;
  /** Back from Scouting; hidden in the temporary `?scout=1` debug flow. */
  readonly onBackToLevels?: () => void;
}

/**
 * Scouting -> Loadout screen state machine of spec 11.8. Back from Loadout keeps
 * the chosen slots, "Fight!" hands them to the level start, and every M4 change is
 * persisted per level through `onLoadoutChange`. Both the debug `?scout=1` flow
 * (full roster) and the playable shell (owned cards) reuse it.
 */
export function ScoutLoadoutFlow({
  level,
  collection,
  savedLoadoutIds,
  onLoadoutChange,
  onFight,
  onBackToLevels,
}: ScoutLoadoutFlowProps) {
  const [screen, setScreen] = useState<'scouting' | 'loadout'>('scouting');
  const [slots, setSlots] = useState<LoadoutSlots>(() =>
    initialLoadout(level, { collection, savedIds: savedLoadoutIds }),
  );

  /** Applies a slot change and writes the ids into the M4 save. */
  const updateSlots = (next: LoadoutSlots): void => {
    setSlots(next);
    if (level.fixedLoadout === null) {
      onLoadoutChange?.(next.flatMap((slot) => (slot === null ? [] : [slot.defenderId])));
    }
  };

  const addCard = (card: CollectionCardView): void => {
    updateSlots(addCardToLoadout(slots, card));
  };
  const removeCard = (slotIndex: number): void => {
    updateSlots(removeCardFromLoadout(slots, slotIndex));
  };
  const applyRecommended = (): void => {
    const enemyArmors = armorTypesForLevel(level);
    updateSlots(
      replaceLoadout(level, recommendLoadout(collection, enemyArmors, level.loadoutSlots)),
    );
  };

  if (screen === 'scouting') {
    return (
      <ScoutingScreen
        level={level}
        onContinue={() => setScreen('loadout')}
        onBack={onBackToLevels}
      />
    );
  }
  return (
    <LoadoutScreen
      level={level}
      collection={collection}
      slots={slots}
      onAddCard={addCard}
      onRemoveCard={removeCard}
      onRecommended={applyRecommended}
      onFight={() => onFight(chosenLoadout(slots))}
      onBack={() => setScreen('scouting')}
    />
  );
}
