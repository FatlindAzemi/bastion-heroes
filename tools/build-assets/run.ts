/**
 * `npm run assets` (spec 10.3): rebuild the generated art assets with headless
 * Blender (spec 12.1, 12.2).
 *
 * The palette generator (spec 9.3) writes `assets-src/palette/palette.png`, the
 * single shared 256x256 texture that every model samples. Later asset-pipeline
 * tasks add the character scripts and the gltf-transform optimization step to
 * this runner.
 *
 * Blender exits with status 0 even when a `-P` script raises an exception, so the
 * runner always passes `--python-exit-code 1`; without it a failed self-check in
 * a generator would silently pass `npm run assets`.
 */
import { spawnSync } from 'node:child_process';

/**
 * The Node process fields this runner uses, declared locally because @types/node
 * is not an approved package (spec 10.2, issue #58). Reading them through
 * `globalThis` keeps the runner independent of whichever Node type declarations
 * happen to be visible to TypeScript on a machine.
 */
interface BlenderProcess {
  readonly env: Readonly<Record<string, string | undefined>>;
  cwd(): string;
  exitCode: number | undefined;
  stderr: { write(text: string): void };
}

const nodeProcess = (globalThis as unknown as { process: BlenderProcess }).process;

/** The palette generator (spec 9.3) and the file it writes. */
const PALETTE_SCRIPT = 'tools/palette/make_palette.py';
const PALETTE_OUTPUT = 'assets-src/palette/palette.png';

/** BLENDER_PATH, or undefined after printing the message spec 12.2 requires. */
function blenderPath(): string | undefined {
  const path = nodeProcess.env.BLENDER_PATH;
  if (path === undefined || path.trim() === '') {
    nodeProcess.stderr.write('Set BLENDER_PATH to your Blender 4.x executable.\n');
    nodeProcess.exitCode = 1;
    return undefined;
  }
  return path;
}

/** Runs one Blender script headless and fails when Blender or the script fails. */
function runBlender(blender: string, script: string, args: readonly string[]): void {
  const result = spawnSync(
    blender,
    ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script, '--', ...args],
    { stdio: 'inherit' },
  );
  if (result.error) {
    throw new Error(`assets: could not run Blender: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`assets: ${script} failed with exit code ${String(result.status)}`);
  }
}

const blender = blenderPath();
if (blender !== undefined) {
  runBlender(blender, PALETTE_SCRIPT, ['--out', `${nodeProcess.cwd()}/${PALETTE_OUTPUT}`]);
  console.log(`assets: palette regenerated: ${PALETTE_OUTPUT}`);
}
