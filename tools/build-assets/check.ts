/**
 * `npm run assets:check` (spec 12.7): enforces the model budgets, clips, bones and
 * id mapping of every committed model, and runs in CI after `npm run validate-data`.
 *
 * The rules live in `check-logic.ts` (unit tested); this file only reads the
 * repository: `public/models/*.glb`, the character scripts and the data registry.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defenders, enemies } from '../../src/data';
import { evaluateInventory, evaluateModel } from './check-logic';
import type { UnitInfo } from './check-logic';
import { readModelSummary } from './model-summary';

const MODELS_DIR = 'public/models';
const SCRIPT_DIRS = ['assets-src/blender/characters', 'assets-src/blender/import'];
const MODEL_EXTENSION = '.glb';
const SCRIPT_EXTENSION = '.py';

/** The data definitions, trimmed to the fields the checks need. */
export function dataUnits(): UnitInfo[] {
  const defenderUnits: UnitInfo[] = defenders.map((defender) => ({
    kind: 'defender',
    id: defender.id,
    rarity: defender.rarity,
    pattern: defender.pattern,
  }));
  const enemyUnits: UnitInfo[] = enemies.map((enemy) => ({
    kind: 'enemy',
    id: enemy.id,
    isBoss: enemy.isBoss,
  }));
  return [...defenderUnits, ...enemyUnits];
}

/** The model ids that have a committed `.glb`, sorted for stable output. */
export function modelIds(): string[] {
  if (!existsSync(MODELS_DIR)) {
    return [];
  }
  return readdirSync(MODELS_DIR)
    .filter((name) => name.endsWith(MODEL_EXTENSION))
    .map((name) => name.slice(0, -MODEL_EXTENSION.length))
    .sort();
}

/** The model ids that have a character script (spec 12.1, 12.10). */
export function scriptIds(): string[] {
  const ids: string[] = [];
  for (const directory of SCRIPT_DIRS) {
    if (!existsSync(directory)) {
      continue;
    }
    for (const name of readdirSync(directory)) {
      if (name.endsWith(SCRIPT_EXTENSION) && !name.startsWith('_')) {
        ids.push(name.slice(0, -SCRIPT_EXTENSION.length));
      }
    }
  }
  return ids;
}

/** Runs every asset check; returns the problems found (empty means pass). */
export async function runAssetChecks(): Promise<{ errors: string[]; modelCount: number }> {
  const units = dataUnits();
  const ids = modelIds();
  const errors: string[] = [];
  for (const id of ids) {
    try {
      const summary = await readModelSummary(join(MODELS_DIR, `${id}${MODEL_EXTENSION}`));
      errors.push(...evaluateModel(id, summary, units));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`model "${id}" cannot be read: ${message}`);
    }
  }
  errors.push(...evaluateInventory(ids, scriptIds(), units));
  // An unknown model id is reported by both the model and the inventory check;
  // keep the first message so the summary stays easy to read.
  return { errors: [...new Set(errors)], modelCount: ids.length };
}

const isCli = process.argv[1]?.endsWith('check.ts') ?? false;
if (isCli) {
  const { errors, modelCount } = await runAssetChecks();
  for (const error of errors) {
    process.stderr.write(`check: ${error}\n`);
  }
  if (errors.length > 0) {
    process.stdout.write(`check: FAILED - ${errors.length} problem(s) in ${modelCount} model(s)\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `check: ok - ${modelCount} model(s) within spec 9.3/12.5/12.6 limits and the spec 12.7 id map\n`,
    );
  }
}
