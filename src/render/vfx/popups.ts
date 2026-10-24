/**
 * Combo popups of spec 9.7 (issue #75): "STEAM!", "SHATTER!", "TOXIC!" and
 * "CHAIN!" in Lilita One with the dark outline, floating up and fading. One runtime
 * canvas atlas (four words) and one draw call; the words are fixed by the spec 4.6
 * combo ids, so no per-frame text rasterizing happens.
 */

import { CanvasTexture, SRGBColorSpace } from 'three';

import { createBillboardBatch, type BillboardBatch } from './billboardBatch';
import type { ComboId } from '../../sim/types';

/** Cell size of the 4-word atlas. */
const WORD_CELL = 256;
/** Popup size in world units. */
const WORD_WIDTH = 2.2;
const WORD_HEIGHT = 0.62;
/** Popup lifetime and rise in world units (spec 9.7 feel; combos are cosmetic). */
const POPUP_LIFE_S = 0.8;
const POPUP_RISE = 0.6;
const MAX_POPUPS = 6;

/** Combo id -> atlas cell. */
const WORD_CELLS: Readonly<Record<ComboId, number>> = {
  steam: 0,
  shatter: 1,
  toxic: 2,
  chain: 3,
};

/** Combo id -> popup text. */
const WORD_TEXT: Readonly<Record<ComboId, string>> = {
  steam: 'STEAM!',
  shatter: 'SHATTER!',
  toxic: 'TOXIC!',
  chain: 'CHAIN!',
};

/** One live popup. */
interface PopupEntry {
  combo: ComboId;
  x: number;
  y: number;
  z: number;
  age: number;
}

/** Combo popups of spec 9.7. */
export interface ComboPopups {
  spawn(combo: ComboId, x: number, y: number, z: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** Draws the four combo words into a 4-cell canvas atlas. */
function createWordAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = WORD_CELL * 4;
  canvas.height = WORD_CELL;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.font = 'bold 80px "Lilita One", "Arial Black", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.strokeStyle = '#1b1b2f';
    context.lineWidth = 14;
    context.fillStyle = '#ffffff';
    const combos: readonly ComboId[] = ['steam', 'shatter', 'toxic', 'chain'];
    for (const combo of combos) {
      const centerX = WORD_CELLS[combo] * WORD_CELL + WORD_CELL / 2;
      context.strokeText(WORD_TEXT[combo], centerX, WORD_CELL / 2 + 6);
      context.fillText(WORD_TEXT[combo], centerX, WORD_CELL / 2 + 6);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Creates the combo popup layer. */
export function createComboPopups(parent: import('three').Group): ComboPopups {
  const batch: BillboardBatch = createBillboardBatch(MAX_POPUPS, 4, 1, null);
  parent.add(batch.mesh);
  const entries: PopupEntry[] = [];
  void document.fonts.ready.then(() => {
    batch.setTexture(createWordAtlas());
  });

  return {
    spawn: (combo, x, y, z): void => {
      if (entries.length >= MAX_POPUPS) {
        entries.shift();
      }
      entries.push({ combo, x, y, z, age: 0 });
    },
    update: (deltaSeconds): void => {
      batch.begin();
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= POPUP_LIFE_S) {
          entries.splice(index, 1);
          continue;
        }
        const progress = entry.age / POPUP_LIFE_S;
        batch.add({
          x: entry.x,
          y: entry.y + POPUP_RISE * progress,
          z: entry.z,
          width: WORD_WIDTH,
          height: WORD_HEIGHT,
          cell: WORD_CELLS[entry.combo],
          color: 0xffffff,
          alpha: progress > 0.55 ? Math.max(0, (1 - progress) / 0.45) : 1,
        });
      }
      batch.end();
    },
    dispose: (): void => {
      batch.dispose();
    },
  };
}
