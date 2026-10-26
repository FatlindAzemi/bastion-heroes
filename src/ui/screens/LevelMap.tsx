import type { CSSProperties } from 'preact/compat';

import { Icon } from '../components/Icon';
import type { LevelCardView } from './levelCards';
import { mapPathD, nodePosition } from './levelMapLayout';

/** Props of the illustrated World 1 map (issue #114). */
export interface LevelMapProps {
  readonly cards: readonly LevelCardView[];
  /** Opens the Scouting screen of the chosen level. */
  readonly onSelect: (levelId: string) => void;
}

/** One decorative map prop (tree, rock or bush) with its normalised position. */
interface PropSpec {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const TREES: readonly PropSpec[] = [
  { x: 6, y: 66, scale: 1 },
  { x: 84, y: 74, scale: 0.85 },
  { x: 12, y: 34, scale: 0.7 },
  { x: 80, y: 24, scale: 0.9 },
  { x: 46, y: 93, scale: 0.8 },
  { x: 88, y: 34, scale: 0.75 },
  { x: 6, y: 22, scale: 0.65 },
];

const ROCKS: readonly PropSpec[] = [
  { x: 88, y: 50, scale: 0.8 },
  { x: 10, y: 52, scale: 0.6 },
  { x: 70, y: 90, scale: 0.7 },
  { x: 30, y: 60, scale: 0.55 },
  { x: 80, y: 8, scale: 0.6 },
];

/** Drifting firefly dots: position in percent, timing and tone. */
interface FireflySpec {
  readonly x: number;
  readonly y: number;
  readonly delay: number;
  readonly duration: number;
  readonly gold: boolean;
}

const FIREFLIES: readonly FireflySpec[] = [
  { x: 14, y: 58, delay: 0, duration: 7.5, gold: false },
  { x: 82, y: 44, delay: 1.6, duration: 8.4, gold: true },
  { x: 56, y: 73, delay: 2.8, duration: 6.8, gold: false },
  { x: 34, y: 24, delay: 0.9, duration: 9.1, gold: true },
  { x: 70, y: 88, delay: 3.6, duration: 7.2, gold: false },
];

const BUSHES: readonly PropSpec[] = [
  { x: 18, y: 20, scale: 0.9 },
  { x: 72, y: 63, scale: 0.7 },
  { x: 52, y: 34, scale: 0.6 },
  { x: 14, y: 78, scale: 0.65 },
  { x: 88, y: 58, scale: 0.5 },
];

/**
 * The illustrated World 1 map (issue #114): a painted valley, an S-curving road,
 * small scenery props and one gold-rimmed medallion per level. Level 10 sits on the
 * Bastion gate crest; the first unplayed level glows and carries a START HERE ribbon.
 */
export function LevelMap({ cards, onSelect }: LevelMapProps) {
  const path = mapPathD();
  return (
    <div class="world-map">
      <div class="world-map__sky" aria-hidden="true" />
      <div class="world-map__hills" aria-hidden="true" />
      <MapScenery />
      {FIREFLIES.map((firefly, index) => (
        <span
          key={`firefly-${index}`}
          class={`map-firefly${firefly.gold ? ' map-firefly--gold' : ''}`}
          style={
            {
              left: `${firefly.x}%`,
              top: `${firefly.y}%`,
              '--firefly-delay': `${firefly.delay}s`,
              '--firefly-duration': `${firefly.duration}s`,
            } as CSSProperties
          }
          aria-hidden="true"
        />
      ))}
      <svg
        class="world-map__path"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path class="world-map__path-glow" d={path} vector-effect="non-scaling-stroke" />
        <path class="world-map__path-line" d={path} vector-effect="non-scaling-stroke" />
      </svg>
      <span class="world-map__gate" aria-hidden="true">
        <Icon name="crest" class="world-map__gate-icon" />
      </span>
      {cards.map((card) => (
        <MapNode key={card.id} card={card} onSelect={onSelect} />
      ))}
    </div>
  );
}

/** Small pixel-free scenery silhouettes that make the map feel illustrated. */
function MapScenery() {
  return (
    <div class="world-map__scenery" aria-hidden="true">
      {TREES.map((prop, index) => (
        <span
          key={`tree-${index}`}
          class="map-prop map-prop--tree"
          style={{ left: `${prop.x}%`, top: `${prop.y}%`, scale: `${prop.scale}` }}
        >
          <svg viewBox="0 0 40 52">
            <path d="M20 2 L34 21 L27 21 L38 37 L22 37 L22 50 L18 50 L18 37 L2 37 L13 21 L6 21 Z" />
          </svg>
        </span>
      ))}
      {ROCKS.map((prop, index) => (
        <span
          key={`rock-${index}`}
          class="map-prop map-prop--rock"
          style={{ left: `${prop.x}%`, top: `${prop.y}%`, scale: `${prop.scale}` }}
        >
          <svg viewBox="0 0 44 28">
            <path d="M4 24 L13 9 L26 4 L40 15 L35 24 Z" />
            <path class="map-prop__shine" d="M15 12 L25 7 L31 11 L22 15 Z" />
          </svg>
        </span>
      ))}
      {BUSHES.map((prop, index) => (
        <span
          key={`bush-${index}`}
          class="map-prop map-prop--bush"
          style={{ left: `${prop.x}%`, top: `${prop.y}%`, scale: `${prop.scale}` }}
        >
          <svg viewBox="0 0 44 26">
            <path d="M6 24 Q2 14 12 12 Q14 2 24 6 Q34 2 36 12 Q44 16 38 24 Z" />
          </svg>
        </span>
      ))}
    </div>
  );
}

/** One gold-rimmed level medallion on the map (spec 16.5 access hooks kept). */
function MapNode({
  card,
  onSelect,
}: {
  readonly card: LevelCardView;
  readonly onSelect: (levelId: string) => void;
}) {
  const position = nodePosition(card.number - 1);
  const clickable = card.available && card.unlocked;
  const classNames = ['map-node'];
  if (!clickable) {
    classNames.push('map-node--locked');
  }
  if (card.next) {
    classNames.push('map-node--next');
  }
  const starsLabel = card.stars === 0 ? 'no stars' : `${card.stars} of 3 stars`;
  return (
    <button
      type="button"
      class={classNames.join(' ')}
      style={{ left: `${position.left}%`, top: `${position.top}%` }}
      data-testid="level-card"
      data-level-id={card.id}
      data-locked={!clickable}
      data-stars={card.stars}
      disabled={!clickable}
      aria-label={
        !card.available
          ? `Level ${card.number}, unavailable`
          : card.unlocked
            ? `Level ${card.number}, ${card.name}, ${starsLabel}`
            : `Level ${card.number}, ${card.name}, locked`
      }
      onClick={(): void => onSelect(card.id)}
    >
      {card.next ? <span class="map-node__ribbon">Start here</span> : null}
      <span class="map-node__medallion">
        <span class="map-node__facets" aria-hidden="true" />
        {card.unlocked ? (
          <span class="map-node__number">{card.number}</span>
        ) : (
          <Icon name="lock" class="map-node__lock" />
        )}
        <span class="map-node__stars" aria-hidden="true">
          {[1, 2, 3].map((star) => (
            <Icon
              key={star}
              name={star <= card.stars ? 'star' : 'starEmpty'}
              class={`map-node__star${star <= card.stars ? ' map-node__star--earned' : ''}`}
            />
          ))}
        </span>
      </span>
      <span class="map-node__plate">{card.name}</span>
    </button>
  );
}
