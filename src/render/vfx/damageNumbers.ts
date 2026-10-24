/**
 * Floating damage numbers of spec 9.7 (issue #75): white text with a dark outline,
 * Lilita One, rising 0.6 units in 0.6 s and fading, coloured per spec 4.1. The
 * digits come from a runtime canvas atlas (fonts and per-glyph text are easiest on a
 * canvas; Node has no canvas at build time), while the sheet itself is still one
 * shared texture per layer and the whole number field renders in one draw call.
 */

import { CanvasTexture, SRGBColorSpace, Texture } from 'three';

import { createBillboardBatch, type BillboardBatch } from './billboardBatch';
import { DAMAGE_NUMBER_LIFE_S, DAMAGE_NUMBER_RISE } from './juice';

/** Number of digit cells in the generated atlas (0-9). */
const DIGIT_COUNT = 10;
/** Digit cell size in the runtime canvas. */
const DIGIT_CELL = 128;
/** Digit quad size in world units (small next to a 0.9 unit unit). */
const DIGIT_WIDTH = 0.24;
const DIGIT_HEIGHT = 0.32;
/** Horizontal gap between two digits in world units. */
const DIGIT_STEP = 0.18;
/** Maximum simultaneous damage numbers. */
const MAX_NUMBERS = 24;

/** One live damage number. */
interface DamageEntry {
  x: number;
  y: number;
  z: number;
  digits: readonly number[];
  color: number;
  age: number;
}

/** Floating damage numbers of spec 9.7. */
export interface DamageNumbers {
  spawn(x: number, y: number, z: number, amount: number, color: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** Renders the digits 0-9, white fill with the spec 9.8 dark outline, into a canvas atlas. */
function createDigitAtlas(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = DIGIT_CELL * DIGIT_COUNT;
  canvas.height = DIGIT_CELL;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.font = 'bold 96px "Lilita One", "Arial Black", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.strokeStyle = '#1b1b2f';
    context.lineWidth = 12;
    context.fillStyle = '#ffffff';
    for (let digit = 0; digit < DIGIT_COUNT; digit += 1) {
      const centerX = digit * DIGIT_CELL + DIGIT_CELL / 2;
      const centerY = DIGIT_CELL / 2 + 4;
      context.strokeText(String(digit), centerX, centerY);
      context.fillText(String(digit), centerX, centerY);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Creates the damage-number layer; fonts are loaded before the atlas is drawn. */
export function createDamageNumbers(parent: import('three').Group): DamageNumbers {
  const batch: BillboardBatch = createBillboardBatch(MAX_NUMBERS * 4, DIGIT_COUNT, 1, null);
  parent.add(batch.mesh);
  const entries: DamageEntry[] = [];
  void document.fonts.ready.then(() => {
    batch.setTexture(createDigitAtlas());
  });

  return {
    spawn: (x, y, z, amount, color): void => {
      const rounded = Math.max(1, Math.round(amount));
      const digits = [...String(rounded)].map((character) => Number(character));
      if (entries.length >= MAX_NUMBERS) {
        entries.shift();
      }
      entries.push({ x, y, z, digits, color, age: 0 });
    },
    update: (deltaSeconds): void => {
      batch.begin();
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= DAMAGE_NUMBER_LIFE_S) {
          entries.splice(index, 1);
          continue;
        }
        const progress = entry.age / DAMAGE_NUMBER_LIFE_S;
        const alpha = progress > 0.6 ? Math.max(0, (1 - progress) / 0.4) : 1;
        const rise = DAMAGE_NUMBER_RISE * progress;
        const count = entry.digits.length;
        for (let digitIndex = 0; digitIndex < count; digitIndex += 1) {
          const digit = entry.digits[digitIndex] ?? 0;
          const offset = (digitIndex - (count - 1) / 2) * DIGIT_STEP;
          batch.add({
            x: entry.x + offset,
            y: entry.y + rise,
            z: entry.z,
            width: DIGIT_WIDTH,
            height: DIGIT_HEIGHT,
            cell: digit,
            color: entry.color,
            alpha,
          });
        }
      }
      batch.end();
    },
    dispose: (): void => {
      batch.dispose();
    },
  };
}
