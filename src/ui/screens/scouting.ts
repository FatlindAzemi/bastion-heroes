/**
 * Pure scouting helpers (spec 3.12 rule 1, issue #49): which enemy types appear
 * in a level (first-appearance order), their armor types for the Recommended
 * rule, and the terrain/lane summary. They read only `src/data/`.
 */
import { enemyById, rules } from '../../data';
import type { EnemyDef, LevelDef } from '../../data/schemas';
import type { ArmorType } from './types';

/** Terrain labels of spec 3.1, in the order the summary lists them. */
const TERRAIN_LABELS: Readonly<Record<string, string>> = {
  water: 'water',
  rock: 'rock',
  lava: 'lava',
  highGround: 'high ground',
  normal: 'normal',
};

/** Every enemy type that appears in the level's waves, in first-appearance order. */
export function enemyTypesForLevel(level: LevelDef): readonly EnemyDef[] {
  const seen = new Set<string>();
  const enemyTypes: EnemyDef[] = [];
  for (const wave of level.waves) {
    for (const spawn of wave.spawns) {
      if (seen.has(spawn.enemy)) {
        continue;
      }
      seen.add(spawn.enemy);
      const enemy = enemyById[spawn.enemy];
      if (enemy !== undefined) {
        enemyTypes.push(enemy);
      }
    }
  }
  return enemyTypes;
}

/** The distinct armor types of those enemies, in first-appearance order (spec 4.1, 3.12). */
export function armorTypesForLevel(level: LevelDef): readonly ArmorType[] {
  const seen = new Set<ArmorType>();
  for (const enemy of enemyTypesForLevel(level)) {
    seen.add(enemy.armor);
  }
  return [...seen];
}

/** Lane summary from the level's active lanes (spec 7.1, lanes are shown 1-based). */
export function laneSummary(level: LevelDef): string {
  const activeLanes = level.activeLanes;
  if (activeLanes.length === rules.grid.laneCount) {
    return `All ${activeLanes.length} lanes open`;
  }
  const laneNumbers = [...activeLanes]
    .sort((first, second) => first - second)
    .map((lane) => lane + 1)
    .join(', ');
  return `${activeLanes.length} of ${rules.grid.laneCount} lanes (${laneNumbers})`;
}

/** Terrain summary from the level's terrain overrides (spec 3.1, 7.1). */
export function terrainSummary(level: LevelDef): string {
  if (level.terrain.length === 0) {
    return 'Open ground, no obstacles';
  }
  const counts = new Map<string, number>();
  for (const tile of level.terrain) {
    counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [type, label] of Object.entries(TERRAIN_LABELS)) {
    const count = counts.get(type);
    if (count !== undefined) {
      parts.push(`${count} ${label} ${count === 1 ? 'tile' : 'tiles'}`);
    }
  }
  return parts.join(', ');
}
