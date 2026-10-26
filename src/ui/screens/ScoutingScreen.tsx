import type { LevelDef } from '../../data/schemas';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { pixelPortraitUrl } from '../portraits';
import { enemyTip } from './enemyTips';
import { counterHintsForLevel, enemyTypesForLevel, laneSummary, terrainSummary } from './scouting';

/** Props of the Scout screen (spec 3.12 rule 1, 11.8, issue #113 portrait). */
export interface ScoutingScreenProps {
  readonly level: LevelDef;
  /** Goes to the Loadout screen (spec 11.8: Scouting -> Loadout). */
  readonly onContinue: () => void;
  /** Returns to the level select from the shell; hidden in the debug flow. */
  readonly onBack?: () => void;
}

/** Readable damage names of the counter hints (spec 4.1). */
const DAMAGE_LABELS: Readonly<Record<string, string>> = {
  pierce: 'Pierce',
  blast: 'Blast',
  arcane: 'Arcane',
};

/** Readable armor names of the scout report badge (spec 4.1). */
const ARMOR_LABELS: Readonly<Record<string, string>> = {
  light: 'Light armor',
  armored: 'Armored',
  spectral: 'Spectral',
};

/** Counts the enemy types of the level for the header fact row. */
function enemyTypeFact(enemyCount: number): string {
  return `${enemyCount} enemy ${enemyCount === 1 ? 'type' : 'types'}`;
}

/** Enemy portrait of the 2.5D sprite set, with the letter medallion as fallback. */
function EnemyPortrait({
  enemyId,
  armor,
  initial,
}: {
  readonly enemyId: string;
  readonly armor: string;
  readonly initial: string;
}) {
  const url = pixelPortraitUrl(enemyId);
  return (
    <span class="scout-enemy__icon" data-armor={armor} aria-hidden="true">
      {url === null ? (
        <span class="scout-enemy__letter">{initial}</span>
      ) : (
        <img class="scout-enemy__portrait" src={url} alt="" draggable={false} />
      )}
    </span>
  );
}

/**
 * Portrait Scout screen of issue #114: the level's terrain and lane intel plus one
 * glass enemy card per enemy type with its spec 6.2 tip, all inside one tight glass
 * panel, with the Continue call to action pinned in a bottom glass bar.
 */
export function ScoutingScreen({ level, onContinue, onBack }: ScoutingScreenProps) {
  const enemyTypes = enemyTypesForLevel(level);
  const counterHints = counterHintsForLevel(level);
  return (
    <main class="screen scout-screen" data-testid="scout-screen">
      <div class="screen__inner">
        <ScreenHeader
          eyebrow={`World ${level.world} - Level ${level.number}`}
          title={level.name}
          onBack={onBack}
          backTestId="scout-back"
        />
        <div class="screen__body scout-body">
          <ul class="scout-facts">
            <li class="scout-fact">{terrainSummary(level)}</li>
            <li class="scout-fact">{laneSummary(level)}</li>
            <li class="scout-fact">{enemyTypeFact(enemyTypes.length)}</li>
          </ul>
          <section class="scout-report glass-panel" aria-label="Enemy scout report">
            <header class="scout-report__header">
              <h2 class="screen__section-title">Enemy scout report</h2>
              <span class="scout-report__count">{enemyTypes.length} threats</span>
            </header>
            <ul class="scout-enemy-list">
              {enemyTypes.map((enemy) => (
                <li class="scout-enemy" key={enemy.id} data-enemy={enemy.id}>
                  <EnemyPortrait
                    enemyId={enemy.id}
                    armor={enemy.armor}
                    initial={enemy.name.charAt(0)}
                  />
                  <span class="scout-enemy__text">
                    <span class="scout-enemy__top">
                      <span class="scout-enemy__name">{enemy.name}</span>
                      <span class="scout-enemy__armor" data-armor={enemy.armor}>
                        {ARMOR_LABELS[enemy.armor] ?? enemy.armor}
                      </span>
                    </span>
                    <span class="scout-enemy__tip">{enemyTip(enemy.id)}</span>
                    <span class="scout-enemy__stats">
                      <span class="scout-enemy__stat">HP {enemy.hp}</span>
                      <span class="scout-enemy__stat">Speed {enemy.speed}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div class="scout-counters">
              <span class="screen__section-title">Best counters</span>
              <ul class="scout-counter-list">
                {counterHints.map((hint) => (
                  <li class="scout-counter" key={hint.armor}>
                    <span class="scout-counter__armor" data-armor={hint.armor}>
                      {ARMOR_LABELS[hint.armor] ?? hint.armor}
                    </span>
                    <span class="scout-counter__arrow" aria-hidden="true">
                      &rarr;
                    </span>
                    <span class="scout-counter__damage">{DAMAGE_LABELS[hint.damageType]}</span>
                    <span class="scout-counter__value">{hint.multiplier}x</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
        <footer class="screen__actions screen__actions--pinned">
          <Button variant="primary" onClick={onContinue} testId="scout-continue">
            Continue
          </Button>
        </footer>
      </div>
    </main>
  );
}
