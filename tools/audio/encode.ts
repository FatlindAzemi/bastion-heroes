/**
 * FFmpeg encoding and probing for the procedural audio tool (issue #114 §5).
 *
 * The tool renders 48 kHz stereo WAV masters into the git-ignored
 * `assets-build/audio/wav` folder and then encodes them into the committed game
 * files that `src/platform/audioManifest.ts` references:
 *
 *   music: <id>.wav -> public/audio/music/<id>.ogg  (Ogg Vorbis, native encoder)
 *                   -> public/audio/music/<id>.m4a  (AAC, Howler's first source)
 *   sfx:   <id>.wav -> public/audio/sfx/<id>.m4a    (AAC)
 *
 * FFmpeg's bundled native Vorbis encoder is experimental and only accepts 48 kHz
 * stereo, which is one reason the synth renders at 48 kHz in the first place; it
 * has no libvorbis on this machine (the same limitation the old placeholder
 * pipeline documented).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

/** FFmpeg binary, overridable like the old asset pipeline (`FFMPEG_PATH`). */
export const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
/** FFprobe binary, overridable with `FFPROBE_PATH`. */
export const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';
/** Ogg Vorbis quality; tuned so the music lands around 64-96 kbps. */
const MUSIC_OGG_QUALITY = process.env.AUDIO_OGG_QUALITY ?? '3';
/** AAC bitrate of the M4A music fallback and of the SFX. */
const MUSIC_M4A_BITRATE = '80k';
const SFX_M4A_BITRATE = '96k';
/**
 * AAC encoder. FFmpeg's native `aac` encoder overshoots on sharp transients
 * (some arcade SFX decoded above 0 dBFS), so the AudioToolbox encoder
 * (`aac_at`, available in the macOS FFmpeg builds this repo uses) is preferred
 * and the native one is the portable fallback. Override with AUDIO_AAC_ENCODER.
 */
const AAC_ENCODER = process.env.AUDIO_AAC_ENCODER ?? detectAacEncoder();

/** Picks `aac_at` when this FFmpeg build has it, else the native `aac` encoder. */
function detectAacEncoder(): string {
  const result = spawnSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (result.status === 0 && /\baac_at\b/.test(result.stdout)) {
    return 'aac_at';
  }
  return 'aac';
}

/** Result of one external command; throws when the process fails. */
function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.error !== undefined) {
    throw new Error(`could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

/** Metadata of one encoded file, read through ffprobe. */
export interface MediaInfo {
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly codec: string;
  readonly bitRate: number;
  readonly sizeBytes: number;
}

/** Reads duration, format and stream facts of one media file. */
export function probe(path: string): MediaInfo {
  const output = run(FFPROBE, [
    '-v',
    'error',
    '-show_entries',
    'format=duration,bit_rate,size',
    '-show_entries',
    'stream=codec_name,sample_rate,channels',
    '-of',
    'json',
    path,
  ]);
  const parsed = JSON.parse(output) as {
    streams?: { codec_name?: string; sample_rate?: string; channels?: number }[];
    format?: { duration?: string; bit_rate?: string; size?: string };
  };
  const stream = parsed.streams?.[0] ?? {};
  return {
    durationSeconds: Number.parseFloat(parsed.format?.duration ?? '0'),
    sampleRate: Number.parseInt(stream.sample_rate ?? '0', 10),
    channels: stream.channels ?? 0,
    codec: stream.codec_name ?? 'unknown',
    bitRate: Number.parseInt(parsed.format?.bit_rate ?? '0', 10),
    sizeBytes: statSync(path).size,
  };
}

/** Ogg CRC-32 lookup table (poly 0x04c11db7, no reflection, init 0). */
const OGG_CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let remainder = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      remainder = (remainder & 0x80000000) !== 0 ? (remainder << 1) ^ 0x04c11db7 : remainder << 1;
    }
    table[index] = remainder >>> 0;
  }
  return table;
})();

/** Ogg page checksum over one page with its CRC field zeroed. */
function oggCrc(data: Buffer, offset: number, length: number): number {
  let crc = 0;
  for (let index = 0; index < length; index += 1) {
    const byte = data[offset + index] ?? 0;
    crc = ((crc << 8) ^ (OGG_CRC_TABLE[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  }
  return crc >>> 0;
}

/**
 * Rewrites every Ogg page with the given stream serial and a recomputed CRC.
 *
 * FFmpeg's Ogg muxer picks a random bitstream serial per run, which would make the
 * committed OGG bytes differ on every rebuild even though the Vorbis payload is
 * identical. Normalising the serial (the only random field) keeps the generator
 * byte-reproducible and is a pure container edit: the audio stream is untouched,
 * and verification decodes the rewritten files again.
 */
export function normalizeOggSerial(path: string, serial = 0x4845524f): number {
  const data = readFileSync(path);
  let offset = 0;
  let pages = 0;
  while (offset + 27 <= data.length) {
    if (data.toString('ascii', offset, offset + 4) !== 'OggS') {
      throw new Error(`${path}: unexpected Ogg page at byte ${String(offset)}`);
    }
    const segments = data[offset + 26] ?? 0;
    let payload = 0;
    for (let index = 0; index < segments; index += 1) {
      payload += data[offset + 27 + index] ?? 0;
    }
    const pageLength = 27 + segments + payload;
    if (offset + pageLength > data.length) {
      throw new Error(`${path}: truncated Ogg page at byte ${String(offset)}`);
    }
    data.writeUInt32LE(serial, offset + 14);
    data.writeUInt32LE(0, offset + 22);
    data.writeUInt32LE(oggCrc(data, offset, pageLength), offset + 22);
    offset += pageLength;
    pages += 1;
  }
  if (offset !== data.length) {
    throw new Error(`${path}: trailing bytes after the last Ogg page`);
  }
  writeFileSync(path, data);
  return pages;
}

/** Encodes one WAV master into the committed Ogg Vorbis music file. */
export function encodeMusicOgg(
  wavPath: string,
  outputPath: string,
  quality = MUSIC_OGG_QUALITY,
): void {
  run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-i',
    wavPath,
    '-c:a',
    'vorbis',
    '-strict',
    '-2',
    '-q:a',
    quality,
    '-ar',
    '48000',
    '-ac',
    '2',
    outputPath,
  ]);
  normalizeOggSerial(outputPath);
}

/** Encodes one WAV master into the committed AAC/M4A music file. */
export function encodeMusicM4a(wavPath: string, outputPath: string): void {
  run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-i',
    wavPath,
    '-c:a',
    AAC_ENCODER,
    '-b:a',
    MUSIC_M4A_BITRATE,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

/** Encodes one SFX WAV master into the committed AAC/M4A file. */
export function encodeSfxM4a(wavPath: string, outputPath: string): void {
  run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-i',
    wavPath,
    '-c:a',
    AAC_ENCODER,
    '-b:a',
    SFX_M4A_BITRATE,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

/** Decodes an encoded file back to a 16-bit PCM WAV for the verification pass. */
export function decodeToWav(inputPath: string, outputPath: string): void {
  run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-i',
    inputPath,
    '-c:a',
    'pcm_s16le',
    '-ar',
    '48000',
    '-ac',
    '2',
    outputPath,
  ]);
}

/** Loudness facts measured with FFmpeg's EBU R128 meter. */
export interface LoudnessInfo {
  readonly integratedLufs: number;
  readonly truePeakDb: number;
}

/** Measures integrated loudness and true peak of one encoded file. */
export function measureLoudness(path: string): LoudnessInfo {
  const result = spawnSync(
    FFMPEG,
    ['-v', 'info', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`could not measure loudness of ${path}: ${result.stderr.trim()}`);
  }
  const integrated = [...result.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  const truePeak = [...result.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)];
  const lastIntegrated = integrated.at(-1)?.[1];
  const lastTruePeak = truePeak.at(-1)?.[1];
  if (lastIntegrated === undefined || lastTruePeak === undefined) {
    throw new Error(`could not parse the EBU R128 summary of ${path}`);
  }
  return {
    integratedLufs: Number.parseFloat(lastIntegrated),
    truePeakDb: Number.parseFloat(lastTruePeak),
  };
}

/** Human-readable size of one file. */
export function kilobytes(path: string): string {
  return `${(statSync(path).size / 1024).toFixed(1)} KB`;
}
