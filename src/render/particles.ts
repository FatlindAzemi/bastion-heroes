/**
 * Shared procedural particle system for the spec 9.6 code animations and the full
 * spec 9.7 VFX set (issue #75).
 *
 * All particles are textured billboards sampled from the committed
 * `public/textures/particles.png` sheet (soft circle, star, spark, smoke puff,
 * snowflake, rune) and tinted per particle, so every burst in the game renders in
 * exactly **one draw call**. Fixed typed-array buffers mean `burst` and `update`
 * never allocate in the render loop (spec 11.4). Particle definitions live in
 * `src/render/vfx/<id>.ts`; callers pass a VFX id.
 */

import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Texture } from 'three';

import { VFX_DEFINITIONS } from './vfx/definitions';
import { ATLAS_COLUMNS, ATLAS_ROWS } from './vfx/atlas';
import type { VfxId } from './vfx/types';

/** Burst ids: every VFX id can be emitted as sprite particles (spec 9.7 table). */
export type BurstKind = VfxId;

/** Particle budget: two full confetti bursts plus combos and status sparkles. */
const MAX_PARTICLES = 320;

/** Converts world size into point pixels at the level camera distance. */
const POINT_SCALE = 1500;

/** One particle's CPU state; positions/velocities live in typed arrays below. */
interface Rng {
  state: number;
}

/** Deterministic pseudo-random generator so bursts look stable in screenshot runs. */
function nextRandom(rng: Rng): number {
  rng.state = (rng.state + 0x9e3779b9) >>> 0;
  let value = rng.state;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff;
}

/** The particle layer owned by the level scene (spec 9.6, 9.7). */
export interface ParticleBursts {
  /** Adds the pooled points object to the scene at creation. */
  readonly object: Points;
  /** Fires a burst at a world position; no allocations, oldest particles are recycled. */
  burst(kind: BurstKind, x: number, y: number, z: number): void;
  /** Emits `count` particles of one burst id, for wide effects like confetti. */
  burstAt(kind: BurstKind, x: number, y: number, z: number, spread: number): void;
  /** Advances every live particle; one shared draw call for all bursts. */
  update(deltaSeconds: number): void;
  /** Sets the particle sprite sheet once the texture has loaded. */
  setTexture(texture: Texture): void;
  dispose(): void;
}

/**
 * Creates the pooled particle system. Positions, velocities, colours and lifetimes
 * live in fixed typed arrays, so `burst` and `update` stay allocation-free.
 */
export function createParticleBursts(): ParticleBursts {
  const position = new Float32Array(MAX_PARTICLES * 3);
  const velocity = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const duration = new Float32Array(MAX_PARTICLES);
  const gravity = new Float32Array(MAX_PARTICLES);
  const spriteSize = new Float32Array(MAX_PARTICLES);
  const cells = new Float32Array(MAX_PARTICLES);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const alphas = new Float32Array(MAX_PARTICLES);
  const scratchColor = new Color();
  const rng: Rng = { state: 0x1234567 };
  let cursor = 0;

  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(position, 3);
  const sizes = new BufferAttribute(spriteSize, 1);
  const cellAttribute = new BufferAttribute(cells, 1);
  const colorAttribute = new BufferAttribute(colors, 3);
  const alphaAttribute = new BufferAttribute(alphas, 1);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('aSize', sizes);
  geometry.setAttribute('aCell', cellAttribute);
  geometry.setAttribute('aColor', colorAttribute);
  geometry.setAttribute('aAlpha', alphaAttribute);

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      map: { value: null as Texture | null },
      atlas: { value: { x: ATLAS_COLUMNS, y: ATLAS_ROWS } },
      pointScale: { value: POINT_SCALE },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aCell;
      attribute vec3 aColor;
      attribute float aAlpha;
      uniform float pointScale;
      varying float vCell;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vCell = aCell;
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = aSize * pointScale / max(0.5, -view.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec2 atlas;
      varying float vCell;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float column = mod(vCell, atlas.x);
        float row = floor(vCell / atlas.x);
        vec2 uv = vec2(
          (column + gl_PointCoord.x) / atlas.x,
          1.0 - (row + 1.0 - gl_PointCoord.y) / atlas.y
        );
        vec4 texel = texture2D(map, uv);
        gl_FragColor = vec4(texel.rgb * vColor, texel.a * vAlpha);
      }
    `,
  });

  const points = new Points(geometry, material);
  points.name = 'vfx-particles';
  points.frustumCulled = false;
  points.visible = false;

  /** Writes one particle into the ring buffer. */
  function writeParticle(
    id: VfxId,
    x: number,
    y: number,
    z: number,
    spreadX: number,
    spreadZ: number,
  ): void {
    const definition = VFX_DEFINITIONS[id];
    const index = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    const angle = nextRandom(rng) * Math.PI * 2;
    const horizontal = nextRandom(rng) * definition.speed;
    const base = index * 3;
    position[base] = x + (nextRandom(rng) - 0.5) * spreadX;
    position[base + 1] = y + nextRandom(rng) * definition.size;
    position[base + 2] = z + (nextRandom(rng) - 0.5) * spreadZ;
    velocity[base] = Math.cos(angle) * horizontal;
    velocity[base + 1] = definition.upward * (0.5 + nextRandom(rng) * 0.8);
    velocity[base + 2] = Math.sin(angle) * horizontal;
    duration[index] =
      definition.lifeMin + nextRandom(rng) * (definition.lifeMax - definition.lifeMin);
    life[index] = duration[index] ?? 0;
    gravity[index] = definition.gravity;
    spriteSize[index] = definition.size * (0.7 + nextRandom(rng) * 0.6);
    cells[index] = definition.sprite;
    scratchColor.setHex(
      definition.colors[Math.floor(nextRandom(rng) * definition.colors.length)] ?? 0xffffff,
    );
    colors[base] = scratchColor.r;
    colors[base + 1] = scratchColor.g;
    colors[base + 2] = scratchColor.b;
    alphas[index] = 1;
  }

  return {
    object: points,
    burst: (kind, x, y, z): void => {
      const definition = VFX_DEFINITIONS[kind];
      for (let count = 0; count < definition.count; count += 1) {
        writeParticle(kind, x, y, z, 0.2, 0.2);
      }
      points.visible = true;
    },
    burstAt: (kind, x, y, z, spread): void => {
      const definition = VFX_DEFINITIONS[kind];
      for (let count = 0; count < definition.count; count += 1) {
        writeParticle(kind, x, y, z, spread, spread * 0.4);
      }
      points.visible = true;
    },
    update: (deltaSeconds): void => {
      let active = 0;
      for (let index = 0; index < MAX_PARTICLES; index += 1) {
        const remaining = (life[index] ?? 0) - deltaSeconds;
        if (remaining <= 0) {
          life[index] = 0;
          alphas[index] = 0;
          spriteSize[index] = 0;
          continue;
        }
        life[index] = remaining;
        const base = index * 3;
        const velocityY = (velocity[base + 1] ?? 0) + (gravity[index] ?? 0) * deltaSeconds;
        velocity[base + 1] = velocityY;
        position[base] = (position[base] ?? 0) + (velocity[base] ?? 0) * deltaSeconds;
        const nextY = (position[base + 1] ?? 0) + velocityY * deltaSeconds;
        position[base + 1] = nextY < 0.02 ? 0.02 : nextY;
        if (nextY < 0.02) {
          velocity[base + 1] = velocityY * -0.35;
        }
        position[base + 2] = (position[base + 2] ?? 0) + (velocity[base + 2] ?? 0) * deltaSeconds;
        const progress = 1 - remaining / Math.max(0.001, duration[index] ?? remaining);
        alphas[index] = progress > 0.65 ? Math.max(0, (1 - progress) / 0.35) : 1;
        active += 1;
      }
      points.visible = active > 0;
      if (active > 0) {
        positions.needsUpdate = true;
        sizes.needsUpdate = true;
        cellAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
        alphaAttribute.needsUpdate = true;
      }
    },
    setTexture: (texture): void => {
      material.uniforms['map'] = { value: texture };
      material.needsUpdate = true;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      points.removeFromParent();
    },
  };
}
