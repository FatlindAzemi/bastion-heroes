/**
 * Floating damage numbers of spec 9.7 in the 2.5D relaunch look (issue #114 §3):
 * big Lilita One digits with the dark outline of spec 9.8, one colour per damage
 * type (pierce cyan, blast orange, arcane violet) with the spec 4.1 effectiveness
 * mixed in, a pop-in overshoot and a bounce-free rise of 0.6 units in 0.6 s, then
 * a fade. Crits and heavy hits draw bigger. The digits come from a runtime canvas
 * atlas (fonts and per-glyph text are easiest on a canvas; Node has no canvas at
 * build time), while the whole number field still renders in one draw call.
 */

import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

import type { DamageType } from '../../sim/combat/damage';
import { createBillboardBatch, type BillboardBatch } from './billboardBatch';
import {
  damageNumberAlpha,
  damageNumberColor,
  damageNumberPopScale,
  damageNumberRise,
  damageNumberScaleMultiplier,
  DAMAGE_NUMBER_LIFE_S,
  TEXT_OUTLINE_COLOR,
} from './juice';

/** Number of digit cells in the generated atlas (0-9). */
const DIGIT_COUNT = 10;
/** Digit cell size in the runtime canvas. */
const DIGIT_CELL = 160;
/** Maximum digits of one number; longer amounts are clipped from the left. */
const MAX_DIGITS = 4;
/** Maximum simultaneous damage numbers (oldest is recycled past the cap). */
const MAX_NUMBERS = 24;
/** Digit quad size in world units: readable at phone size and next to a 0.9 unit unit. */
const DIGIT_WIDTH = 0.42;
const DIGIT_HEIGHT = 0.6;
/** Horizontal distance between two digit centres in world units. */
const DIGIT_STEP = 0.34;
/** HDR tint of the number so the bloom pass catches the bright digits. */
const NUMBER_INTENSITY = 1.15;
/** Baked outline colour as a CSS hex string (spec 9.8 #1B1B2F). */
const OUTLINE_CSS = `#${TEXT_OUTLINE_COLOR.toString(16).padStart(6, '0')}`;

/** One hit's number data; the colour and size are resolved from the damage rules. */
export interface DamageNumberSpawn {
  readonly amount: number;
  readonly damageType: DamageType;
  /** Spec 4.1 effectiveness multiplier of the hit (1 = neutral). */
  readonly multiplier: number;
  readonly crit: boolean;
}

/** Floating damage numbers of spec 9.7 / issue #114. */
export interface DamageNumbers {
  spawn(x: number, y: number, z: number, hit: DamageNumberSpawn): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** One pooled damage number; the digits live in a fixed array so update allocates nothing. */
interface DamageEntry {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  scale: number;
  color: number;
  digitCount: number;
  readonly digits: Int8Array;
}

/** Creates one pooled entry. */
function createEntry(): DamageEntry {
  return {
    active: false,
    x: 0,
    y: 0,
    z: 0,
    age: 0,
    scale: 1,
    color: 0xffffff,
    digitCount: 0,
    digits: new Int8Array(MAX_DIGITS),
  };
}

/** Renders the digits 0-9, white fill with the spec 9.8 dark outline, into a canvas atlas. */
function createDigitAtlas(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = DIGIT_CELL * DIGIT_COUNT;
  canvas.height = DIGIT_CELL;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.font = `bold ${Math.round(DIGIT_CELL * 0.82)}px "Lilita One", "Arial Black", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.strokeStyle = OUTLINE_CSS;
    context.lineWidth = DIGIT_CELL * 0.095;
    context.fillStyle = '#ffffff';
    for (let digit = 0; digit < DIGIT_COUNT; digit += 1) {
      const centerX = digit * DIGIT_CELL + DIGIT_CELL / 2;
      const centerY = DIGIT_CELL / 2 + DIGIT_CELL * 0.04;
      context.strokeText(String(digit), centerX, centerY);
      context.fillText(String(digit), centerX, centerY);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Writes the rounded amount into the pooled digit array; returns the digit count. */
function writeDigits(amount: number, entry: DamageEntry): number {
  const rounded = Math.max(1, Math.round(amount));
  const text = String(rounded);
  const start = Math.max(0, text.length - MAX_DIGITS);
  const count = text.length - start;
  for (let index = 0; index < count; index += 1) {
    entry.digits[index] = Number(text.charAt(start + index));
  }
  entry.digitCount = count;
  return count;
}

/** Creates the damage-number layer; fonts are loaded before the atlas is drawn. */
export function createDamageNumbers(parent: import('three').Group): DamageNumbers {
  const batch: BillboardBatch = createBillboardBatch(
    MAX_NUMBERS * MAX_DIGITS,
    DIGIT_COUNT,
    1,
    null,
  );
  parent.add(batch.mesh);
  const entries: DamageEntry[] = [];
  for (let index = 0; index < MAX_NUMBERS; index += 1) {
    entries.push(createEntry());
  }
  let disposed = false;
  // Draw once with the fallback font so the first hits are visible, then again with
  // the bundled Lilita One once the browser has loaded it.
  batch.setTexture(createDigitAtlas());
  void document.fonts.ready.then(() => {
    if (!disposed) {
      batch.setTexture(createDigitAtlas());
    }
  });

  /** Returns the entry to reuse: the first inactive one, else the oldest. */
  function acquireEntry(): DamageEntry {
    let oldest = entries[0];
    for (const entry of entries) {
      if (!entry.active) {
        return entry;
      }
      if (oldest === undefined || entry.age > oldest.age) {
        oldest = entry;
      }
    }
    return oldest ?? createEntry();
  }

  return {
    spawn: (x, y, z, hit): void => {
      const entry = acquireEntry();
      entry.active = true;
      entry.x = x;
      entry.y = y;
      entry.z = z;
      entry.age = 0;
      entry.scale = damageNumberScaleMultiplier(hit.amount, hit.crit);
      entry.color = damageNumberColor(hit.damageType, hit.multiplier);
      writeDigits(hit.amount, entry);
    },
    update: (deltaSeconds): void => {
      batch.begin();
      for (const entry of entries) {
        if (!entry.active) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= DAMAGE_NUMBER_LIFE_S) {
          entry.active = false;
          continue;
        }
        const progress = entry.age / DAMAGE_NUMBER_LIFE_S;
        const alpha = damageNumberAlpha(progress);
        const size = entry.scale * damageNumberPopScale(progress);
        const rise = damageNumberRise(progress);
        const center = (entry.digitCount - 1) / 2;
        for (let index = 0; index < entry.digitCount; index += 1) {
          batch.add({
            x: entry.x,
            y: entry.y + rise,
            z: entry.z,
            width: DIGIT_WIDTH * size,
            height: DIGIT_HEIGHT * size,
            cell: entry.digits[index] ?? 0,
            color: entry.color,
            alpha,
            offsetX: (index - center) * DIGIT_STEP * size,
            intensity: NUMBER_INTENSITY,
          });
        }
      }
      batch.end();
    },
    dispose: (): void => {
      disposed = true;
      batch.dispose();
    },
  };
}
