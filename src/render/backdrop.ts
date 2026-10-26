import { CanvasTexture, Fog, Scene, SRGBColorSpace } from 'three';

/** Sky colours of the World 1 palette (spec 9.4) tuned for the 2.5D portrait look. */
const SKY_TOP = '#54b4f2';
const SKY_MID = '#9fd8ff';
const SKY_HORIZON = '#dff3ff';
const SUN_GLOW = 'rgba(255, 244, 208, 0.85)';
const CLOUD_WHITE = '#f7fcff';
const CLOUD_SHADE = '#c9e6fb';
const HILL_FAR = '#a9d99b';
const HILL_MID = '#8cca7b';
const HILL_NEAR = '#6fb960';
const TREE_LINE = '#4f9a4a';
const MEADOW = '#7ed957';

/** Size of the painted backdrop texture; portrait ratio of the phone view. */
const BACKDROP_WIDTH = 512;
const BACKDROP_HEIGHT = 1024;

/** Draws one soft cloud cluster as overlapping puffs with a cool underside. */
function drawCloud(context: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  const puffs: ReadonlyArray<[number, number, number]> = [
    [-0.9, 0.12, 0.52],
    [-0.3, -0.08, 0.7],
    [0.35, -0.16, 0.62],
    [0.95, 0.08, 0.5],
    [0.1, 0.18, 0.55],
  ];
  for (const [offsetX, offsetY, radius] of puffs) {
    context.beginPath();
    context.fillStyle = CLOUD_SHADE;
    context.arc(x + offsetX * scale, y + (offsetY + 0.1) * scale, radius * scale, 0, Math.PI * 2);
    context.fill();
  }
  for (const [offsetX, offsetY, radius] of puffs) {
    context.beginPath();
    context.fillStyle = CLOUD_WHITE;
    context.arc(x + offsetX * scale, y + offsetY * scale, radius * scale * 0.94, 0, Math.PI * 2);
    context.fill();
  }
}

/** Fills a rolling hill band from a list of peaks (screen fractions). */
function drawHillBand(
  context: CanvasRenderingContext2D,
  peaks: ReadonlyArray<readonly [number, number]>,
  baseY: number,
  color: string,
): void {
  const width = context.canvas.width;
  const height = context.canvas.height;
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(0, baseY * height);
  for (let index = 0; index < peaks.length; index += 1) {
    const [peakX, peakY] = peaks[index] as readonly [number, number];
    const next = peaks[index + 1];
    const controlX = next === undefined ? width : ((peakX + (next[0] as number)) / 2) * width;
    context.quadraticCurveTo(peakX * width, peakY * height, controlX, baseY * height);
  }
  context.lineTo(width, height);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

/** Draws a row of tiny distant tree silhouettes along the horizon. */
function drawTreeline(context: CanvasRenderingContext2D, y: number): void {
  const width = context.canvas.width;
  context.fillStyle = TREE_LINE;
  for (let x = -8; x < width + 20; x += 22) {
    const wobble = ((x * 37) % 13) - 6;
    context.beginPath();
    context.arc(x + wobble, y, 12 + ((x * 13) % 9), 0, Math.PI * 2);
    context.fill();
  }
  context.fillRect(0, y, width, 40);
}

/** Paints the complete portrait far background: sky, sun, clouds, hills and meadow. */
function paintBackdrop(context: CanvasRenderingContext2D, width: number, height: number): void {
  const sky = context.createLinearGradient(0, 0, 0, height * 0.62);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(0.55, SKY_MID);
  sky.addColorStop(1, SKY_HORIZON);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const sun = context.createRadialGradient(
    width * 0.76,
    height * 0.12,
    0,
    width * 0.76,
    height * 0.12,
    width * 0.46,
  );
  sun.addColorStop(0, SUN_GLOW);
  sun.addColorStop(0.45, 'rgba(255, 245, 214, 0.28)');
  sun.addColorStop(1, 'rgba(255, 245, 214, 0)');
  context.fillStyle = sun;
  context.fillRect(0, 0, width, height * 0.55);

  drawCloud(context, width * 0.2, height * 0.1, 34);
  drawCloud(context, width * 0.68, height * 0.17, 26);
  drawCloud(context, width * 0.38, height * 0.23, 18);
  drawCloud(context, width * 0.9, height * 0.26, 16);

  drawHillBand(
    context,
    [
      [0.0, 0.34],
      [0.2, 0.29],
      [0.45, 0.33],
      [0.68, 0.28],
      [0.88, 0.32],
      [1.0, 0.3],
    ],
    0.44,
    HILL_FAR,
  );
  drawHillBand(
    context,
    [
      [0.0, 0.41],
      [0.16, 0.37],
      [0.38, 0.42],
      [0.6, 0.36],
      [0.82, 0.41],
      [1.0, 0.38],
    ],
    0.5,
    HILL_MID,
  );
  drawTreeline(context, height * 0.47);
  drawHillBand(
    context,
    [
      [0.0, 0.47],
      [0.24, 0.44],
      [0.5, 0.48],
      [0.78, 0.43],
      [1.0, 0.46],
    ],
    0.53,
    HILL_NEAR,
  );

  const meadow = context.createLinearGradient(0, height * 0.53, 0, height);
  meadow.addColorStop(0, MEADOW);
  meadow.addColorStop(0.35, '#74cf53');
  meadow.addColorStop(1, '#5fb843');
  context.fillStyle = meadow;
  context.fillRect(0, height * 0.53, width, height * 0.47);
}

let sharedBackdropTexture: CanvasTexture | null = null;

/** The shared painted portrait backdrop (spec 9.1, 9.4, issue #113/#114). */
export function backdropTexture(): CanvasTexture {
  if (sharedBackdropTexture === null) {
    const canvas = document.createElement('canvas');
    canvas.width = BACKDROP_WIDTH;
    canvas.height = BACKDROP_HEIGHT;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('backdrop: 2D canvas is unavailable');
    }
    paintBackdrop(context, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    sharedBackdropTexture = texture;
  }
  return sharedBackdropTexture;
}

/**
 * Applies the painted portrait backdrop and the distance fog to a scene. The camera is
 * fixed during play, so a screen-space matte painting is the cheapest way to give the
 * floating diorama a finished far landscape (spec 9.1, 9.4).
 */
export function applySky(scene: Scene, fogNear = 26, fogFar = 58): void {
  scene.background = backdropTexture();
  scene.fog = new Fog(SKY_HORIZON, fogNear, fogFar);
}
