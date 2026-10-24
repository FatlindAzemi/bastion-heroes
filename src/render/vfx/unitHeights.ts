/**
 * Approximate head heights in world units for the damage numbers and health bars of
 * spec 9.7. These are visual anchors only (not game numbers): the character models
 * are 0.8-1.0 units tall, the Ogre 1.4 (spec 9.3) and flying enemies hover at 1.5
 * (spec 6.2). The table keeps the bars above the head without reading model bounds.
 */

/** Ground-level unit head height in world units. */
const STANDARD_HEAD_HEIGHT = 1.05;
/** Ogre head height (spec 9.3: 1.4 units tall). */
const OGRE_HEAD_HEIGHT = 1.55;
/** Flying enemy head height: the 1.5 unit hover plus the bat swarm body (spec 6.2). */
export const FLYING_HEAD_HEIGHT = 2.35;

/** A unit's head height: defenders standard, enemies per model, flying enemies higher. */
export function unitHeadHeight(kind: 'defender' | 'enemy', modelId: string): number {
  if (kind === 'defender') {
    return STANDARD_HEAD_HEIGHT;
  }
  if (modelId === 'gloom_ogre') {
    return OGRE_HEAD_HEIGHT;
  }
  if (modelId === 'bat_swarm') {
    return FLYING_HEAD_HEIGHT;
  }
  return STANDARD_HEAD_HEIGHT;
}

/** Hover height of a flying enemy in world units (spec 6.2: the Bat Swarm flies at 1.5). */
export function enemyHoverHeight(modelId: string): number {
  return modelId === 'bat_swarm' ? 1.5 : 0;
}
