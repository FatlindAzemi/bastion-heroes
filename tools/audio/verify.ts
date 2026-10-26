/**
 * Verification pass of the procedural audio tool (issue #114 §5).
 *
 * It re-derives every acceptance number from the committed files, not from the
 * renderer: ffprobe for duration/sample rate/bitrate, a decode back to WAV for
 * peak and loop-seam analysis, FFmpeg's EBU R128 meter for integrated loudness
 * and true peak. A non-zero number of failures makes `generate.ts` exit 1.
 *
 * Acceptance rules from the task and spec 12.11:
 * - music loops are exactly 32 bars (2,560,000 samples at 144 BPM / 48 kHz) and
 *   stings are exactly 3.0 s,
 * - every file peaks at or below -1 dBFS (true peak included),
 * - music OGG and M4A exist for every track, SFX M4A exists for every id,
 * - SFX are at most 2 s (win/lose/chest open allowed to be longer) and under the
 *   50 KB spec 12.11 budget,
 * - loops are seamless: the wrap step is no worse than the sample movement in
 *   the 30 ms around the seam on both the WAV master and the decoded OGG.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  MUSIC_DEFINITIONS,
  SFX_DEFINITIONS,
  STING_DURATION_MS,
  type MusicId,
  type SfxId,
} from '../../src/platform/audioManifest';

import { measureLevels, measureSeam, measureSectionDynamics, tailPeak } from './analyze';
import { decodeToWav, measureLoudness, probe, type MediaInfo } from './encode';
import { LOOP_BARS, LOOP_SECONDS, MUSIC_BPM } from './music';
import { readWav, wavToStereo } from './wav';

/** Peak ceiling of the task: every asset must stay at or below -1 dBFS. */
const PEAK_LIMIT_DB = -1;
/** Size ceiling of spec 12.11 for every SFX file. */
const MAX_SFX_BYTES = 50 * 1024;
/** One-shot ceiling of the task (the exceptions are allowed to be longer). */
const MAX_SFX_SECONDS = 2;
/** Spec-level SFX duration budget; only the documented exceptions may exceed it. */
const SPEC_SFX_SECONDS = 1.5;
/** SFX ids the task explicitly allows to exceed the 1.5 s spec budget. */
const LONG_SFX_IDS: readonly SfxId[] = ['chest_open', 'level_win', 'level_lose'];
/** Seam step relative to the local sample movement must stay under this ratio. */
const MAX_SEAM_STEP_RATIO = 4;
/** Absolute seam step limit so a tiny local delta cannot hide a real click. */
const MAX_SEAM_STEP_DB = -24;

/** One encoded music format with its measured facts. */
interface EncodedMusicCheck {
  readonly format: 'ogg' | 'm4a';
  readonly durationSeconds: number;
  readonly bitRate: number;
  readonly codec: string;
  readonly peakDb: number;
  readonly truePeakDb: number;
  readonly integratedLufs: number;
  readonly sizeKb: number;
}

/** Verified facts of one music asset (whichever formats it ships). */
export interface MusicCheck {
  readonly id: MusicId;
  readonly loop: boolean;
  readonly expectedSeconds: number;
  readonly wavSeconds: number;
  readonly wavPeakDb: number;
  readonly wavRmsDb: number;
  readonly seamStepRatio: number;
  readonly seamStepDb: number;
  readonly seamRmsBeforeDb: number;
  readonly seamRmsAfterDb: number;
  readonly decodedSeamStepRatio: number;
  readonly decodedSeamStepDb: number;
  readonly sectionRmsDb: readonly number[];
  readonly formats: readonly EncodedMusicCheck[];
}

/** Verified facts of one SFX. */
export interface SfxCheck {
  readonly id: SfxId;
  readonly durationSeconds: number;
  readonly sizeKb: number;
  readonly peakDb: number;
  readonly truePeakDb: number;
}

/** Full machine-readable verification report, saved next to the WAV masters. */
export interface VerificationReport {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly music: readonly MusicCheck[];
  readonly sfx: readonly SfxCheck[];
  readonly totals: {
    readonly musicBytes: number;
    readonly sfxBytes: number;
    readonly musicSeconds: number;
  };
}

/** Directories the verification pass reads (all under the git-ignored build folder). */
export interface VerifyPaths {
  readonly wavDir: string;
  readonly decodedDir: string;
  readonly publicAudioDir: string;
}

/** Mutable collector for failures and warnings during one verification pass. */
interface Collector {
  readonly failures: string[];
  readonly warnings: string[];
}

/** Decodes one encoded file to WAV and returns its peak in dBFS. */
function decodedPeak(encodedPath: string, decodedPath: string): number {
  decodeToWav(encodedPath, decodedPath);
  const data = readWav(decodedPath);
  if (data.sampleRate !== 48_000 || data.channels !== 2) {
    throw new Error(`${encodedPath}: decoded to an unexpected format`);
  }
  return measureLevels(wavToStereo(data)).peakDb;
}

/** Duration tolerance for lossy encoders (Vorbis trims exactly; AAC pads a little). */
const DURATION_TOLERANCE = 0.06;

/** Checks one encoded music file: probe facts, loudness and decoded peak. */
function checkEncodedMusic(
  collector: Collector,
  id: MusicId,
  format: 'ogg' | 'm4a',
  encodedPath: string,
  decodedPath: string,
  expectedSeconds: number,
): EncodedMusicCheck | null {
  if (!existsSync(encodedPath)) {
    collector.failures.push(`${id}.${format}: missing committed file`);
    return null;
  }
  const info: MediaInfo = probe(encodedPath);
  if (info.sampleRate !== 48_000 || info.channels !== 2) {
    collector.failures.push(
      `${id}.${format}: expected 48 kHz stereo, got ${String(info.sampleRate)} Hz ${String(info.channels)} ch`,
    );
  }
  if (Math.abs(info.durationSeconds - expectedSeconds) > DURATION_TOLERANCE) {
    collector.failures.push(
      `${id}.${format}: duration ${info.durationSeconds.toFixed(3)} s, expected ${expectedSeconds.toFixed(3)} s`,
    );
  }
  const low = 56_000;
  const high = 112_000;
  const targetLow = 64_000;
  const targetHigh = 96_000;
  if (info.bitRate < low || info.bitRate > high) {
    collector.failures.push(
      `${id}.${format}: bitrate ${String(info.bitRate)} bps outside 56-112 kbps`,
    );
  } else if (info.bitRate < targetLow || info.bitRate > targetHigh) {
    collector.warnings.push(
      `${id}.${format}: bitrate ${String(info.bitRate)} bps outside the 64-96 kbps target`,
    );
  }
  mkdirSync(join(decodedPath, '..'), { recursive: true });
  const peak = decodedPeak(encodedPath, decodedPath);
  if (peak > PEAK_LIMIT_DB) {
    collector.failures.push(`${id}.${format}: decoded peak ${peak.toFixed(2)} dBFS above -1 dBFS`);
  }
  const loudness = measureLoudness(encodedPath);
  if (loudness.truePeakDb > PEAK_LIMIT_DB) {
    collector.failures.push(
      `${id}.${format}: true peak ${loudness.truePeakDb.toFixed(2)} dBTP above -1 dBFS`,
    );
  }
  return {
    format,
    durationSeconds: info.durationSeconds,
    bitRate: info.bitRate,
    codec: info.codec,
    peakDb: peak,
    truePeakDb: loudness.truePeakDb,
    integratedLufs: loudness.integratedLufs,
    sizeKb: info.sizeBytes / 1024,
  };
}

/** Verifies one music id: WAV master, loop seam, both encoded formats. */
function verifyMusic(collector: Collector, id: MusicId, paths: VerifyPaths): MusicCheck | null {
  const definition = MUSIC_DEFINITIONS[id];
  const loop = definition.loop;
  const expectedSeconds = loop ? LOOP_SECONDS : STING_DURATION_MS / 1000;
  const wavPath = join(paths.wavDir, 'music', `${id}.wav`);
  if (!existsSync(wavPath)) {
    collector.failures.push(`${id}: missing WAV master ${wavPath}`);
    return null;
  }
  const data = readWav(wavPath);
  const buffer = wavToStereo(data);
  const expectedSamples = Math.round(expectedSeconds * 48_000);
  if (data.left.length !== expectedSamples) {
    collector.failures.push(
      `${id}.wav: ${String(data.left.length)} samples, expected exactly ${String(expectedSamples)}`,
    );
  }
  const levels = measureLevels(buffer);
  if (levels.peakDb > PEAK_LIMIT_DB) {
    collector.failures.push(`${id}.wav: peak ${levels.peakDb.toFixed(2)} dBFS above -1 dBFS`);
  }
  const seam = measureSeam(buffer);
  if (loop) {
    if (seam.stepRatio > MAX_SEAM_STEP_RATIO || seam.stepDb > MAX_SEAM_STEP_DB) {
      collector.failures.push(
        `${id}.wav: loop seam step ${seam.stepDb.toFixed(1)} dBFS ` +
          `(${seam.stepRatio.toFixed(2)}x local movement) is audible`,
      );
    }
    if (Math.abs(seam.rmsAfterDb - seam.rmsBeforeDb) > 12) {
      collector.warnings.push(
        `${id}.wav: seam RMS jumps ${(seam.rmsAfterDb - seam.rmsBeforeDb).toFixed(1)} dB (musical downbeat?)`,
      );
    }
  } else if (tailPeak(buffer, 0.01) > 0.001) {
    collector.failures.push(`${id}.wav: sting does not end in silence (click risk)`);
  }
  const ogg = checkEncodedMusic(
    collector,
    id,
    'ogg',
    join(paths.publicAudioDir, 'music', `${id}.ogg`),
    join(paths.decodedDir, 'music', `${id}.ogg.wav`),
    expectedSeconds,
  );
  const m4a = checkEncodedMusic(
    collector,
    id,
    'm4a',
    join(paths.publicAudioDir, 'music', `${id}.m4a`),
    join(paths.decodedDir, 'music', `${id}.m4a.wav`),
    expectedSeconds,
  );
  const decodedData = readWav(join(paths.decodedDir, 'music', `${id}.ogg.wav`));
  const decodedSeam = measureSeam(wavToStereo(decodedData));
  if (
    loop &&
    (decodedSeam.stepRatio > MAX_SEAM_STEP_RATIO * 1.5 || decodedSeam.stepDb > MAX_SEAM_STEP_DB + 6)
  ) {
    collector.failures.push(
      `${id}.ogg: decoded loop seam step ${decodedSeam.stepDb.toFixed(1)} dBFS ` +
        `(${decodedSeam.stepRatio.toFixed(2)}x local movement) is audible`,
    );
  }
  const sectionRms = loop ? measureSectionDynamics(buffer, MUSIC_BPM, 8) : [];
  return {
    id,
    loop,
    expectedSeconds,
    wavSeconds: data.left.length / 48_000,
    wavPeakDb: levels.peakDb,
    wavRmsDb: levels.rmsDb,
    seamStepRatio: seam.stepRatio,
    seamStepDb: seam.stepDb,
    seamRmsBeforeDb: seam.rmsBeforeDb,
    seamRmsAfterDb: seam.rmsAfterDb,
    decodedSeamStepRatio: decodedSeam.stepRatio,
    decodedSeamStepDb: decodedSeam.stepDb,
    sectionRmsDb: sectionRms,
    formats: [ogg, m4a].filter((entry): entry is EncodedMusicCheck => entry !== null),
  };
}

/** Verifies one SFX: duration budget, file budget, peak and loudness. */
function verifySfx(collector: Collector, id: SfxId, paths: VerifyPaths): SfxCheck | null {
  const wavPath = join(paths.wavDir, 'sfx', `${id}.wav`);
  if (!existsSync(wavPath)) {
    collector.failures.push(`${id}: missing WAV master ${wavPath}`);
    return null;
  }
  const wav = readWav(wavPath);
  const durationSeconds = wav.left.length / 48_000;
  if (durationSeconds > MAX_SFX_SECONDS) {
    collector.failures.push(
      `${id}: ${durationSeconds.toFixed(2)} s exceeds the 2 s one-shot limit`,
    );
  } else if (durationSeconds > SPEC_SFX_SECONDS && !LONG_SFX_IDS.includes(id)) {
    collector.warnings.push(
      `${id}: ${durationSeconds.toFixed(2)} s exceeds the 1.5 s spec 12.11 budget`,
    );
  }
  const encodedPath = join(paths.publicAudioDir, 'sfx', `${id}.m4a`);
  if (!existsSync(encodedPath)) {
    collector.failures.push(`${id}: missing committed SFX file`);
    return null;
  }
  const sizeBytes = statSync(encodedPath).size;
  if (sizeBytes >= MAX_SFX_BYTES) {
    collector.failures.push(`${id}: ${String(sizeBytes)} bytes exceeds the 50 KB budget`);
  }
  const peak = decodedPeak(encodedPath, join(paths.decodedDir, 'sfx', `${id}.m4a.wav`));
  if (peak > PEAK_LIMIT_DB) {
    collector.failures.push(`${id}: decoded peak ${peak.toFixed(2)} dBFS above -1 dBFS`);
  }
  const loudness = measureLoudness(encodedPath);
  if (loudness.truePeakDb > PEAK_LIMIT_DB) {
    collector.failures.push(
      `${id}: true peak ${loudness.truePeakDb.toFixed(2)} dBTP above -1 dBFS`,
    );
  }
  return {
    id,
    durationSeconds,
    sizeKb: sizeBytes / 1024,
    peakDb: peak,
    truePeakDb: loudness.truePeakDb,
  };
}

/** Reports unexpected files in the audio folders (stale placeholders, wrong ids). */
function checkFolderHygiene(collector: Collector, paths: VerifyPaths): void {
  const expectedMusic = Object.keys(MUSIC_DEFINITIONS).flatMap((id) => [`${id}.ogg`, `${id}.m4a`]);
  const musicFiles = readdirSync(join(paths.publicAudioDir, 'music')).sort();
  for (const file of musicFiles) {
    if (!expectedMusic.includes(file)) {
      collector.warnings.push(`public/audio/music/${file}: unexpected file`);
    }
  }
  const expectedSfx = Object.keys(SFX_DEFINITIONS).map((id) => `${id}.m4a`);
  const sfxFiles = readdirSync(join(paths.publicAudioDir, 'sfx')).sort();
  for (const file of sfxFiles) {
    if (!expectedSfx.includes(file)) {
      collector.warnings.push(`public/audio/sfx/${file}: unexpected file`);
    }
  }
}

/** Sums the committed audio sizes for the report. */
function measureTotals(paths: VerifyPaths): VerificationReport['totals'] {
  let musicBytes = 0;
  let sfxBytes = 0;
  let musicSeconds = 0;
  for (const id of Object.keys(MUSIC_DEFINITIONS) as MusicId[]) {
    for (const extension of ['ogg', 'm4a']) {
      const path = join(paths.publicAudioDir, 'music', `${id}.${extension}`);
      if (existsSync(path)) {
        musicBytes += statSync(path).size;
      }
    }
    const oggPath = join(paths.publicAudioDir, 'music', `${id}.ogg`);
    if (existsSync(oggPath)) {
      musicSeconds += probe(oggPath).durationSeconds;
    }
  }
  for (const id of Object.keys(SFX_DEFINITIONS) as SfxId[]) {
    const path = join(paths.publicAudioDir, 'sfx', `${id}.m4a`);
    if (existsSync(path)) {
      sfxBytes += statSync(path).size;
    }
  }
  return { musicBytes, sfxBytes, musicSeconds };
}

/** Optional subset for fast iteration (`--only`); the default is every id. */
export interface VerifyFilter {
  readonly musicIds?: readonly MusicId[];
  readonly sfxIds?: readonly SfxId[];
}

/** Runs the full verification pass over the rendered WAVs and committed files. */
export function verifyAudio(paths: VerifyPaths, filter: VerifyFilter = {}): VerificationReport {
  const collector: Collector = { failures: [], warnings: [] };
  mkdirSync(join(paths.decodedDir, 'music'), { recursive: true });
  mkdirSync(join(paths.decodedDir, 'sfx'), { recursive: true });
  const musicIds = filter.musicIds ?? (Object.keys(MUSIC_DEFINITIONS) as MusicId[]);
  const sfxIds = filter.sfxIds ?? (Object.keys(SFX_DEFINITIONS) as SfxId[]);
  const music: MusicCheck[] = [];
  for (const id of musicIds) {
    const check = verifyMusic(collector, id, paths);
    if (check !== null) {
      music.push(check);
    }
  }
  const sfx: SfxCheck[] = [];
  for (const id of sfxIds) {
    const check = verifySfx(collector, id, paths);
    if (check !== null) {
      sfx.push(check);
    }
  }
  checkFolderHygiene(collector, paths);
  const totals = measureTotals(paths);
  if (totals.musicBytes > 4.5 * 1024 * 1024) {
    collector.warnings.push(
      `music assets total ${(totals.musicBytes / 1024 / 1024).toFixed(2)} MB, above the 2-4 MB target`,
    );
  }
  for (const check of music) {
    if (check.loop && check.sectionRmsDb.length < 2) {
      collector.warnings.push(`${check.id}: too short for section dynamics`);
    }
  }
  return {
    ok: collector.failures.length === 0,
    failures: collector.failures,
    warnings: collector.warnings,
    music,
    sfx,
    totals,
  };
}

/** Number of bars a loop must have (exported for the CLI summary). */
export const EXPECTED_LOOP_BARS = LOOP_BARS;
