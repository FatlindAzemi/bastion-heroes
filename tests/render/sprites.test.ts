import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  billboardQuaternion,
  createBottomCenterQuad,
  DEFAULT_WORLD_SCALE,
  MAX_WORLD_SCALE,
  resolveSpriteWorldScale,
  spriteWorldWidth,
} from '../../src/render/sprites/billboard';
import {
  clampFrameToSheet,
  clipDurationSeconds,
  clipFrameAt,
  frameUvRect,
  sheetFrameCount,
  sheetRowCount,
  type UvRect,
} from '../../src/render/sprites/clip';
import {
  baseClipName,
  createPlaceholderManifest,
  parseSpriteManifest,
  resolveSpriteClip,
} from '../../src/render/sprites/manifest';
import type { SpriteClip, SpriteManifest } from '../../src/render/sprites/types';

/** A minimal manifest that follows the sprite-forge contract. */
function validManifest(): unknown {
  return {
    version: 1,
    characters: {
      gloomling: {
        image: '/sprites/gloomling.png',
        frameWidth: 96,
        frameHeight: 112,
        columns: 8,
        worldHeight: 0.9,
        clips: {
          idle: { frames: [0, 1, 2, 3], fps: 8, loop: true },
          attack: { frames: [4, 5, 6], fps: 12, loop: false },
        },
      },
    },
    props: {
      round_tree: {
        image: '/sprites/prop_round_tree.png',
        frameWidth: 128,
        frameHeight: 128,
        columns: 1,
        worldHeight: 2.4,
      },
    },
  };
}

/** A reusable UV rectangle output. */
function uvRect(): UvRect {
  return { u0: 0, v0: 0, u1: 0, v1: 0 };
}

/** A looping clip of `count` frames at 10 fps, starting at frame index `start`. */
function loopingClip(count: number, start = 0): SpriteClip {
  return {
    frames: Array.from({ length: count }, (_, index) => start + index),
    fps: 10,
    loop: true,
  };
}

describe('Sprite manifest parsing (issue #114)', () => {
  it('parses the sprite-forge manifest contract', () => {
    const manifest = parseSpriteManifest(validManifest());
    expect(manifest).not.toBeNull();
    const character = manifest?.characters['gloomling'];
    expect(character?.image).toBe('/sprites/gloomling.png');
    expect(character?.frameWidth).toBe(96);
    expect(character?.columns).toBe(8);
    expect(character?.worldHeight).toBe(0.9);
    expect(character?.clips.idle?.frames).toEqual([0, 1, 2, 3]);
    expect(character?.clips.attack?.loop).toBe(false);
    expect(manifest?.props['round_tree']?.worldHeight).toBe(2.4);
  });

  it('rejects a document with the wrong version or no characters', () => {
    expect(parseSpriteManifest({ ...(validManifest() as object), version: 2 })).toBeNull();
    expect(parseSpriteManifest({ version: 1, characters: {} })).toBeNull();
    expect(parseSpriteManifest(null)).toBeNull();
    expect(parseSpriteManifest('<html>not json</html>')).toBeNull();
  });

  it('skips a character without an idle clip and keeps the valid ones', () => {
    const raw = validManifest() as Record<string, unknown>;
    const characters = raw['characters'] as Record<string, unknown>;
    characters['no_idle'] = {
      image: '/sprites/no_idle.png',
      frameWidth: 64,
      frameHeight: 64,
      columns: 2,
      worldHeight: 0.8,
      clips: { attack: { frames: [0], fps: 8, loop: false } },
    };
    const manifest = parseSpriteManifest(raw);
    expect(Object.keys(manifest?.characters ?? {})).toEqual(['gloomling']);
  });

  it('drops a broken clip but keeps the rest of the sheet', () => {
    const raw = validManifest() as Record<string, unknown>;
    const character = (raw['characters'] as Record<string, Record<string, unknown>>)['gloomling'];
    const clips = character?.['clips'] as Record<string, unknown>;
    clips['walk'] = { frames: [0, -1], fps: 8, loop: true };
    clips['eat'] = { frames: [], fps: 8, loop: false };
    const manifest = parseSpriteManifest(raw);
    const parsed = manifest?.characters['gloomling'];
    expect(parsed?.clips.walk).toBeUndefined();
    expect(parsed?.clips.eat).toBeUndefined();
    expect(parsed?.clips.idle).toBeDefined();
  });

  it('defaults fps and loop of a clip that omits them', () => {
    const raw = validManifest() as Record<string, unknown>;
    const character = (raw['characters'] as Record<string, Record<string, unknown>>)['gloomling'];
    (character?.['clips'] as Record<string, unknown>)['walk'] = { frames: [0, 1] };
    const clip = parseSpriteManifest(raw)?.characters['gloomling']?.clips.walk;
    expect(clip?.fps).toBe(8);
    expect(clip?.loop).toBe(true);
  });

  it('resolves a missing clip to the mandatory idle loop', () => {
    const manifest = parseSpriteManifest(validManifest());
    const character = manifest?.characters['gloomling'];
    if (character === undefined) {
      throw new Error('manifest did not parse');
    }
    expect(resolveSpriteClip(character, 'walk')?.frames).toEqual([0, 1, 2, 3]);
    expect(resolveSpriteClip(character, 'attack')?.frames).toEqual([4, 5, 6]);
    expect(baseClipName('defender')).toBe('idle');
    expect(baseClipName('enemy')).toBe('walk');
  });

  it('builds a placeholder manifest that parses like the real contract', () => {
    const placeholder = createPlaceholderManifest(['gloomling', 'shieldbearer']);
    const parsed: SpriteManifest | null = parseSpriteManifest(placeholder);
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed?.characters ?? {})).toEqual(['gloomling', 'shieldbearer']);
    expect(parsed?.characters['gloomling']?.image).toBe('placeholder:gloomling');
    expect(parsed?.characters['gloomling']?.clips.idle?.frames.length).toBeGreaterThan(0);
    expect(parsed?.characters['gloomling']?.clips.walk).toBeDefined();
  });
});

describe('Sprite clip frame selection (issue #114)', () => {
  it('advances one frame per 1/fps second and loops', () => {
    const clip = loopingClip(4);
    expect(clipFrameAt(clip, 0)).toBe(0);
    expect(clipFrameAt(clip, 0.099)).toBe(0);
    expect(clipFrameAt(clip, 0.1)).toBe(1);
    expect(clipFrameAt(clip, 0.3)).toBe(3);
    expect(clipFrameAt(clip, 0.4)).toBe(0);
    expect(clipFrameAt(clip, 1.05)).toBe(2);
  });

  it('holds the last frame of a one-shot clip', () => {
    const clip: SpriteClip = { frames: [4, 5, 6], fps: 10, loop: false };
    expect(clipFrameAt(clip, 0)).toBe(4);
    expect(clipFrameAt(clip, 0.2)).toBe(6);
    expect(clipFrameAt(clip, 5)).toBe(6);
  });

  it('scales playback with the walk rate and freezes at zero', () => {
    const clip = loopingClip(4);
    expect(clipFrameAt(clip, 0.2, 2)).toBe(0);
    expect(clipFrameAt(clip, 0.25, 2)).toBe(1);
    expect(clipFrameAt(clip, 3, 0)).toBe(0);
  });

  it('reports the duration of one clip pass', () => {
    expect(clipDurationSeconds(loopingClip(4))).toBeCloseTo(0.4);
    expect(clipDurationSeconds(loopingClip(4), 0.5)).toBeCloseTo(0.8);
    expect(clipDurationSeconds(loopingClip(1), 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Sprite atlas UV mapping (issue #114)', () => {
  it('derives the row count and frame count from the real image size', () => {
    expect(sheetRowCount(128, 64)).toBe(2);
    expect(sheetRowCount(112, 112)).toBe(1);
    expect(sheetRowCount(0, 64)).toBe(1);
    expect(sheetFrameCount(4, 2)).toBe(8);
    expect(sheetFrameCount(0, 2)).toBe(0);
  });

  it('maps row-major frames with the flipY image orientation', () => {
    const rect = uvRect();
    // 384x128 sheet, 96x64 frames, 4 columns -> 2 rows, 8 frames.
    frameUvRect(0, 4, 96, 64, 384, 128, rect);
    expect(rect).toEqual({ u0: 0, v0: 0.5, u1: 0.25, v1: 1 });
    frameUvRect(5, 4, 96, 64, 384, 128, rect);
    expect(rect).toEqual({ u0: 0.25, v0: 0, u1: 0.5, v1: 0.5 });
  });

  it('clamps frames beyond the real sheet and handles invalid zeros', () => {
    expect(clampFrameToSheet(99, 4, 2)).toBe(7);
    expect(clampFrameToSheet(-3, 4, 2)).toBe(0);
    const rect = uvRect();
    frameUvRect(99, 4, 96, 64, 384, 128, rect);
    expect(rect.u1).toBe(1);
    expect(rect.v0).toBe(0);
    frameUvRect(0, 0, 0, 0, 0, 0, rect);
    expect(rect).toEqual({ u0: 0, v0: 0, u1: 0, v1: 0 });
  });
});

describe('Sprite billboard maths (issue #114)', () => {
  it('derives the world width from the frame aspect ratio', () => {
    expect(spriteWorldWidth(0.9, 96, 112)).toBeCloseTo(0.9 * (96 / 112));
    expect(spriteWorldWidth(0.9, 0, 112)).toBe(0);
  });

  it('scales the manifest world height for portrait readability', () => {
    expect(DEFAULT_WORLD_SCALE).toBe(1.5);
    expect(resolveSpriteWorldScale(undefined)).toBe(1.5);
    expect(resolveSpriteWorldScale(1.5)).toBe(1.5);
    expect(resolveSpriteWorldScale(0.6)).toBe(1);
    expect(resolveSpriteWorldScale(9)).toBe(MAX_WORLD_SCALE);
    expect(resolveSpriteWorldScale(Number.NaN)).toBe(1.5);
  });

  it('anchors the quad at its bottom center', () => {
    const geometry = createBottomCenterQuad(0.8, 1.2);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    expect(box?.min.y).toBeCloseTo(0);
    expect(box?.max.y).toBeCloseTo(1.2);
    expect(box?.min.x).toBeCloseTo(-0.4);
    expect(box?.max.x).toBeCloseTo(0.4);
    geometry.dispose();
  });

  it('sinks the padded frame so the visible content stands on the ground point', () => {
    // 4 px of transparent padding in a 100 px frame = 0.04 of the 1.0 unit height.
    const geometry = createBottomCenterQuad(0.8, 1, 0.04);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box?.min.y).toBeCloseTo(-0.04);
    expect(box?.max.y).toBeCloseTo(0.96);
    geometry.dispose();
    // A runaway padding measurement cannot sink the sprite by more than a quarter.
    const clamped = createBottomCenterQuad(0.8, 1, 5);
    clamped.computeBoundingBox();
    expect(clamped.boundingBox?.min.y).toBeCloseTo(-0.25);
    clamped.dispose();
  });

  it('copies the camera quaternion so the plane faces the camera', () => {
    const cameraQuaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -1.2);
    const out = new Quaternion();
    billboardQuaternion(out, cameraQuaternion);
    expect(out.toArray()).toEqual(cameraQuaternion.toArray());
    const normal = new Vector3(0, 0, 1).applyQuaternion(out);
    expect(normal.toArray()).toEqual(
      new Vector3(0, 0, 1).applyQuaternion(cameraQuaternion).toArray(),
    );
  });

  it('rolls the plane around the view axis for death and merge spins', () => {
    const cameraQuaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -1.2);
    const spun = new Quaternion();
    billboardQuaternion(spun, cameraQuaternion, Math.PI);
    // The facing normal is unchanged by a roll around the view axis.
    const normal = new Vector3(0, 0, 1).applyQuaternion(spun);
    const facing = new Vector3(0, 0, 1).applyQuaternion(cameraQuaternion);
    expect(normal.x).toBeCloseTo(facing.x);
    expect(normal.y).toBeCloseTo(facing.y);
    expect(normal.z).toBeCloseTo(facing.z);
    // The plane's local x axis is rolled 180 degrees around the normal.
    const xAxis = new Vector3(1, 0, 0).applyQuaternion(spun);
    const expected = new Vector3(-1, 0, 0).applyQuaternion(cameraQuaternion).toArray();
    expect(xAxis.toArray()[0]).toBeCloseTo(expected[0] ?? 0);
    expect(xAxis.toArray()[1]).toBeCloseTo(expected[1] ?? 0);
    expect(xAxis.toArray()[2]).toBeCloseTo(expected[2] ?? 0);
  });
});
