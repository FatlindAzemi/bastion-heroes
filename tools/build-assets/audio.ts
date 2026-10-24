/**
 * Converts the CC0 placeholder audio sources of spec 12.11 into the committed
 * `public/audio/` files and enforces the audio budgets:
 *
 *   assets-src/audio/music/<id>.wav -> public/audio/music/<id>.m4a + <id>.ogg  (AAC 128 kbps)
 *   assets-src/audio/sfx/<id>.wav   -> public/audio/sfx/<id>.m4a              (AAC 96 kbps)
 *
 * SFX must stay under 1.5 s and 50 KB each (spec 12.11). Music is encoded twice
 * because spec 9.9 asks for OGG and M4A; Howler picks the first supported source.
 *
 * Run it with `npx tsx tools/build-assets/audio.ts` (ffmpeg must be on PATH; override
 * with FFMPEG_PATH/FFPROBE_PATH). The WAV sources and their exact derivation from the
 * Kenney packs are documented in assets-src/audio/README.md.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  MUSIC_DEFINITIONS,
  SFX_DEFINITIONS,
  type MusicId,
  type SfxId,
} from '../../src/platform/audioManifest';

const SOURCE_DIR = 'assets-src/audio';
const OUTPUT_DIR = 'public/audio';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';
const MUSIC_BITRATE = '128k';
const SFX_BITRATE = '96k';
const MAX_SFX_SECONDS = 1.5;
const MAX_SFX_BYTES = 50 * 1024;

/** Runs one external command and fails with its stderr when it fails. */
function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.error !== undefined) {
    throw new Error(`could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr.trim()}`);
  }
}

/** Duration of an audio file in seconds, through ffprobe. */
function durationSeconds(path: string): number {
  const result = spawnSync(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' },
  );
  if (result.error !== undefined) {
    throw new Error(`could not run ${FFPROBE}: ${result.error.message}`);
  }
  const seconds = Number.parseFloat(result.stdout.trim());
  if (result.status !== 0 || Number.isNaN(seconds)) {
    throw new Error(`${path}: ffprobe failed (${result.stderr.trim()})`);
  }
  return seconds;
}

/** Encodes one music WAV into the M4A and OGG files the app ships. */
function encodeMusic(id: MusicId): void {
  const source = join(SOURCE_DIR, 'music', `${id}.wav`);
  const m4a = join(OUTPUT_DIR, 'music', `${id}.m4a`);
  const ogg = join(OUTPUT_DIR, 'music', `${id}.ogg`);
  run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-i',
    source,
    '-c:a',
    'aac',
    '-b:a',
    MUSIC_BITRATE,
    '-ar',
    '44100',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    m4a,
  ]);
  // The bundled ffmpeg has no libvorbis, so use its native Vorbis encoder (`-strict -2`)
  // rather than fail the build; the tracks are placeholders either way (spec 9.9).
  // FFmpeg's native Vorbis encoder is experimental and only accepts 48 kHz stereo, so
  // resample here; the file is a placeholder either way (spec 9.9).
  run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-i',
    source,
    '-c:a',
    'vorbis',
    '-strict',
    '-2',
    '-q:a',
    '4',
    '-ar',
    '48000',
    '-ac',
    '2',
    ogg,
  ]);
  const seconds = durationSeconds(m4a);
  if (MUSIC_DEFINITIONS[id].loop && seconds < 5) {
    throw new Error(`${m4a}: music loop is only ${seconds.toFixed(2)} s`);
  }
  console.log(`audio: music ${id}: ${seconds.toFixed(2)} s, ${kilobytes(m4a)} (m4a) + ogg`);
}

/** Encodes one SFX WAV and enforces the spec 12.11 duration/size budget. */
function encodeSfx(id: SfxId): void {
  const source = join(SOURCE_DIR, 'sfx', `${id}.wav`);
  const output = join(OUTPUT_DIR, 'sfx', `${id}.m4a`);
  run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-i',
    source,
    '-c:a',
    'aac',
    '-b:a',
    SFX_BITRATE,
    '-ar',
    '44100',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    output,
  ]);
  const seconds = durationSeconds(output);
  const bytes = statSync(output).size;
  if (seconds > MAX_SFX_SECONDS || bytes >= MAX_SFX_BYTES) {
    throw new Error(
      `${output}: ${seconds.toFixed(2)} s / ${kilobytes(output)} exceeds the ` +
        `${MAX_SFX_SECONDS} s / 50 KB SFX budget of spec 12.11`,
    );
  }
  console.log(`audio: sfx ${id}: ${seconds.toFixed(2)} s, ${kilobytes(output)}`);
}

/** Human-readable size of one file. */
function kilobytes(path: string): string {
  return `${(statSync(path).size / 1024).toFixed(1)} KB`;
}

/** Encodes every catalogued music track and SFX, then prints the output sizes. */
function main(): void {
  mkdirSync(join(OUTPUT_DIR, 'music'), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'sfx'), { recursive: true });
  for (const id of Object.keys(MUSIC_DEFINITIONS) as MusicId[]) {
    encodeMusic(id);
  }
  for (const id of Object.keys(SFX_DEFINITIONS) as SfxId[]) {
    encodeSfx(id);
  }
  console.log(
    `audio: ok - ${Object.keys(MUSIC_DEFINITIONS).length} music tracks, ` +
      `${Object.keys(SFX_DEFINITIONS).length} SFX within the spec 12.11 budget`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `audio: FAILED - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
