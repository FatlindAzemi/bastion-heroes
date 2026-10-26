import { completedQuestCount, totalStars, type SaveData } from '../../meta';
import { playSfx } from '../../platform/audio';
import { CurrencyPill } from '../components/CurrencyPill';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { LevelMap } from './LevelMap';
import { levelCards } from './levelCards';
import type { ShellLevel } from './shellTypes';

/** Props of the level select screen of the playable shell (issue #113, M4). */
export interface LevelSelectScreenProps {
  readonly levels: readonly ShellLevel[];
  /** Stars, wallets and daily quest progress of the M4 save. */
  readonly save: SaveData;
  /** Opens the Scouting screen of the chosen level. */
  readonly onSelect: (levelId: string) => void;
  /** Opens the daily quests screen. */
  readonly onQuests: () => void;
  /** Returns to the title screen. */
  readonly onBack: () => void;
}

/**
 * World map level select of issue #114: the chapter header "Brightvale", the star
 * progress, the three M4 wallets and the winding illustrated map. Levels unlock
 * sequentially and show their recorded stars; the next unplayed node glows.
 */
export function LevelSelectScreen({
  levels,
  save,
  onSelect,
  onQuests,
  onBack,
}: LevelSelectScreenProps) {
  const cards = levelCards(levels, save);
  const stars = totalStars(save);
  const maxStars = levels.length * 3;
  const doneQuests = completedQuestCount(save.dailyQuests);
  const questCount = save.dailyQuests.quests.length;
  const startLevel = (levelId: string): void => {
    playSfx('button_tap');
    onSelect(levelId);
  };
  return (
    <main class="screen level-select-screen" data-testid="level-select-screen">
      <div class="screen__inner level-select__inner">
        <ScreenHeader
          eyebrow="World 1 - The Glowfields"
          title="Brightvale"
          onBack={onBack}
          backTestId="levels-back"
        />
        <div class="level-select__meta">
          <CurrencyPill kind="stars" value={stars} total={maxStars} testId="level-stars" />
          <CurrencyPill kind="gold" value={save.gold} testId="level-gold" />
          <CurrencyPill kind="gems" value={save.gems} testId="level-gems" />
          <button
            type="button"
            class="meta-icon-button level-select__quests"
            aria-label={`Daily quests, ${doneQuests} of ${questCount} complete`}
            data-testid="level-quests"
            onClick={(): void => {
              playSfx('button_tap');
              onQuests();
            }}
          >
            <Icon name="timer" class="meta-icon-button__icon" />
            <span class="meta-icon-button__badge">
              {doneQuests}/{questCount}
            </span>
          </button>
        </div>
        <LevelMap cards={cards} onSelect={startLevel} />
      </div>
    </main>
  );
}
