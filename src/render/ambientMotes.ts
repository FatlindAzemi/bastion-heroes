/**
 * Ambient motes: drifting pollen over the meadow and violet sparks rising at the portal
 * (spec 9.7 juice, issue #115). One `Points` draw call animated entirely in the vertex
 * shader, so the scene is never completely still. Motes are tiny and additive and never
 * hide a unit.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';

/** Tuning of the ambient motes. Presentation only. */
export const AMBIENT_MOTES = {
  pollenCount: 46,
  portalSparkCount: 26,
  /** Pollen volume around the playfield in world units. */
  pollenMin: [-2.5, 0.5, -1.5],
  pollenMax: [9.0, 2.6, 6.5],
  /** Portal spark volume in front of the portal mouth. */
  sparkMin: [8.3, 0.3, 0.6],
  sparkMax: [9.3, 3.4, 4.4],
  pollenColor: 0xfff3b0,
  sparkColor: 0xc77dff,
  /** Point size in pixels at one world unit distance (scaled by the pixel ratio). */
  pointScale: 46,
} as const;

const VERTEX_SHADER = /* glsl */ `
attribute vec4 aSeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  // aSeed: x phase, y speed, z size, w rise (0 = drifting pollen, 1 = rising spark).
  float t = uTime * aSeed.y + aSeed.x * 6.2831;
  vec3 p = position;
  p.x += sin( t * 0.7 ) * 0.35;
  p.z += cos( t * 0.5 + aSeed.x * 3.0 ) * 0.35;
  float cycle = fract( uTime * aSeed.y * 0.22 + aSeed.x );
  p.y += mix( sin( t ) * 0.18, cycle * 2.4 - 0.6, aSeed.w );
  float fade = mix( 0.55 + 0.45 * sin( t * 1.3 ), sin( cycle * 3.1416 ), aSeed.w );
  vAlpha = clamp( fade, 0.0, 1.0 );
  vColor = aColor;
  vec4 viewPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uScale * aSeed.z / -viewPosition.z;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float radius = length( gl_PointCoord - 0.5 ) * 2.0;
  float glow = pow( max( 0.0, 1.0 - radius ), 2.2 );
  gl_FragColor = vec4( vColor * glow * vAlpha, 1.0 );
}
`;

/** Deterministic 0..1 value for mote `index`, so screenshots are reproducible. */
function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Linear interpolation between two bounds. */
function between(min: number, max: number, amount: number): number {
  return min + (max - min) * amount;
}

/** Fills the buffers of one mote group starting at `offset`. */
function fillMotes(
  buffers: { position: Float32Array; seed: Float32Array; color: Float32Array },
  offset: number,
  count: number,
  bounds: { min: readonly number[]; max: readonly number[] },
  look: { color: number; rise: number; size: number },
): void {
  const color = new Color(look.color);
  for (let index = 0; index < count; index += 1) {
    const slot = offset + index;
    for (let axis = 0; axis < 3; axis += 1) {
      buffers.position[slot * 3 + axis] = between(
        bounds.min[axis] ?? 0,
        bounds.max[axis] ?? 0,
        seeded(slot, axis + 1),
      );
    }
    buffers.seed.set(
      [
        seeded(slot, 4),
        between(0.35, 0.9, seeded(slot, 5)),
        look.size * between(0.6, 1.3, seeded(slot, 6)),
        look.rise,
      ],
      slot * 4,
    );
    buffers.color.set([color.r, color.g, color.b], slot * 3);
  }
}

/** The ambient mote layer of one level scene. */
export interface AmbientMotes {
  readonly object: Points;
  update(timeSeconds: number): void;
  dispose(): void;
}

/** Creates the pollen and portal spark motes. */
export function createAmbientMotes(pixelRatio = 1): AmbientMotes {
  const total = AMBIENT_MOTES.pollenCount + AMBIENT_MOTES.portalSparkCount;
  const buffers = {
    position: new Float32Array(total * 3),
    seed: new Float32Array(total * 4),
    color: new Float32Array(total * 3),
  };
  fillMotes(
    buffers,
    0,
    AMBIENT_MOTES.pollenCount,
    { min: AMBIENT_MOTES.pollenMin, max: AMBIENT_MOTES.pollenMax },
    { color: AMBIENT_MOTES.pollenColor, rise: 0, size: 1 },
  );
  fillMotes(
    buffers,
    AMBIENT_MOTES.pollenCount,
    AMBIENT_MOTES.portalSparkCount,
    { min: AMBIENT_MOTES.sparkMin, max: AMBIENT_MOTES.sparkMax },
    { color: AMBIENT_MOTES.sparkColor, rise: 1, size: 1.5 },
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.position, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(buffers.seed, 4));
  geometry.setAttribute('aColor', new BufferAttribute(buffers.color, 3));
  const time = { value: 0 };
  const material = new ShaderMaterial({
    uniforms: { uTime: time, uScale: { value: AMBIENT_MOTES.pointScale * pixelRatio } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const object = new Points(geometry, material);
  object.name = 'ambient_motes';
  // The motes move in the vertex shader, so the static bounds must not cull them.
  object.frustumCulled = false;

  return {
    object,
    update: (timeSeconds: number): void => {
      time.value = timeSeconds;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
    },
  };
}
