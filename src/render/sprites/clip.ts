/**
 * Sprite clip playback and atlas UV maths (issue #114).
 *
 * Pure functions without three.js or WebGL, so the frame timing and the
 * row-major frame -> UV mapping are unit-tested in Node. The layer only calls
 * these and writes the results into shader uniforms.
 */
import type { SpriteClip } from './types';

/** Floating point tolerance so a sample exactly on a frame boundary hits that frame. */
const STEP_EPSILON = 1e-6;

/** A UV rectangle inside the sheet; (u0, v0) is the flipped bottom-left corner. */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** How long one pass of the clip takes in seconds at the given playback rate. */
export function clipDurationSeconds(clip: SpriteClip, playbackRate = 1): number {
  if (!(clip.fps > 0) || !(playbackRate > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  return clip.frames.length / (clip.fps * playbackRate);
}

/**
 * Frame index of a clip at `elapsedSeconds`: loops wrap, one-shot clips hold their
 * last frame after the end, a zero playback rate freezes the first frame (frozen
 * enemies of spec 4.5 do not animate).
 */
export function clipFrameAt(clip: SpriteClip, elapsedSeconds: number, playbackRate = 1): number {
  const first = clip.frames[0];
  if (first === undefined) {
    return 0;
  }
  if (!(playbackRate > 0) || !(clip.fps > 0)) {
    return first;
  }
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const step = Math.floor(elapsed * clip.fps * playbackRate + STEP_EPSILON);
  if (clip.loop) {
    return clip.frames[step % clip.frames.length] ?? first;
  }
  const last = clip.frames.length - 1;
  return clip.frames[Math.min(step, last)] ?? first;
}

/** Number of frame rows in a real sheet image, derived from its pixel height. */
export function sheetRowCount(sheetHeight: number, frameHeight: number): number {
  if (!(sheetHeight > 0) || !(frameHeight > 0)) {
    return 1;
  }
  return Math.max(1, Math.floor(sheetHeight / frameHeight));
}

/** Number of frames available in a sheet grid. */
export function sheetFrameCount(columns: number, rows: number): number {
  if (!(columns > 0) || !(rows > 0)) {
    return 0;
  }
  return Math.floor(columns) * Math.floor(rows);
}

/** Clamps a manifest frame index into the frame count of the real sheet image. */
export function clampFrameToSheet(frame: number, columns: number, rows: number): number {
  const count = sheetFrameCount(columns, rows);
  if (count <= 0) {
    return 0;
  }
  const safe = Number.isFinite(frame) ? Math.floor(frame) : 0;
  return Math.max(0, Math.min(safe, count - 1));
}

/**
 * UV rectangle of one row-major frame. Three.js uploads images with `flipY` on, so
 * the v axis is mirrored: row 0 (top of the image) maps to the highest v values.
 */
export function frameUvRect(
  frame: number,
  columns: number,
  frameWidth: number,
  frameHeight: number,
  sheetWidth: number,
  sheetHeight: number,
  out: UvRect,
): UvRect {
  if (!(frameWidth > 0) || !(frameHeight > 0) || !(sheetWidth > 0) || !(sheetHeight > 0)) {
    out.u0 = 0;
    out.v0 = 0;
    out.u1 = 0;
    out.v1 = 0;
    return out;
  }
  const safeColumns = Math.max(1, Math.floor(columns));
  const rows = sheetRowCount(sheetHeight, frameHeight);
  const safeFrame = clampFrameToSheet(frame, safeColumns, rows);
  const col = safeFrame % safeColumns;
  const row = Math.floor(safeFrame / safeColumns);
  const du = frameWidth > 0 && sheetWidth > 0 ? frameWidth / sheetWidth : 0;
  const dv = frameHeight > 0 && sheetHeight > 0 ? frameHeight / sheetHeight : 0;
  out.u0 = col * du;
  out.u1 = Math.min(1, out.u0 + du);
  out.v1 = 1 - row * dv;
  out.v0 = Math.max(0, out.v1 - dv);
  return out;
}
