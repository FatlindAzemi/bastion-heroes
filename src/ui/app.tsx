import { useState } from 'preact/hooks';

import { LoadoutScreen } from './screens/LoadoutScreen';
import { ScoutingScreen } from './screens/ScoutingScreen';
import { createM2Collection } from './screens/collection';
import {
  addCardToLoadout,
  chosenLoadout,
  initialLoadout,
  removeCardFromLoadout,
  replaceLoadout,
  type LoadoutSlots,
} from './screens/loadoutState';
import { recommendLoadout } from './screens/recommendedLoadout';
import { armorTypesForLevel } from './screens/scouting';
import type { CollectionCardView, ScoutFlowOptions } from './screens/types';

/**
 * M4 seam: there is no save data or collection yet (spec 8, 11.9), so the
 * Loadout screen shows the full M2 roster at card level 1 (spec 3.12).
 */
const M2_COLLECTION = createM2Collection();

/** The screens the temporary `?scout=1` entry can show (spec 11.8; M4 adds the rest). */
type ScoutScreen = 'scouting' | 'loadout';

/** Props of the root component; without a flow it renders the M0 boot screen. */
export interface AppProps {
  readonly flow?: ScoutFlowOptions;
}

/** Root UI component: the boot screen, or the Scouting -> Loadout screen flow (spec 11.8). */
export function App({ flow }: AppProps) {
  return flow === undefined ? <BootScreen /> : <ScoutFlow flow={flow} />;
}

/** The M0 boot screen with the game title over the 3D title scene. */
function BootScreen() {
  return (
    <main class="boot-screen">
      <div class="boot-screen__vignette" aria-hidden="true" />
      <header class="boot-screen__lockup">
        <h1 class="boot-screen__title">Bastion Heroes</h1>
      </header>
    </main>
  );
}

/**
 * The Scouting <-> Loadout screen state machine of spec 11.8. Back keeps the
 * chosen slots, "Fight!" hands them to the level start, and the loadout is not
 * persisted (M4 save seam, spec 3.12 rule 4).
 */
function ScoutFlow({ flow }: { readonly flow: ScoutFlowOptions }) {
  const [screen, setScreen] = useState<ScoutScreen>('scouting');
  const [slots, setSlots] = useState<LoadoutSlots>(() => initialLoadout(flow.level));

  const addCard = (card: CollectionCardView): void => {
    setSlots((currentSlots) => addCardToLoadout(currentSlots, card));
  };

  const removeCard = (slotIndex: number): void => {
    setSlots((currentSlots) => removeCardFromLoadout(currentSlots, slotIndex));
  };

  const applyRecommended = (): void => {
    const enemyArmors = armorTypesForLevel(flow.level);
    const recommended = recommendLoadout(M2_COLLECTION, enemyArmors, flow.level.loadoutSlots);
    setSlots(replaceLoadout(flow.level, recommended));
  };

  if (screen === 'scouting') {
    return <ScoutingScreen level={flow.level} onContinue={() => setScreen('loadout')} />;
  }
  return (
    <LoadoutScreen
      level={flow.level}
      collection={M2_COLLECTION}
      slots={slots}
      onAddCard={addCard}
      onRemoveCard={removeCard}
      onRecommended={applyRecommended}
      onFight={() => flow.onFight(chosenLoadout(slots))}
      onBack={() => setScreen('scouting')}
    />
  );
}
