/**
 * Minimal ambient declarations for the Node.js APIs used by `tools/`.
 *
 * Decision #58 (default option B): `@types/node` is not in the approved package
 * table of spec 10.2 and `tsconfig.json` restricts `types` to `vite/client`, so
 * the small API surface the tools need is declared by hand here. Keep this file
 * small: add a declaration only when a tool really calls the API, and widen it
 * together with a note in the pull request when option A replaces it.
 *
 * Used by: the balancing bot (spec 16.2-16.4) and the asset pipeline (spec 12).
 */

/** The Node.js process global. */
declare const process: {
  /** Command line arguments; `argv[0]` and `argv[1]` are node and the script. */
  argv: string[];
  /** Setting it makes `tsx` exit with this code once the script finishes. */
  exitCode?: number;
  /** Standard output; progress and summaries are written with `write`. */
  stdout: { write(text: string): void };
  /** Standard error; failures and the BLENDER_PATH hint are written here. */
  stderr: { write(text: string): void };
  /** Environment variables; BLENDER_PATH is read from here (spec 12.2). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Current working directory; the npm scripts run from the repository root. */
  cwd(): string;
};

declare module 'node:fs' {
  /** Creates a directory and its parents; `recursive` is always passed. */
  export function mkdirSync(path: string, options: { recursive: true }): void;
  /** Writes a UTF-8 text file, replacing it when it exists. */
  export function writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  /** Lists a directory's entry names (files and folders). */
  export function readdirSync(path: string): string[];
  /** Returns a file's metadata; only `size` (bytes) is used. */
  export function statSync(path: string): { size: number };
  /** True when the path exists, used to tolerate an empty output folder. */
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  /** Resolves path segments into an absolute path. */
  export function resolve(...segments: string[]): string;
  /** Joins path segments with the platform separator. */
  export function join(...segments: string[]): string;
}

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

declare module 'node:worker_threads' {
  /** False inside a worker thread that was created by `new Worker(...)`. */
  export const isMainThread: boolean;
  /** The data passed to a worker through `new Worker(..., { workerData })`. */
  export const workerData: unknown;
  /** The channel to the parent thread; null in the main thread. */
  export const parentPort: {
    on(event: 'message', listener: (message: unknown) => void): void;
    postMessage(value: unknown): void;
  } | null;
  /** One worker thread of the balancing-bot run pool (spec 16.2). */
  export class Worker {
    constructor(scriptURL: URL, options?: { workerData?: unknown });
    on(event: 'message', listener: (message: unknown) => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'exit', listener: (code: number) => void): void;
    postMessage(value: unknown): void;
    terminate(): Promise<number>;
  }
}
