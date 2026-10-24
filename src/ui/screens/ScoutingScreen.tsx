import type { LevelDef } from '../../data/schemas';
import { Button } from '../components/Button';
import { enemyTip } from './enemyTips';
import { enemyTypesForLevel, laneSummary, terrainSummary } from './scouting';

/** Props of the Scout screen (spec 3.12 rule 1, 11.8). */
export interface ScoutingScreenProps {
  readonly level: LevelDef;
  /** Goes to the Loadout screen (spec 11.8: Scouting -> Loadout). */
  readonly onContinue: () => void;
}

/** Counts the enemy types of the level for the header fact row. */
function enemyTypeFact(enemyCount: number): string {
  return `${enemyCount} enemy ${enemyCount === 1 ? 'type' : 'types'}`;
}

/**
 * Scout screen: level name, world/level label, terrain and lane summary, and one
 * row per enemy type that appears in the level's waves with a tip from spec 6.2.
 * The menu diorama behind it is M4; the screen is an opaque 9.8-styled backdrop.
 */
export function ScoutingScreen({ level, onContinue }: ScoutingScreenProps) {
  const enemyTypes = enemyTypesForLevel(level);
  return (
    <main class="screen scout-screen" data-testid="scout-screen">
      <div class="screen__inner">
        <header class="screen__header">
          <p class="screen__eyebrow">
            World {level.world} - Level {level.number}
          </p>
          <h1 class="screen__title">{level.name}</h1>
        </header>
        <div class="screen__body scout-body">
          <ul class="scout-facts">
            <li class="scout-fact">{terrainSummary(level)}</li>
            <li class="scout-fact">{laneSummary(level)}</li>
            <li class="scout-fact">{enemyTypeFact(enemyTypes.length)}</li>
          </ul>
          <section class="scout-report" aria-label="Enemy scout report">
            <h2 class="screen__section-title">Enemy scout report</h2>
            <ul class="scout-enemy-list">
              {enemyTypes.map((enemy) => (
                <li class="scout-enemy" key={enemy.id} data-enemy={enemy.id}>
                  <span class="scout-enemy__icon" data-armor={enemy.armor} aria-hidden="true">
                    {enemy.name.charAt(0)}
                  </span>
                  <span class="scout-enemy__text">
                    <span class="scout-enemy__name">{enemy.name}</span>
                    <span class="scout-enemy__tip">{enemyTip(enemy.id)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <footer class="screen__actions screen__actions--end">
          <Button variant="primary" onClick={onContinue} testId="scout-continue">
            Continue
          </Button>
        </footer>
      </div>
    </main>
  );
}
