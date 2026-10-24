/**
 * Pure geometry of the shared particle sprite sheet (spec 9.7): a 4x2 grid of
 * 128 px cells in a 512x512 texture. No three.js import, so the mapping is
 * unit-tested without a renderer.
 */

/** Columns and rows of the sprite sheet atlas. */
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 4;
export const ATLAS_WIDTH = 512;
export const ATLAS_HEIGHT = 512;
export const CELL_SIZE = 128;

/** UV rectangle of one atlas cell in 0..1 texture coordinates (v grows upward). */
export interface SpriteCellRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** Number of cells in the 4x2 atlas (six used, two spares for later VFX). */
export function atlasCellCount(): number {
  return ATLAS_COLUMNS * ATLAS_ROWS;
}

/** UV rectangle of an atlas cell; row 0 is the top row of the image. */
export function spriteCellRect(cell: number): SpriteCellRect {
  const column = cell % ATLAS_COLUMNS;
  const row = Math.floor(cell / ATLAS_COLUMNS);
  const u0 = (column * CELL_SIZE) / ATLAS_WIDTH;
  const u1 = ((column + 1) * CELL_SIZE) / ATLAS_WIDTH;
  // Texture v grows upward while the PNG rows grow downward, so row 0 is at the top.
  const v1 = 1 - (row * CELL_SIZE) / ATLAS_HEIGHT;
  const v0 = 1 - ((row + 1) * CELL_SIZE) / ATLAS_HEIGHT;
  return { u0, v0, u1, v1 };
}
