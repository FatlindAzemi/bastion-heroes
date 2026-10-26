import { questById } from '../../data/economy';
import { completedQuestCount, type SaveData } from '../../meta';
import { CurrencyPill } from '../components/CurrencyPill';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

/** Props of the M4 daily quests screen (spec 8.5). */
export interface DailyQuestsScreenProps {
  readonly save: SaveData;
  /** Returns to the screen the quests were opened from. */
  readonly onBack: () => void;
}

/**
 * Daily quests (spec 8.5): the three quests of the local day with progress bars,
 * the 50 gold + 10 gems reward each, the all-three Wooden chest banner and the
 * midnight reset note. Quests advance from level results; this screen reads them.
 */
export function DailyQuestsScreen({ save, onBack }: DailyQuestsScreenProps) {
  const quests = save.dailyQuests.quests;
  const done = completedQuestCount(save.dailyQuests);
  const allDone = quests.length > 0 && done === quests.length;
  return (
    <main class="screen quests-screen" data-testid="quests-screen">
      <div class="screen__inner">
        <ScreenHeader
          eyebrow="Today in Brightvale"
          title="Daily quests"
          badge={`${done} / ${quests.length}`}
          onBack={onBack}
          backTestId="quests-back"
        />
        <div class="screen__wallet">
          <CurrencyPill kind="gold" value={save.gold} testId="quests-gold" />
          <CurrencyPill kind="gems" value={save.gems} testId="quests-gems" />
          <span class="quests-screen__reset">Resets at midnight</span>
        </div>
        <div class="screen__body quests-body">
          <ul class="quest-list">
            {quests.map((progress) => {
              const definition = questById[progress.id];
              if (definition === undefined) {
                return null;
              }
              const fraction = Math.min(1, progress.progress / definition.target);
              return (
                <li
                  key={progress.id}
                  class={`quest-card${progress.done ? ' quest-card--done' : ''}`}
                  data-testid="quest-card"
                  data-quest-id={progress.id}
                  data-done={progress.done}
                >
                  <span class="quest-card__icon-wrap" aria-hidden="true">
                    <Icon name={progress.done ? 'check' : 'timer'} class="quest-card__icon" />
                  </span>
                  <span class="quest-card__text">
                    <span class="quest-card__title">{definition.title}</span>
                    <span class="quest-card__description">{definition.description}</span>
                    <span class="quest-card__bar">
                      <span
                        class="quest-card__fill"
                        style={{ width: `${(fraction * 100).toFixed(0)}%` }}
                      />
                    </span>
                    <span class="quest-card__progress">
                      {Math.min(progress.progress, definition.target)} / {definition.target}
                    </span>
                  </span>
                  <span class="quest-card__reward" aria-label="50 gold and 10 gems">
                    <span class="quest-card__reward-row">
                      <Icon name="goldCoin" class="quest-card__reward-icon" />
                      +50
                    </span>
                    <span class="quest-card__reward-row">
                      <Icon name="gem" class="quest-card__reward-icon" />
                      +10
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div
            class={`quest-bonus glass-panel${allDone ? ' quest-bonus--done' : ''}`}
            data-testid="quest-bonus"
            data-claimed={save.dailyQuests.allDoneRewarded}
          >
            <span class="quest-bonus__icon-wrap" aria-hidden="true">
              <Icon name="chest" class="quest-bonus__icon" />
            </span>
            <span class="quest-bonus__text">
              <span class="quest-bonus__title">Complete all three</span>
              <span class="quest-bonus__hint">
                {save.dailyQuests.allDoneRewarded
                  ? 'Wooden chest claimed. Come back tomorrow!'
                  : 'Finish every quest today to earn a Wooden chest.'}
              </span>
            </span>
            <span class="quest-bonus__badge">{allDone ? 'Done' : `${done}/3`}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
