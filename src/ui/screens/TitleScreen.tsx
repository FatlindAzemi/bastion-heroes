import { useEffect, useRef, useState } from 'preact/hooks';

import {
  chestCount,
  clearedLevelCount,
  completedQuestCount,
  totalStars,
  type SaveData,
} from '../../meta';
import { playSfx } from '../../platform/audio';
import { Icon, type IconName } from '../components/Icon';
import { TrainingSheet } from '../duel/TrainingSheet';
import type { TrainingBotLevel } from '../duel/types';
import { TitleSparkles } from './TitleSparkles';

/** Props of the title screen of the playable shell (issue #113, M4). */
export interface TitleScreenProps {
  /** The save behind the progress line, quick-button badges and daily quest state. */
  readonly save: SaveData;
  /** Opens the level select. */
  readonly onPlay: () => void;
  /** Opens the M4 collection. */
  readonly onCollection: () => void;
  /** Opens the M4 chest inventory. */
  readonly onChests: () => void;
  /** Opens the daily quests screen. */
  readonly onQuests: () => void;
  /** Opens the settings screen. */
  readonly onSettings: () => void;
  /** Starts a Training Duel; the Training button is hidden while absent (spec 18.10, 20.6). */
  readonly onTraining?: (level: TrainingBotLevel) => void;
}

/** One functional quick button of the title screen. */
interface QuickAction {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly testId: string;
  readonly badge?: string;
  readonly onSelect: () => void;
}

/**
 * Cinematic title screen of issue #114: the logo lockup, tagline and glossy PLAY
 * call to action float transparently over the renderer's 3D title scene, framed by
 * a vignette, layered glows and floating embers. The M4 quick buttons open the
 * collection, chests, daily quests and settings; the progress line reads the save.
 */
export function TitleScreen({
  save,
  onPlay,
  onCollection,
  onChests,
  onQuests,
  onSettings,
  onTraining,
}: TitleScreenProps) {
  const [trainingOpen, setTrainingOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  usePointerParallax(rootRef);
  const cleared = clearedLevelCount(save);
  const stars = totalStars(save);
  const chests = chestCount(save);
  const questsDone = completedQuestCount(save.dailyQuests);
  const questCount = save.dailyQuests.quests.length;
  const quickActions: readonly QuickAction[] = [
    {
      key: 'collection',
      label: 'Collection',
      icon: 'cards',
      testId: 'title-collection',
      onSelect: onCollection,
    },
    {
      key: 'chests',
      label: 'Chests',
      icon: 'chest',
      testId: 'title-chests',
      badge: chests > 0 ? String(chests) : undefined,
      onSelect: onChests,
    },
    {
      key: 'quests',
      label: 'Daily quests',
      icon: 'timer',
      testId: 'title-quests',
      badge: `${questsDone}/${questCount}`,
      onSelect: onQuests,
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: 'settings',
      testId: 'title-settings',
      onSelect: onSettings,
    },
  ];
  return (
    <main class="title-screen" data-testid="title-screen" ref={rootRef}>
      <div class="title-screen__glow" aria-hidden="true" />
      <TitleSparkles />
      <div class="title-screen__scrim title-screen__scrim--top" aria-hidden="true" />
      <div class="title-screen__inner">
        <header class="title-lockup">
          <span class="title-lockup__halo" aria-hidden="true" />
          <span class="title-lockup__crest" aria-hidden="true">
            <Icon name="crest" class="title-lockup__crest-icon" />
          </span>
          <h1 class="title-lockup__title" aria-label="Bastion Heroes">
            <span class="title-line" aria-hidden="true">
              <span class="title-line__outline">Bastion</span>
              <span class="title-line__fill">Bastion</span>
            </span>
            <span class="title-line title-line--gold" aria-hidden="true">
              <span class="title-line__outline">Heroes</span>
              <span class="title-line__fill">Heroes</span>
            </span>
          </h1>
          <p class="title-lockup__tagline">Defend the last gate of Brightvale</p>
        </header>
        <div class="title-screen__actions">
          <button
            type="button"
            class="title-play"
            data-testid="title-play"
            onClick={(): void => {
              playSfx('button_tap');
              onPlay();
            }}
          >
            <span class="title-play__sheen" aria-hidden="true" />
            <Icon name="play" class="title-play__icon" />
            <span class="title-play__label">Play</span>
          </button>
          {onTraining === undefined ? null : (
            <button
              type="button"
              class="title-training"
              data-testid="title-training"
              onClick={(): void => {
                playSfx('button_tap');
                setTrainingOpen(true);
              }}
            >
              <Icon name="swords" class="title-training__icon" />
              <span class="title-training__text">
                <span class="title-training__label">Training</span>
                <span class="title-training__hint">1v1 Duel vs AI</span>
              </span>
            </button>
          )}
          <div class="title-quick" aria-label="More game options">
            {quickActions.map((action) => (
              <button
                key={action.key}
                type="button"
                class="quick-button"
                aria-label={action.label}
                data-testid={action.testId}
                onClick={(): void => {
                  playSfx('button_tap');
                  action.onSelect();
                }}
              >
                <Icon name={action.icon} class="quick-button__icon" />
                {action.badge === undefined ? null : (
                  <span class="quick-button__badge" aria-hidden="true">
                    {action.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div class="title-info-pill">
            <Icon name="flag" class="title-info-pill__icon" />
            <span>World 1 - Brightvale</span>
          </div>
          <p class="title-screen__progress" data-testid="title-progress">
            {cleared} / 10 levels cleared - {stars} / 30 stars
          </p>
          <p class="title-screen__version">v0.1.0</p>
        </div>
      </div>
      <div class="title-screen__scrim title-screen__scrim--bottom" aria-hidden="true" />
      {trainingOpen && onTraining !== undefined ? (
        <TrainingSheet onStart={onTraining} onClose={(): void => setTrainingOpen(false)} />
      ) : null}
    </main>
  );
}

/** Moves the title lockup a few pixels with the pointer (CSS variables only). */
function usePointerParallax(rootRef: { current: HTMLElement | null }): void {
  useEffect((): (() => void) => {
    const root = rootRef.current;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if (
      root === null ||
      !finePointer ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return (): void => {};
    }
    const onPointerMove = (event: PointerEvent): void => {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      root.style.setProperty('--parallax-x', `${(x * 6).toFixed(2)}px`);
      root.style.setProperty('--parallax-y', `${(y * 4).toFixed(2)}px`);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return (): void => window.removeEventListener('pointermove', onPointerMove);
  }, [rootRef]);
}
