/**
 * Minimal 16-bit PCM WAV reader/writer for the procedural audio tool (issue #114 §5).
 *
 * The tool writes the uncompressed masters into the git-ignored `assets-build/audio/wav`
 * folder, so it needs a writer for the synth output and a reader for FFmpeg's decoded
 * OGG/M4A output that the verification pass analyses. Only PCM 16-bit mono/stereo is
 * supported: that is exactly what the tool itself writes and what it asks FFmpeg to
 * decode to with `-c:a pcm_s16le`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { SAMPLE_RATE, type StereoBuffer } from './dsp';

/** Decoded WAV: sample rate, channel count and the left/right sample data. */
export interface WavData {
  readonly sampleRate: number;
  readonly channels: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
}

/** Rounds and clamps a float sample to signed 16-bit PCM. */
function toPcm16(sample: number): number {
  const rounded = Math.round(sample * 32767);
  return Math.max(-32768, Math.min(32767, rounded));
}

/** Writes a stereo buffer as a 16-bit PCM WAV file. */
export function writeWav(path: string, buffer: StereoBuffer, sampleRate = SAMPLE_RATE): void {
  const frames = buffer.left.length;
  const dataBytes = frames * 4;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(2, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 4, 28);
  output.writeUInt16LE(4, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    output.writeInt16LE(toPcm16(buffer.left[frame] ?? 0), 44 + frame * 4);
    output.writeInt16LE(toPcm16(buffer.right[frame] ?? 0), 46 + frame * 4);
  }
  writeFileSync(path, output);
}

/** Parses the `fmt ` chunk: returns sample rate, channels and bits per sample. */
function parseFormat(buffer: Buffer, offset: number): { channels: number; sampleRate: number } {
  const channels = buffer.readUInt16LE(offset + 2);
  const sampleRate = buffer.readUInt32LE(offset + 4);
  const bits = buffer.readUInt16LE(offset + 14);
  if (buffer.readUInt16LE(offset) !== 1 || bits !== 16 || channels < 1 || channels > 2) {
    throw new Error(`unsupported WAV format: ${String(channels)} channels, ${String(bits)} bits`);
  }
  return { channels, sampleRate };
}

/** Reads a 16-bit PCM WAV (mono files are duplicated to both channels). */
export function readWav(path: string): WavData {
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path}: not a RIFF/WAVE file`);
  }
  let channels = 0;
  let sampleRate = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      const format = parseFormat(buffer, offset + 8);
      channels = format.channels;
      sampleRate = format.sampleRate;
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataBytes = Math.min(chunkSize, buffer.length - dataOffset);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0 || channels === 0) {
    throw new Error(`${path}: missing fmt/data chunk`);
  }
  const frames = Math.floor(dataBytes / (channels * 2));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const position = dataOffset + frame * channels * 2;
    left[frame] = buffer.readInt16LE(position) / 32768;
    right[frame] = channels === 2 ? buffer.readInt16LE(position + 2) / 32768 : (left[frame] ?? 0);
  }
  return { sampleRate, channels, left, right };
}

/** Converts decoded WAV data to the stereo buffer shape the analysis helpers expect. */
export function wavToStereo(data: WavData): StereoBuffer {
  return { left: data.left, right: data.right };
}
