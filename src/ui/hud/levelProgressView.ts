/**
 * Pure level-progress projection for the bottom-right HUD bar (spec 9.8, 3.10).
 * It maps the level's wave flags plus the sim wave runner state into the fill
 * fraction and the flag/skull marks, without importing `src/sim/`.
 */

/** The wave flags of spec 7.1. */
export type LevelWaveFlag = 'none' | 'big' | 'final';

/** Level status of spec 3.9/3.10: playing until the win/loss check ends the level. */
export type LevelProgressStatus = 'playing' | 'won' | 'lost';

/** One mark on the progress bar. */
export interface LevelProgressMark {
  /** Position as a 0..1 fraction of the bar width. */
  readonly fraction: number;
  readonly kind: 'big' | 'final';
}

/** The progress bar view: fill plus one mark per BIG wave and the final wave. */
export interface LevelProgressView {
  readonly fillFraction: number;
  readonly marks: readonly LevelProgressMark[];
}

/** Clamps a value into the 0..1 range. */
function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Builds the progress bar view. The bar fills as waves start (one wave = one
 * fraction of the bar) and is full once the level is won; each BIG wave gets a
 * flag and the final wave a skull at its start position (spec 3.10, 9.8).
 */
export function levelProgressView(
  waveFlags: readonly LevelWaveFlag[],
  waveIndex: number,
  status: LevelProgressStatus,
): LevelProgressView {
  const totalWaves = Math.max(1, waveFlags.length);
  const marks: LevelProgressMark[] = [];
  waveFlags.forEach((flag, index) => {
    if (flag === 'big' || flag === 'final') {
      marks.push({ fraction: index / totalWaves, kind: flag });
    }
  });
  const fillFraction = status === 'won' ? 1 : clampFraction(waveIndex / totalWaves);
  return { fillFraction, marks };
}
