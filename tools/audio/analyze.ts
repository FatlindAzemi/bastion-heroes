/**
 * Level and loop-seam analysis for the procedural audio tool (issue #114 §5).
 *
 * Verification is a "listen proxy": it cannot judge taste, so it checks the
 * measurable things that make a loop usable in the game — exact sample length,
 * peak below the -1 dBFS task limit, no DC offset, an even section-to-section
 * loudness curve, and a loop seam whose first/last samples are as continuous as
 * the waveform around them. The seam check is the important one: `foldTail` folds
 * the render tail onto the loop start, so the loop must behave like the steady
 * state of the arrangement and the step across the seam must be no larger than
 * the sample-to-sample steps inside the boundary windows.
 */
import { gainToDb, type StereoBuffer } from './dsp';

/** Peak and loudness facts of one rendered track. */
export interface LevelMetrics {
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly crestDb: number;
  readonly dcOffset: number;
}

/** Seam continuity metrics of one loop. */
export interface SeamMetrics {
  readonly stepDb: number;
  readonly stepRatio: number;
  readonly rmsBeforeDb: number;
  readonly rmsAfterDb: number;
  readonly edgeDelta: number;
}

/** RMS in dBFS of a sample range of one channel. */
function rangeRms(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  let count = 0;
  for (let index = Math.max(0, from); index < Math.min(samples.length, to); index += 1) {
    const value = samples[index] ?? 0;
    sum += value * value;
    count += 1;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

/** Median of a numeric array (mutates a copy for sorting). */
function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/** Peak, RMS, crest factor and DC offset over both channels. */
export function measureLevels(buffer: StereoBuffer): LevelMetrics {
  let peak = 0;
  let sum = 0;
  let dcLeft = 0;
  let dcRight = 0;
  const count = buffer.left.length;
  for (let index = 0; index < count; index += 1) {
    const left = buffer.left[index] ?? 0;
    const right = buffer.right[index] ?? 0;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    sum += left * left + right * right;
    dcLeft += left;
    dcRight += right;
  }
  const rms = count === 0 ? 0 : Math.sqrt(sum / (count * 2));
  return {
    peakDb: gainToDb(peak),
    rmsDb: gainToDb(rms),
    crestDb: gainToDb(peak) - gainToDb(rms),
    dcOffset: count === 0 ? 0 : (dcLeft + dcRight) / (count * 2),
  };
}

/** Warms up one loop-overlap analysis window in samples (30 ms). */
function seamWindowSamples(): number {
  return Math.round(0.03 * 48_000);
}

/**
 * Checks the loop seam: compares the wrap step with the local sample-to-sample
 * movement, and reports the RMS of the last/first windows in dBFS.
 */
export function measureSeam(buffer: StereoBuffer): SeamMetrics {
  const count = buffer.left.length;
  const window = Math.min(seamWindowSamples(), Math.floor(count / 4));
  const lastLeft = buffer.left[count - 1] ?? 0;
  const lastRight = buffer.right[count - 1] ?? 0;
  const firstLeft = buffer.left[0] ?? 0;
  const firstRight = buffer.right[0] ?? 0;
  const step = Math.max(Math.abs(firstLeft - lastLeft), Math.abs(firstRight - lastRight));
  const deltas: number[] = [];
  for (let index = 0; index < window; index += 1) {
    deltas.push(
      Math.abs((buffer.left[index + 1] ?? 0) - (buffer.left[index] ?? 0)),
      Math.abs((buffer.right[index + 1] ?? 0) - (buffer.right[index] ?? 0)),
    );
    const tail = count - 2 - index;
    deltas.push(
      Math.abs((buffer.left[tail + 1] ?? 0) - (buffer.left[tail] ?? 0)),
      Math.abs((buffer.right[tail + 1] ?? 0) - (buffer.right[tail] ?? 0)),
    );
  }
  const edgeDelta = median(deltas);
  const rmsBefore = Math.max(
    rangeRms(buffer.left, count - window, count),
    rangeRms(buffer.right, count - window, count),
  );
  const rmsAfter = Math.max(rangeRms(buffer.left, 0, window), rangeRms(buffer.right, 0, window));
  return {
    stepDb: gainToDb(step),
    stepRatio: edgeDelta <= 1e-9 ? (step <= 1e-9 ? 1 : Number.POSITIVE_INFINITY) : step / edgeDelta,
    rmsBeforeDb: gainToDb(rmsBefore),
    rmsAfterDb: gainToDb(rmsAfter),
    edgeDelta,
  };
}

/** RMS in dBFS for each `bars`-long window of a track at the given tempo. */
export function measureSectionDynamics(
  buffer: StereoBuffer,
  bpm: number,
  bars: number,
): readonly number[] {
  const barSamples = Math.round((60 / bpm) * 4 * 48_000);
  const windowSamples = barSamples * bars;
  const values: number[] = [];
  for (let start = 0; start + windowSamples <= buffer.left.length; start += windowSamples) {
    const left = rangeRms(buffer.left, start, start + windowSamples);
    const right = rangeRms(buffer.right, start, start + windowSamples);
    values.push(gainToDb(Math.max(left, right)));
  }
  return values;
}

/** Largest absolute sample value within a tolerance of the buffer end. */
export function tailPeak(buffer: StereoBuffer, seconds: number): number {
  const length = Math.round(seconds * 48_000);
  const from = Math.max(0, buffer.left.length - length);
  let peak = 0;
  for (let index = from; index < buffer.left.length; index += 1) {
    peak = Math.max(peak, Math.abs(buffer.left[index] ?? 0), Math.abs(buffer.right[index] ?? 0));
  }
  return peak;
}
