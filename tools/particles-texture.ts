/**
 * Generates the shared 512x512 particle sprite sheet of spec 9.7 (issue #75).
 *
 * The sheet is a 4x2 atlas of six white-on-transparent sprites (soft circle, star,
 * spark, smoke puff, snowflake, rune); the renderer tints them per particle with
 * vertex colours, so one texture and one draw call serve every particle VFX.
 * Node has no canvas, so the shapes are rasterized with plain math (2x2
 * supersampling for antialiasing) and encoded as an RGBA PNG with zlib. Run it
 * with `npm run textures:particles`; the output is committed to public/textures.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

/** Atlas layout: 4 columns x 2 rows of 128 px cells (six used cells). */
const WIDTH = 512;
const HEIGHT = 512;
const CELL = 128;
const COLUMNS = 4;
const CELLS = 6;

/** RGBA pixel buffer, white sprites with an alpha channel only. */
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

/** Sprite cell index -> shape rasterizer (cell-local coordinates in 0..128). */
const SHAPES: readonly ((x: number, y: number) => number)[] = [
  softCircle,
  star,
  spark,
  smokePuff,
  snowflake,
  rune,
];

/** Fills one pixel with premultiplied-white RGBA. */
function setPixel(x: number, y: number, alpha: number): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || alpha <= 0) {
    return;
  }
  const index = (y * WIDTH + x) * 4;
  pixels[index] = 255;
  pixels[index + 1] = 255;
  pixels[index + 2] = 255;
  pixels[index + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
}

/** Signed distance from a point to a line segment, used by the flake and rune glyphs. */
function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSquared));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Soft radial falloff: 1 in the centre, 0 at the radius. */
function radial(x: number, y: number, cx: number, cy: number, radius: number): number {
  const dx = (x - cx) / radius;
  const dy = (y - cy) / radius;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance >= 1) {
    return 0;
  }
  return Math.pow(1 - distance, 1.6);
}

/** Point-in-polygon coverage test (even-odd rule) for the star and spark shapes. */
function inPolygon(x: number, y: number, points: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    const [ax, ay] = a;
    const [bx, by] = b;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

/** Regular star polygon with alternating outer/inner radii. */
function starPoints(
  points: number,
  outer: number,
  inner: number,
): readonly (readonly [number, number])[] {
  const result: [number, number][] = [];
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * index - Math.PI / 2;
    result.push([64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius] as [number, number]);
  }
  return result;
}

/** Alpha of the soft round particle (soft circle sprite). */
function softCircle(x: number, y: number): number {
  return radial(x, y, 64, 64, 58);
}

/** Five-point star sprite. */
function star(x: number, y: number): number {
  return inPolygon(x, y, starPoints(5, 54, 24)) ? 1 : 0;
}

/** Four-point spark sprite (long thin points). */
function spark(x: number, y: number): number {
  return inPolygon(x, y, starPoints(4, 58, 9)) ? 1 : 0;
}

/** Seeded deterministic pseudo-random number in [0, 1). */
function random(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Soft smoke puff: overlapping radial blobs with a little noise. */
function smokePuff(x: number, y: number): number {
  const blobs: readonly (readonly [number, number, number])[] = [
    [64, 64, 46],
    [44, 58, 30],
    [84, 62, 32],
    [58, 82, 26],
    [72, 42, 24],
  ];
  let alpha = 0;
  const noise = 0.72 + 0.28 * random(x * 3.1 + y * 1.7);
  for (const blob of blobs) {
    const [cx, cy, radius] = blob;
    alpha = Math.max(alpha, radial(x, y, cx, cy, radius) * noise);
  }
  return alpha;
}

/** Six-armed snowflake with side branches. */
function snowflake(x: number, y: number): number {
  const centerX = 64;
  const centerY = 64;
  let alpha = 0;
  for (let arm = 0; arm < 6; arm += 1) {
    const angle = (Math.PI / 3) * arm;
    const endX = centerX + Math.cos(angle) * 52;
    const endY = centerY + Math.sin(angle) * 52;
    alpha = Math.max(alpha, lineCoverage(x, y, centerX, centerY, endX, endY, 4));
    for (const fraction of [0.55, 0.78]) {
      const baseX = centerX + Math.cos(angle) * 52 * fraction;
      const baseY = centerY + Math.sin(angle) * 52 * fraction;
      for (const side of [-1, 1]) {
        const branchAngle = angle + side * 0.8;
        const branchX = baseX + Math.cos(branchAngle) * 16;
        const branchY = baseY + Math.sin(branchAngle) * 16;
        alpha = Math.max(alpha, lineCoverage(x, y, baseX, baseY, branchX, branchY, 3));
      }
    }
  }
  return alpha;
}

/** Antialiased line coverage: 1 on the stroke, fades to 0 over 1.5 px. */
function lineCoverage(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
): number {
  const distance = segmentDistance(x, y, ax, ay, bx, by);
  return Math.max(0, Math.min(1, (width - distance) / 1.5 + 0.5));
}

/** Angular rune glyph: ring, vertical stroke and two chevrons. */
function rune(x: number, y: number): number {
  const ringDistance = Math.abs(Math.sqrt((x - 64) ** 2 + (y - 64) ** 2) - 46);
  const ringAlpha = Math.max(0, Math.min(1, (4 - ringDistance) / 1.5 + 0.5));
  const strokes = [
    lineCoverage(x, y, 64, 30, 64, 98, 4),
    lineCoverage(x, y, 64, 30, 40, 52, 4),
    lineCoverage(x, y, 64, 98, 88, 76, 4),
    lineCoverage(x, y, 44, 74, 64, 94, 3),
  ];
  return Math.max(ringAlpha, ...strokes);
}

/** Rasterizes one sprite cell with 2x2 supersampling and writes it to the atlas. */
function drawCell(cellIndex: number): void {
  const shape = SHAPES[cellIndex];
  if (shape === undefined) {
    return;
  }
  const originX = (cellIndex % COLUMNS) * CELL;
  const originY = Math.floor(cellIndex / COLUMNS) * CELL;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      let coverage = 0;
      for (const offsetY of [0.25, 0.75]) {
        for (const offsetX of [0.25, 0.75]) {
          coverage += shape(x + offsetX, y + offsetY);
        }
      }
      setPixel(originX + x, originY + y, coverage / 4);
    }
  }
}

/** CRC32 table for the PNG chunks (the format requires it, zlib does not provide it). */
const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

/** CRC32 of a byte array, as PNG chunks require. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Concatenates Uint8Arrays (PNG file assembly). */
function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Encodes one PNG chunk: length, type, data, CRC. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((character) => character.charCodeAt(0)));
  const length = new Uint8Array(4);
  const view = new DataView(length.buffer);
  view.setUint32(0, data.length);
  const crcInput = concatBytes([typeBytes, data]);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(crcInput));
  return concatBytes([length, typeBytes, data, crc]);
}

/** Encodes the RGBA pixel buffer as a PNG file (filter 0 on every scanline). */
function encodePng(): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, WIDTH);
  view.setUint32(4, HEIGHT);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = WIDTH * 4 + 1;
  const raw = new Uint8Array(stride * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    raw[y * stride] = 0;
    raw.set(pixels.subarray(y * WIDTH * 4, (y + 1) * WIDTH * 4), y * stride + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concatBytes([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Rasterizes all cells, encodes the PNG and writes it into public/textures. */
function main(): void {
  for (let cell = 0; cell < CELLS; cell += 1) {
    drawCell(cell);
  }
  const outputPath = resolve(process.cwd(), 'public/textures/particles.png');
  mkdirSync(resolve(process.cwd(), 'public/textures'), { recursive: true });
  writeFileSync(outputPath, encodePng());
  process.stdout.write(`textures: wrote ${outputPath} (${WIDTH}x${HEIGHT}, ${CELLS} sprites)\n`);
}

main();
