/**
 * Procedural placeholder sprite sheet (issue #114, development only).
 *
 * Until the sprite-forge atlas pipeline delivers `public/sprites/*.png`, the layer
 * can draw blocky colored placeholder characters so the wiring and animations can be
 * checked. The texture follows the same 4-column grid as the manifest placeholder, so
 * the frame/UV code paths are identical to the real assets.
 */
import { CanvasTexture, NearestFilter, SRGBColorSpace, type Texture } from 'three';

/** Outline colour shared with the pixel-art outline of the real sheets (spec 9.2). */
const OUTLINE_COLOR = '#1b1b2f';

/** Number of placeholder frames; must match the frames of `createPlaceholderManifest`. */
const PLACEHOLDER_FRAMES = 4;

/** Vertical bob of each placeholder frame, in pixels (a cheap idle/walk wiggle). */
const FRAME_BOB = [0, -2, 0, -1] as const;

/** Stable hue from the character id, so placeholder units stay distinguishable. */
function hueOf(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

/** Draws one blocky placeholder critter into the given frame cell. */
function drawFrame(
  context: CanvasRenderingContext2D,
  id: string,
  frame: number,
  frameWidth: number,
  frameHeight: number,
): void {
  const hue = hueOf(id);
  const bob = FRAME_BOB[frame % FRAME_BOB.length] ?? 0;
  const centerX = frame * frameWidth + frameWidth / 2;
  const feetY = frameHeight - 3 + bob;
  const bodyWidth = frameWidth * 0.44;
  const bodyHeight = frameHeight * 0.46;
  const headRadius = frameWidth * 0.17;
  const lineWidth = Math.max(2, Math.round(frameWidth * 0.05));

  context.lineWidth = lineWidth;
  context.strokeStyle = OUTLINE_COLOR;
  context.fillStyle = `hsl(${hue} 62% 52%)`;
  context.beginPath();
  context.roundRect(centerX - bodyWidth / 2, feetY - bodyHeight, bodyWidth, bodyHeight, 5);
  context.fill();
  context.stroke();

  context.fillStyle = `hsl(${hue} 70% 70%)`;
  context.beginPath();
  context.arc(centerX, feetY - bodyHeight - headRadius * 0.6, headRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  // Feet, offset by the frame so the walk cycle reads as movement.
  context.fillStyle = OUTLINE_COLOR;
  const footOffset = frame % 2 === 0 ? -3 : 3;
  context.fillRect(centerX - bodyWidth * 0.34, feetY - 1, frameWidth * 0.16, 3);
  context.fillRect(centerX + bodyWidth * 0.18 + footOffset, feetY - 1, frameWidth * 0.16, 3);

  // Two pixel eyes on the head.
  const eyeY = feetY - bodyHeight - headRadius * 0.75;
  context.fillStyle = '#ffffff';
  context.fillRect(centerX - headRadius * 0.6, eyeY, 3, 3);
  context.fillRect(centerX + headRadius * 0.25, eyeY, 3, 3);
}

/** Builds one placeholder sheet texture with `columns` frames in a single row. */
export function createPlaceholderTexture(
  id: string,
  frameWidth: number,
  frameHeight: number,
  columns: number,
): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, frameWidth * Math.max(1, columns));
  canvas.height = Math.max(1, frameHeight);
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let frame = 0; frame < Math.min(columns, PLACEHOLDER_FRAMES); frame += 1) {
      drawFrame(context, id, frame, frameWidth, frameHeight);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
