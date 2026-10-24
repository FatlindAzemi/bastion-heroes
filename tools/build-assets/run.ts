/**
 * `npm run assets` / `npm run assets -- <id>` (spec 10.3, 12.1, 12.2).
 *
 * The full asset pipeline for every character script in
 * `assets-src/blender/characters/<id>.py`:
 *
 *   1. run the character script with headless Blender -> assets-build/raw/<id>.glb
 *   2. render the four review images (spec 12.8)  -> assets-build/previews/<id>/
 *   3. optimize and compress the model (spec 12.6) -> public/models/<id>.glb
 *   4. render the card portrait for defenders (spec 12.9) -> public/portraits/<id>.webp
 *
 * Then it runs the spec 12.7 checks over every committed model. With no
 * character scripts yet, it regenerates the palette (spec 9.3) and still runs the
 * checks, so it stays useful from M3 on. One failing model does not stop the
 * others; the process exits 1 at the end when anything failed.
 *
 * Every Blender call passes `--python-exit-code 1`: Blender 4.x and 5.x exit with
 * status 0 when a `-P` script raises, and a silent self-check failure would be
 * worse than a red build (finding from #62).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defenders } from '../../src/data';
import { runAssetChecks } from './check';
import { optimizeModel } from './optimize';

const BLENDER_FLAGS = ['-b', '--factory-startup', '--python-exit-code', '1', '-P'];
const PALETTE_SCRIPT = 'tools/palette/make_palette.py';
const PALETTE_OUTPUT = 'assets-src/palette/palette.png';
const CHARACTER_SCRIPT_DIR = 'assets-src/blender/characters';
const PREVIEW_SCRIPT = 'assets-src/blender/lib/preview.py';
const PORTRAIT_SCRIPT = 'assets-src/blender/lib/portrait.py';
const RAW_DIR = 'assets-build/raw';
const MODELS_DIR = 'public/models';
const SCRIPT_EXTENSION = '.py';

/** BLENDER_PATH, or undefined after printing the message spec 12.2 requires. */
function blenderPath(): string | undefined {
  const path = process.env.BLENDER_PATH;
  if (path === undefined || path.trim() === '') {
    process.stderr.write('Set BLENDER_PATH to your Blender 4.x executable.\n');
    process.exitCode = 1;
    return undefined;
  }
  return path;
}

/** Runs one Blender script headless and fails when Blender or the script fails. */
function runBlender(blender: string, script: string, args: readonly string[]): void {
  const result = spawnSync(blender, [...BLENDER_FLAGS, script, '--', ...args], {
    stdio: 'inherit',
  });
  if (result.error) {
    throw new Error(`could not run Blender: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${String(result.status)}`);
  }
}

/** The model ids that have a character script under the characters folder. */
function characterIds(): string[] {
  return readdirSync(CHARACTER_SCRIPT_DIR)
    .filter((name) => name.endsWith(SCRIPT_EXTENSION) && !name.startsWith('_'))
    .map((name) => name.slice(0, -SCRIPT_EXTENSION.length))
    .sort();
}

/** The ids requested with `npm run assets -- <id> ...`. */
function requestedIds(): string[] {
  return process.argv.slice(2).filter((argument) => argument !== '--');
}

function rawPath(id: string): string {
  return join(RAW_DIR, `${id}.glb`);
}

function modelPath(id: string): string {
  return join(MODELS_DIR, `${id}.glb`);
}

function defenderIds(): Set<string> {
  return new Set(defenders.map((defender) => defender.id));
}

/** Builds one model through all four pipeline steps and reports its timing. */
async function buildModel(
  blender: string,
  id: string,
  defenderModelIds: ReadonlySet<string>,
): Promise<void> {
  const startedAt = Date.now();
  process.stdout.write(`assets: ${id}: building\n`);
  runBlender(blender, join(CHARACTER_SCRIPT_DIR, `${id}${SCRIPT_EXTENSION}`), [
    '--out',
    rawPath(id),
  ]);
  runBlender(blender, PREVIEW_SCRIPT, ['--glb', rawPath(id), '--id', id]);
  await optimizeModel(rawPath(id), modelPath(id));
  if (defenderModelIds.has(id)) {
    runBlender(blender, PORTRAIT_SCRIPT, ['--glb', rawPath(id), '--id', id]);
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write(`assets: ${id}: ok in ${seconds} s\n`);
}

/** Regenerates the shared palette texture (spec 9.3). */
function regeneratePalette(blender: string): void {
  runBlender(blender, PALETTE_SCRIPT, ['--out', join(process.cwd(), PALETTE_OUTPUT)]);
  process.stdout.write(`assets: palette regenerated: ${PALETTE_OUTPUT}\n`);
}

async function main(): Promise<void> {
  const blender = blenderPath();
  if (blender === undefined) {
    return;
  }
  const available = characterIds();
  const requested = requestedIds();
  const ids = requested.length > 0 ? requested : available;
  const unknown = ids.filter((id) => !available.includes(id));
  if (unknown.length > 0) {
    process.stderr.write(`assets: no character script for: ${unknown.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(MODELS_DIR, { recursive: true });
  if (requested.length === 0) {
    regeneratePalette(blender);
    if (available.length === 0) {
      process.stdout.write(`assets: no character scripts yet under ${CHARACTER_SCRIPT_DIR}\n`);
    }
  }
  const defenderModelIds = defenderIds();
  const failures: string[] = [];
  for (const id of ids) {
    try {
      await buildModel(blender, id, defenderModelIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${id}: ${message}`);
      process.stderr.write(`assets: ${id}: FAILED - ${message}\n`);
    }
  }
  const { errors, modelCount } = await runAssetChecks();
  for (const error of errors) {
    process.stderr.write(`check: ${error}\n`);
  }
  if (failures.length > 0 || errors.length > 0) {
    process.stderr.write(
      `assets: FAILED - ${failures.length} model failure(s), ${errors.length} check problem(s)\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`assets: ok - ${modelCount} committed model(s) checked\n`);
}

await main();
