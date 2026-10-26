import { useRef, useState } from 'preact/hooks';

import { levelById } from '../data';
import type { ChestId } from '../data/economy';
import type { LevelDef } from '../data/schemas';
import {
  applySettings,
  buyChest,
  ensureDailyQuests,
  levelLoadout,
  openChest,
  resetSave,
  sanitizeSettings,
  setLevelLoadout,
  todayKey,
  updateSettings,
  upgradeCard,
  type ChestOpenResult,
  type ChestPurchaseResult,
  type SaveData,
  type Settings,
  type UpgradeResult,
} from '../meta';
import { ChestsScreen } from './screens/ChestsScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { createM2Collection, createOwnedCollection } from './screens/collection';
import { DailyQuestsScreen } from './screens/DailyQuestsScreen';
import { LevelSelectScreen } from './screens/LevelSelectScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ScoutLoadoutFlow } from './screens/ScoutLoadoutFlow';
import { SettingsScreen } from './screens/SettingsScreen';
import { TitleScreen } from './screens/TitleScreen';
import type { ResultOptions, ShellOptions, ShellScreenName } from './screens/shellTypes';
import type { ScoutFlowOptions } from './screens/types';

/** Props of the root UI component; exactly one flow is mounted at a time. */
export interface AppProps {
  /** The temporary `?level=<id>&scout=1` debug entry (spec 11.8, issue #49). */
  readonly flow?: ScoutFlowOptions;
  /** The playable title -> level select -> scouting -> loadout shell (issue #113). */
  readonly shell?: ShellOptions;
  /** The Victory/Defeat overlay of a finished level run (issue #113). */
  readonly result?: ResultOptions;
}

/** Root UI component: result overlay, playable shell, debug scout flow or boot screen. */
export function App({ flow, shell, result }: AppProps) {
  if (result !== undefined) {
    return <ResultScreen {...result} />;
  }
  if (shell !== undefined) {
    return <ShellFlow options={shell} />;
  }
  if (flow !== undefined) {
    return (
      <ScoutLoadoutFlow
        level={flow.level}
        collection={createM2Collection()}
        onFight={flow.onFight}
      />
    );
  }
  return <BootScreen />;
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

/** The four M4 meta screens the shell can open from the title or level select. */
type MetaScreenName = 'collection' | 'chests' | 'settings' | 'quests';

/** Where a meta screen returns to when its back button is tapped. */
type MetaOrigin = 'title' | 'levels';

/** The screens of the playable shell (issue #113); level runs are owned by `src/main.ts`. */
type ShellView =
  | { readonly kind: 'title' }
  | { readonly kind: 'levels' }
  | { readonly kind: 'level'; readonly level: LevelDef }
  | { readonly kind: MetaScreenName; readonly from: MetaOrigin };

/** Maps the hosts' screen name to the first shell view. */
function initialView(options: ShellOptions): ShellView {
  if (options.initialLevelId !== undefined) {
    const level = levelById[options.initialLevelId];
    if (level !== undefined) {
      return { kind: 'level', level };
    }
  }
  const screen: ShellScreenName = options.initialScreen ?? 'title';
  if (screen === 'levels') {
    return { kind: 'levels' };
  }
  if (
    screen === 'collection' ||
    screen === 'chests' ||
    screen === 'settings' ||
    screen === 'quests'
  ) {
    return { kind: screen, from: 'title' };
  }
  return { kind: 'title' };
}

/**
 * Title -> Level Select -> Scouting -> Loadout -> Fight state machine of issue #113,
 * extended with the M4 meta loop: the Collection, Chests, Settings and Daily Quests
 * screens all edit the same save the host passed in and persist every transaction
 * through `onSave`. "Fight!" calls the host's `onFight`; the host disposes the shell
 * while the level runs and remounts it afterwards.
 */
function ShellFlow({ options }: { readonly options: ShellOptions }) {
  const [view, setView] = useState<ShellView>(() => initialView(options));
  const [save, setSave] = useState<SaveData>(options.save);
  // The state value can lag behind several rapid transactions (slider input, two taps);
  // the ref always holds the latest save so no transaction overwrites another.
  const saveRef = useRef<SaveData>(options.save);

  /** Applies one transaction to the shell state and the persistent save. */
  const commit = (next: SaveData): void => {
    saveRef.current = next;
    setSave(next);
    options.onSave(next);
  };

  const openLevel = (levelId: string): void => {
    const level = levelById[levelId];
    if (level !== undefined) {
      setView({ kind: 'level', level });
    }
  };

  const openMeta = (kind: MetaScreenName, from: MetaOrigin): void => {
    if (kind === 'quests') {
      const daily = ensureDailyQuests(saveRef.current.dailyQuests, todayKey());
      if (daily !== saveRef.current.dailyQuests) {
        commit({ ...saveRef.current, dailyQuests: daily });
      }
    }
    setView({ kind, from });
  };

  const upgrade = (defenderId: string): UpgradeResult => {
    const result = upgradeCard(saveRef.current, defenderId);
    if (result.result === 'ok') {
      commit(result.save);
    }
    return result.result;
  };

  const openChestTransaction = (chestId: ChestId): ChestOpenResult | null => {
    const opened = openChest(saveRef.current, chestId, Date.now());
    if (opened === null) {
      return null;
    }
    commit(opened.save);
    return opened.result;
  };

  const purchaseChest = (chestId: ChestId): ChestPurchaseResult => {
    const purchased = buyChest(saveRef.current, chestId);
    if (purchased.result === 'ok') {
      commit(purchased.save);
    }
    return purchased.result;
  };

  const changeSettings = (patch: Partial<Settings>): void => {
    const next = updateSettings(saveRef.current, sanitizeSettings(patch));
    applySettings(next);
    commit(next);
  };

  const resetProgress = (): void => {
    const fresh = resetSave();
    applySettings(fresh);
    commit(fresh);
    setView({ kind: 'title' });
  };

  if (view.kind === 'title') {
    return (
      <TitleScreen
        save={save}
        onPlay={(): void => setView({ kind: 'levels' })}
        onCollection={(): void => openMeta('collection', 'title')}
        onChests={(): void => openMeta('chests', 'title')}
        onQuests={(): void => openMeta('quests', 'title')}
        onSettings={(): void => openMeta('settings', 'title')}
      />
    );
  }
  if (view.kind === 'level') {
    const levelId = view.level.id;
    return (
      <ScoutLoadoutFlow
        level={view.level}
        collection={createOwnedCollection(save)}
        savedLoadoutIds={levelLoadout(save, levelId)}
        onLoadoutChange={(defenderIds): void => {
          commit(setLevelLoadout(saveRef.current, levelId, defenderIds));
        }}
        onBackToLevels={(): void => setView({ kind: 'levels' })}
        onFight={(loadout) => options.onFight(levelId, loadout)}
      />
    );
  }
  if (view.kind === 'collection') {
    return (
      <CollectionScreen
        save={save}
        onBack={(): void => setView({ kind: view.from })}
        onUpgrade={upgrade}
      />
    );
  }
  if (view.kind === 'chests') {
    return (
      <ChestsScreen
        save={save}
        onBack={(): void => setView({ kind: view.from })}
        onOpen={openChestTransaction}
        onBuy={purchaseChest}
      />
    );
  }
  if (view.kind === 'settings') {
    return (
      <SettingsScreen
        save={save}
        onBack={(): void => setView({ kind: view.from })}
        onSettings={changeSettings}
        onReset={resetProgress}
      />
    );
  }
  if (view.kind === 'quests') {
    return <DailyQuestsScreen save={save} onBack={(): void => setView({ kind: view.from })} />;
  }
  return (
    <LevelSelectScreen
      levels={options.levels}
      save={save}
      onSelect={openLevel}
      onQuests={(): void => openMeta('quests', 'levels')}
      onBack={(): void => setView({ kind: 'title' })}
    />
  );
}
