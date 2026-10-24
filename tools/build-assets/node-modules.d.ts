/**
 * Minimal ambient declaration for the one Node module the asset tools import.
 *
 * Decision #58 (default option B): `@types/node` is not in the approved package
 * table of spec 10.2 and `tsconfig.json` restricts `types` to `vite/client`, so a
 * tool declares the small Node surface it really uses by hand. Keep this file
 * small: add a declaration only when a tool imports the API.
 *
 * The process object is not declared here; `run.ts` reads it through
 * `globalThis` so the runner does not depend on Node type declarations that may
 * or may not be visible from a machine's parent folders.
 */

declare module 'node:child_process' {
  /** Result of a child process that has already finished. */
  export interface SpawnSyncReturns {
    /** Exit status, or null when the process was killed by a signal. */
    status: number | null;
    /** Set when the process could not be spawned at all. */
    error?: Error;
  }
  /** Spawns a child process, waits for it and returns its status (spec 12.2). */
  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { stdio: 'inherit' },
  ): SpawnSyncReturns;
}
