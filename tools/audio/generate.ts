/**
 * Procedural audio renderer of Bastion Heroes (issue #114 §5): the soundtrack of
 * World 1 plus all 36 arcade SFX, synthesised from scratch, encoded and verified.
 *
 * Usage (the Lead adds this to package.json as `"audio": "tsx tools/audio/generate.ts"`):
 *
 *   npm run audio                       render everything, encode, verify
 *   npx tsx tools/audio/generate.ts --only=menu,orb_collect   fast iteration on a subset
 *   npx tsx tools/audio/generate.ts --skip-encode             WAV masters only
 *   npx tsx tools/audio/generate.ts --skip-verify             render + encode only
 *   npx tsx tools/audio/generate.ts --verify-only             verify the committed files only
 *
 * The WAV masters and decoded verification copies live in the git-ignored
 * `assets-build/audio/` folder; only `public/audio/**` is committed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MUSIC_DEFINITIONS,
  SFX_DEFINITIONS,
  type MusicId,
  type SfxId,
} from '../../src/platform/audioManifest';

import { encodeMusicM4a, encodeMusicOgg, encodeSfxM4a, kilobytes, probe } from './encode';
import { renderMusic } from './music';
import { renderSfx } from './sfx';
import { verifyAudio, type VerificationReport } from './verify';
import { writeWav } from './wav';

/** Git-ignored build folder for the uncompressed masters. */
const WAV_DIR = 'assets-build/audio/wav';
/** Git-ignored build folder for the decoded lossy files used by verification. */
const DECODED_DIR = 'assets-build/audio/decoded';
/** Committed audio lives here (referenced by src/platform/audioManifest.ts). */
const PUBLIC_AUDIO_DIR = 'public/audio';
/** Machine-readable verification report for the PR. */
const REPORT_PATH = 'assets-build/audio/verification.json';

/** All music ids of the manifest, in catalogue order. */
const MUSIC_IDS = Object.keys(MUSIC_DEFINITIONS) as MusicId[];
/** All SFX ids of the manifest, in catalogue order. */
const SFX_IDS = Object.keys(SFX_DEFINITIONS) as SfxId[];

/** Command line switches, parsed once. */
interface Options {
  readonly only: ReadonlySet<string>;
  readonly skipEncode: boolean;
  readonly skipVerify: boolean;
  readonly verifyOnly: boolean;
}

/** Parses `--only=...`, `--skip-encode` and `--skip-verify`. */
function parseOptions(argv: readonly string[]): Options {
  let only = new Set<string>();
  let skipEncode = false;
  let skipVerify = false;
  let verifyOnly = false;
  for (const argument of argv) {
    if (argument.startsWith('--only=')) {
      only = new Set(argument.slice('--only='.length).split(',').filter(Boolean));
    } else if (argument === '--skip-encode') {
      skipEncode = true;
    } else if (argument === '--skip-verify') {
      skipVerify = true;
    } else if (argument === '--verify-only') {
      verifyOnly = true;
    } else if (argument !== '--') {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { only, skipEncode, skipVerify, verifyOnly };
}

/** Music ids selected by `--only` (empty means all). */
function selectedMusic(options: Options): readonly MusicId[] {
  if (options.only.size === 0) {
    return MUSIC_IDS;
  }
  return MUSIC_IDS.filter((id) => options.only.has(id));
}

/** SFX ids selected by `--only` (empty means all). */
function selectedSfx(options: Options): readonly SfxId[] {
  if (options.only.size === 0) {
    return SFX_IDS;
  }
  return SFX_IDS.filter((id) => options.only.has(id));
}

/** Renders every selected music track and writes its WAV master. */
function renderMusicMasters(options: Options): readonly { id: MusicId; seconds: number }[] {
  const results: { id: MusicId; seconds: number }[] = [];
  mkdirSync(join(WAV_DIR, 'music'), { recursive: true });
  for (const id of selectedMusic(options)) {
    const started = Date.now();
    const rendered = renderMusic(id);
    const path = join(WAV_DIR, 'music', `${id}.wav`);
    writeWav(path, rendered.audio);
    const elapsed = ((Date.now() - started) / 1000).toFixed(2);
    const loop = MUSIC_DEFINITIONS[id].loop ? 'loop' : 'sting';
    console.log(
      `audio: rendered ${id} (${loop}, ${rendered.seconds.toFixed(3)} s) in ${elapsed} s`,
    );
    results.push({ id, seconds: rendered.seconds });
  }
  return results;
}

/** Renders every selected SFX and writes its WAV master. */
function renderSfxMasters(options: Options): readonly { id: SfxId; seconds: number }[] {
  const results: { id: SfxId; seconds: number }[] = [];
  mkdirSync(join(WAV_DIR, 'sfx'), { recursive: true });
  for (const id of selectedSfx(options)) {
    const rendered = renderSfx(id);
    writeWav(join(WAV_DIR, 'sfx', `${id}.wav`), rendered.audio);
    results.push({ id, seconds: rendered.seconds });
  }
  console.log(`audio: rendered ${String(results.length)} SFX`);
  return results;
}

/** Encodes every selected WAV master into the committed game files. */
function encodeMasters(options: Options): void {
  mkdirSync(join(PUBLIC_AUDIO_DIR, 'music'), { recursive: true });
  mkdirSync(join(PUBLIC_AUDIO_DIR, 'sfx'), { recursive: true });
  for (const id of selectedMusic(options)) {
    const wav = join(WAV_DIR, 'music', `${id}.wav`);
    const ogg = join(PUBLIC_AUDIO_DIR, 'music', `${id}.ogg`);
    const m4a = join(PUBLIC_AUDIO_DIR, 'music', `${id}.m4a`);
    // A 3 s fanfare is spectrally dense; q3 pushes its Vorbis bitrate past 96 kbps.
    encodeMusicOgg(wav, ogg, MUSIC_DEFINITIONS[id].loop ? undefined : '2');
    encodeMusicM4a(wav, m4a);
    console.log(
      `audio: encoded music/${id}: ${kilobytes(ogg)} ogg (${probe(ogg).bitRate} bps), ` +
        `${kilobytes(m4a)} m4a (${probe(m4a).bitRate} bps)`,
    );
  }
  for (const id of selectedSfx(options)) {
    const output = join(PUBLIC_AUDIO_DIR, 'sfx', `${id}.m4a`);
    encodeSfxM4a(join(WAV_DIR, 'sfx', `${id}.wav`), output);
  }
  console.log(`audio: encoded ${String(selectedSfx(options).length)} SFX to public/audio/sfx`);
}

/** Prints the verification tables and the one-line verdict. */
function printReport(report: VerificationReport): void {
  console.log('\naudio: music');
  for (const check of report.music) {
    const formats = check.formats
      .map(
        (entry) =>
          `${entry.format} ${entry.durationSeconds.toFixed(2)}s ${(entry.bitRate / 1000).toFixed(0)}k ` +
          `pk ${entry.peakDb.toFixed(1)} tp ${entry.truePeakDb.toFixed(1)} ` +
          `I ${entry.integratedLufs.toFixed(1)} LUFS ${entry.sizeKb.toFixed(0)}KB`,
      )
      .join(' | ');
    const seam = check.loop
      ? `seam ${check.seamStepDb.toFixed(1)}dB (${check.seamStepRatio.toFixed(2)}x) ` +
        `ogg ${check.decodedSeamStepDb.toFixed(1)}dB (${check.decodedSeamStepRatio.toFixed(2)}x)`
      : `tail-silent`;
    console.log(`  ${check.id.padEnd(16)} ${check.wavSeconds.toFixed(3)}s ${seam}`);
    console.log(`  ${' '.repeat(16)} ${formats}`);
  }
  console.log('\naudio: sfx');
  const sfxLine = report.sfx
    .map(
      (check) =>
        `${check.id} ${check.durationSeconds.toFixed(2)}s ${check.peakDb.toFixed(1)}dB ${check.sizeKb.toFixed(0)}KB`,
    )
    .join('\n  ');
  console.log(`  ${sfxLine}`);
  console.log(
    `\naudio: totals ${(report.totals.musicBytes / 1024 / 1024).toFixed(2)} MB music + ` +
      `${(report.totals.sfxBytes / 1024).toFixed(0)} KB sfx`,
  );
  for (const warning of report.warnings) {
    console.log(`audio: warning: ${warning}`);
  }
  for (const failure of report.failures) {
    console.log(`audio: FAILURE: ${failure}`);
  }
  console.log(report.ok ? '\naudio: verification PASSED' : '\naudio: verification FAILED');
}

/** Runs render -> encode -> verify and returns the process exit code. */
function main(argv: readonly string[]): number {
  const options = parseOptions(argv);
  mkdirSync('assets-build/audio', { recursive: true });
  const music: { id: MusicId; seconds: number }[] = options.verifyOnly
    ? selectedMusic(options).map((id) => ({ id, seconds: 0 }))
    : [...renderMusicMasters(options)];
  const sfx: { id: SfxId; seconds: number }[] = options.verifyOnly
    ? selectedSfx(options).map((id) => ({ id, seconds: 0 }))
    : [...renderSfxMasters(options)];
  if (!options.skipEncode && !options.verifyOnly) {
    encodeMasters(options);
  }
  let exitCode = 0;
  if (!options.skipVerify) {
    const report = verifyAudio(
      { wavDir: WAV_DIR, decodedDir: DECODED_DIR, publicAudioDir: PUBLIC_AUDIO_DIR },
      {
        musicIds: music.map((entry) => entry.id),
        sfxIds: sfx.map((entry) => entry.id),
      },
    );
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    printReport(report);
    console.log(`audio: report written to ${REPORT_PATH}`);
    exitCode = report.ok ? 0 : 1;
  }
  return exitCode;
}

process.exitCode = main(process.argv.slice(2));
