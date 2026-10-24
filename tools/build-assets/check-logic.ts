/**
 * Pure asset-check rules (spec 9.3, 12.5, 12.6, 12.7).
 *
 * `check.ts` reads the committed models and the data registry; this module holds
 * the decisions, so they can be unit tested without Blender, files or glTF
 * buffers:
 *
 * - file size limits (spec 12.6),
 * - triangle budgets and bounding-box height ranges (spec 9.3),
 * - required clips per role and the clip-name vocabulary (spec 9.6, 12.5),
 * - `root` and `head` bones (spec 12.5, 12.7),
 * - model id <-> data id <-> character-script mapping (spec 12.7).
 */

export type DefenderRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** One data definition, trimmed to the fields the checks need. */
export type UnitInfo =
  | {
      readonly kind: 'defender';
      readonly id: string;
      readonly rarity: DefenderRarity;
      readonly pattern: string;
    }
  | { readonly kind: 'enemy'; readonly id: string; readonly isBoss: boolean };

export interface ModelBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** The facts `model-summary.ts` extracts from one committed `.glb`. */
export interface ModelSummary {
  readonly bytes: number;
  readonly animations: readonly string[];
  readonly joints: readonly string[];
  readonly triangles: number;
  readonly bounds: ModelBounds;
}

/** A bounding-box height range; `minHeight` is omitted when spec 9.3 gives only a maximum. */
export interface HeightRange {
  readonly minHeight?: number;
  readonly maxHeight: number;
}

const KIB = 1024;
/** Spec 12.6: size limit per file. */
const DEFENDER_SIZE_BYTES: Readonly<Record<DefenderRarity, number>> = {
  common: 250 * KIB,
  rare: 250 * KIB,
  epic: 400 * KIB,
  legendary: 400 * KIB,
  mythic: 700 * KIB,
};
const ENEMY_SIZE_BYTES = 250 * KIB;
const BOSS_SIZE_BYTES = 700 * KIB;

/** Spec 9.3: triangle budget per unit. */
const DEFENDER_TRIANGLES: Readonly<Record<DefenderRarity, number>> = {
  common: 3000,
  rare: 3000,
  epic: 4500,
  legendary: 4500,
  mythic: 6000,
};
const ENEMY_TRIANGLES = 3000;
const BOSS_TRIANGLES = 8000;

/**
 * Spec 9.3: height range per unit. The Ogre (1.4) and the boss (2.4) are single
 * target heights in the table, so the check allows a small hand-authoring margin.
 */
const DEFENDER_HEIGHT: Readonly<Record<DefenderRarity, HeightRange>> = {
  common: { minHeight: 0.7, maxHeight: 0.9 },
  rare: { minHeight: 0.7, maxHeight: 0.9 },
  epic: { minHeight: 0.8, maxHeight: 1.1 },
  legendary: { minHeight: 0.8, maxHeight: 1.1 },
  mythic: { maxHeight: 1.3 },
};
const ENEMY_HEIGHT: HeightRange = { minHeight: 0.8, maxHeight: 1.0 };
const OGRE_HEIGHT: HeightRange = { minHeight: 1.3, maxHeight: 1.5 };
const BOSS_HEIGHT: HeightRange = { minHeight: 2.2, maxHeight: 2.6 };
const OGRE_ID = 'gloom_ogre';

/** Spec 9.6/12.5: the only clip names a model may carry, and the attackers. */
export const ALLOWED_CLIPS = ['idle', 'attack', 'produce', 'walk', 'eat', 'victory'] as const;
const ATTACKING_PATTERNS = ['straight', 'lob', 'splash', 'beam', 'diagonal', 'melee'];

/** The clips a unit's role requires (spec 12.5). */
export function requiredClips(unit: UnitInfo): string[] {
  if (unit.kind === 'enemy') {
    return ['walk', 'eat'];
  }
  if (unit.pattern === 'producer') {
    return ['idle', 'produce', 'victory'];
  }
  if (ATTACKING_PATTERNS.includes(unit.pattern)) {
    return ['idle', 'attack', 'victory'];
  }
  return ['idle', 'victory'];
}

/** Spec 12.6 size limit in bytes for the unit. */
export function sizeLimitFor(unit: UnitInfo): number {
  if (unit.kind === 'enemy') {
    return unit.isBoss ? BOSS_SIZE_BYTES : ENEMY_SIZE_BYTES;
  }
  return DEFENDER_SIZE_BYTES[unit.rarity];
}

/** Spec 9.3 triangle budget for the unit. */
export function triangleLimitFor(unit: UnitInfo): number {
  if (unit.kind === 'enemy') {
    return unit.isBoss ? BOSS_TRIANGLES : ENEMY_TRIANGLES;
  }
  return DEFENDER_TRIANGLES[unit.rarity];
}

/** Spec 9.3 height range for the unit. */
export function heightRangeFor(unit: UnitInfo): HeightRange {
  if (unit.kind === 'defender') {
    return DEFENDER_HEIGHT[unit.rarity];
  }
  if (unit.isBoss) {
    return BOSS_HEIGHT;
  }
  return unit.id === OGRE_ID ? OGRE_HEIGHT : ENEMY_HEIGHT;
}

/** Bounding-box height in glTF space (Y is up). */
export function boundingHeight(bounds: ModelBounds): number {
  return bounds.max[1] - bounds.min[1];
}

function kilobytes(bytes: number): string {
  return `${(bytes / KIB).toFixed(0)} KB`;
}

function checkBudget(errors: string[], id: string, detail: string): void {
  errors.push(`model "${id}" ${detail}`);
}

/** Compares one model against the spec rules for its data unit. */
export function evaluateModel(
  id: string,
  summary: ModelSummary,
  units: readonly UnitInfo[],
): string[] {
  const unit = units.find((candidate) => candidate.id === id);
  if (unit === undefined) {
    return [`model "${id}" has no matching defender or enemy in src/data/index.ts`];
  }
  const errors: string[] = [];
  const sizeLimit = sizeLimitFor(unit);
  if (summary.bytes > sizeLimit) {
    checkBudget(
      errors,
      id,
      `is ${kilobytes(summary.bytes)} (${summary.bytes} bytes), over the ${kilobytes(sizeLimit)} limit of spec 12.6`,
    );
  }
  const triangleLimit = triangleLimitFor(unit);
  if (summary.triangles > triangleLimit) {
    checkBudget(
      errors,
      id,
      `has ${summary.triangles} triangles, over the ${triangleLimit} budget of spec 9.3`,
    );
  }
  const height = boundingHeight(summary.bounds);
  const range = heightRangeFor(unit);
  if (height > range.maxHeight || (range.minHeight !== undefined && height < range.minHeight)) {
    const expected =
      range.minHeight === undefined
        ? `up to ${range.maxHeight}`
        : `${range.minHeight}-${range.maxHeight}`;
    checkBudget(errors, id, `is ${height.toFixed(3)} tall, outside the spec 9.3 range ${expected}`);
  }
  for (const clip of requiredClips(unit)) {
    if (!summary.animations.includes(clip)) {
      checkBudget(errors, id, `is missing the "${clip}" clip required for its role (spec 12.5)`);
    }
  }
  for (const clip of summary.animations) {
    if (!ALLOWED_CLIPS.includes(clip as (typeof ALLOWED_CLIPS)[number])) {
      checkBudget(
        errors,
        id,
        `has unknown clip "${clip}" (spec 9.6/12.5 names are ${ALLOWED_CLIPS.join(', ')})`,
      );
    }
  }
  for (const bone of ['root', 'head']) {
    if (!summary.joints.includes(bone)) {
      checkBudget(errors, id, `has no "${bone}" bone (spec 12.5, 12.7)`);
    }
  }
  return errors;
}

/**
 * Checks the id mapping in both directions: every committed model and every
 * character script needs a data unit, and every model needs its script (and the
 * other way around) so a stale or orphaned file cannot slip through.
 */
export function evaluateInventory(
  modelIds: readonly string[],
  scriptIds: readonly string[],
  units: readonly UnitInfo[],
): string[] {
  const errors: string[] = [];
  const unitIds = new Set(units.map((unit) => unit.id));
  for (const id of units) {
    if (units.filter((candidate) => candidate.id === id.id).length > 1) {
      errors.push(`data id "${id.id}" is defined more than once (defender and enemy?)`);
    }
  }
  const models = new Set(modelIds);
  const scripts = new Set(scriptIds);
  for (const id of models) {
    if (!unitIds.has(id)) {
      errors.push(`model "${id}" has no matching defender or enemy in src/data/index.ts`);
    }
    if (!scripts.has(id)) {
      errors.push(
        `model "${id}" has no character script under assets-src/blender/characters or import`,
      );
    }
  }
  for (const id of scripts) {
    if (!unitIds.has(id)) {
      errors.push(
        `character script "${id}" has no matching defender or enemy in src/data/index.ts`,
      );
    }
    if (!models.has(id)) {
      errors.push(
        `character script "${id}" has no committed model (run npm run assets -- ${id} and commit it)`,
      );
    }
  }
  return errors;
}
