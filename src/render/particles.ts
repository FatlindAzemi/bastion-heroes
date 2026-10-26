/**
 * Shared procedural particle system for the spec 9.6 code animations and the full
 * spec 9.7 VFX set (issue #75), upgraded for the 2.5D relaunch (issue #114 §3).
 *
 * Two pooled layers share the committed `public/textures/particles.png` sheet:
 * - the normal-blended burst layer (soft circle, star, spark, smoke puff, snowflake,
 *   rune) used by every VFX id, and
 * - an additive glow layer of small rising embers/sparkles for hits, crits and the
 *   Essence orb trail. Additive HDR colours feed the bloom pass.
 *
 * Fixed typed-array buffers mean `burst`, `sparkle` and `update` never allocate in
 * the render loop (spec 11.4); the whole system stays at two draw calls. Particle
 * definitions live in `src/render/vfx/<id>.ts`; callers pass a VFX id.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Texture,
} from 'three';

import { VFX_DEFINITIONS } from './vfx/definitions';
import { ATLAS_COLUMNS, ATLAS_ROWS } from './vfx/atlas';
import type { VfxId } from './vfx/types';

/** Burst ids: every VFX id can be emitted as sprite particles (spec 9.7 table). */
export type BurstKind = VfxId;

/** Particle budget of the burst layer: two confetti bursts plus combos and statuses. */
const MAX_PARTICLES = 448;
/** Particle budget of the additive glow layer (rising embers and sparkles). */
const MAX_GLOW_PARTICLES = 192;

/** Converts world size into point pixels at the level camera distance. */
const POINT_SCALE = 1500;
/** HDR brightness of the glow-layer particles so bloom picks them up. */
const GLOW_HDR = 1.7;
/** Atlas cell of the spark sprite (spec 9.7 sprite sheet: soft circle, star, spark). */
const SPARK_CELL = 2;

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
  /** Adds the pooled points objects to the scene at creation. */
  readonly object: Points;
  /**
   * Fires a burst at a world position; no allocations, oldest particles are
   * recycled. `tint` recolours the whole burst, `countScale` multiplies its count.
   */
  burst(kind: BurstKind, x: number, y: number, z: number, tint?: number, countScale?: number): void;
  /** Emits one burst scattered over `spread` world units, for wide effects like confetti. */
  burstAt(
    kind: BurstKind,
    x: number,
    y: number,
    z: number,
    spread: number,
    tint?: number,
    countScale?: number,
  ): void;
  /** Emits `count` additive rising glow embers in `color` (issue #114 §3). */
  sparkle(x: number, y: number, z: number, color: number, count: number): void;
  /** Advances every live particle; one draw call per layer. */
  update(deltaSeconds: number): void;
  /** Sets the particle sprite sheet once the texture has loaded. */
  setTexture(texture: Texture): void;
  dispose(): void;
}

/** Creates the shared point material of one layer. */
function createPointMaterial(additive: boolean): ShaderMaterial {
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
  if (additive) {
    material.blending = AdditiveBlending;
  }
  return material;
}

/**
 * Creates the pooled particle system. Positions, velocities, colours and lifetimes
 * live in fixed typed arrays, so the emit and update paths stay allocation-free.
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
  const material = createPointMaterial(false);
  const points = new Points(geometry, material);
  points.name = 'vfx-particles';
  points.frustumCulled = false;
  points.visible = false;

  const glowPosition = new Float32Array(MAX_GLOW_PARTICLES * 3);
  const glowVelocity = new Float32Array(MAX_GLOW_PARTICLES * 3);
  const glowLife = new Float32Array(MAX_GLOW_PARTICLES);
  const glowDuration = new Float32Array(MAX_GLOW_PARTICLES);
  const glowSize = new Float32Array(MAX_GLOW_PARTICLES);
  const glowColors = new Float32Array(MAX_GLOW_PARTICLES * 3);
  const glowAlphas = new Float32Array(MAX_GLOW_PARTICLES);
  let glowCursor = 0;
  const glowGeometry = new BufferGeometry();
  const glowPositions = new BufferAttribute(glowPosition, 3);
  const glowSizes = new BufferAttribute(glowSize, 1);
  const glowColorAttribute = new BufferAttribute(glowColors, 3);
  const glowAlphaAttribute = new BufferAttribute(glowAlphas, 1);
  glowGeometry.setAttribute('position', glowPositions);
  glowGeometry.setAttribute('aSize', glowSizes);
  glowGeometry.setAttribute(
    'aCell',
    new BufferAttribute(new Float32Array(MAX_GLOW_PARTICLES).fill(SPARK_CELL), 1),
  );
  glowGeometry.setAttribute('aColor', glowColorAttribute);
  glowGeometry.setAttribute('aAlpha', glowAlphaAttribute);
  const glowMaterial = createPointMaterial(true);
  const glowPoints = new Points(glowGeometry, glowMaterial);
  glowPoints.name = 'vfx-glow-particles';
  glowPoints.frustumCulled = false;
  glowPoints.visible = false;
  // The level scene adds only `object` to its scene; the glow layer rides along as a
  // child so the particle system still owns a single scene node (spec 11.7).
  points.add(glowPoints);

  /** Writes one burst particle into the ring buffer. */
  function writeParticle(
    kind: VfxId,
    x: number,
    y: number,
    z: number,
    spreadX: number,
    spreadZ: number,
    tint: number | undefined,
  ): void {
    const definition = VFX_DEFINITIONS[kind];
    const index = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    const angle = nextRandom(rng) * Math.PI * 2;
    const horizontal = nextRandom(rng) * definition.speed;
    const base = index * 3;
    const glow = definition.glow ?? 1;
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
      tint ?? definition.colors[Math.floor(nextRandom(rng) * definition.colors.length)] ?? 0xffffff,
    );
    colors[base] = scratchColor.r * glow;
    colors[base + 1] = scratchColor.g * glow;
    colors[base + 2] = scratchColor.b * glow;
    alphas[index] = 1;
  }

  /** Emits `count` particles of one VFX id over a spread, recycling the oldest. */
  function emitBurst(
    kind: VfxId,
    x: number,
    y: number,
    z: number,
    spreadX: number,
    spreadZ: number,
    tint: number | undefined,
    countScale: number,
  ): void {
    const definition = VFX_DEFINITIONS[kind];
    const count = Math.max(1, Math.round(definition.count * countScale));
    for (let emitted = 0; emitted < count; emitted += 1) {
      writeParticle(kind, x, y, z, spreadX, spreadZ, tint);
    }
    points.visible = true;
  }

  /** Writes one additive rising ember into its ring buffer. */
  function writeGlowParticle(x: number, y: number, z: number, color: number): void {
    const index = glowCursor;
    glowCursor = (glowCursor + 1) % MAX_GLOW_PARTICLES;
    const base = index * 3;
    const angle = nextRandom(rng) * Math.PI * 2;
    const horizontal = 0.12 + nextRandom(rng) * 0.35;
    glowPosition[base] = x + (nextRandom(rng) - 0.5) * 0.34;
    glowPosition[base + 1] = y + (nextRandom(rng) - 0.2) * 0.3;
    glowPosition[base + 2] = z + (nextRandom(rng) - 0.5) * 0.34;
    glowVelocity[base] = Math.cos(angle) * horizontal;
    glowVelocity[base + 1] = 0.7 + nextRandom(rng) * 1.1;
    glowVelocity[base + 2] = Math.sin(angle) * horizontal;
    glowDuration[index] = 0.4 + nextRandom(rng) * 0.45;
    glowLife[index] = glowDuration[index] ?? 0;
    glowSize[index] = 0.09 + nextRandom(rng) * 0.1;
    scratchColor.setHex(color);
    glowColors[base] = scratchColor.r * GLOW_HDR;
    glowColors[base + 1] = scratchColor.g * GLOW_HDR;
    glowColors[base + 2] = scratchColor.b * GLOW_HDR;
    glowAlphas[index] = 1;
  }

  /** Advances the normal-blended burst layer; returns the live particle count. */
  function updateBursts(deltaSeconds: number): number {
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
    if (active > 0) {
      positions.needsUpdate = true;
      sizes.needsUpdate = true;
      cellAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
    }
    return active;
  }

  /** Advances the additive glow layer; returns the live ember count. */
  function updateGlow(deltaSeconds: number): number {
    let active = 0;
    for (let index = 0; index < MAX_GLOW_PARTICLES; index += 1) {
      const remaining = (glowLife[index] ?? 0) - deltaSeconds;
      if (remaining <= 0) {
        glowLife[index] = 0;
        glowAlphas[index] = 0;
        glowSize[index] = 0;
        continue;
      }
      glowLife[index] = remaining;
      const base = index * 3;
      // Rising embers slow down and drift sideways as they cool (no gravity pull).
      glowVelocity[base + 1] = (glowVelocity[base + 1] ?? 0) * (1 - 0.9 * deltaSeconds);
      glowPosition[base] = (glowPosition[base] ?? 0) + (glowVelocity[base] ?? 0) * deltaSeconds;
      glowPosition[base + 1] =
        (glowPosition[base + 1] ?? 0) + (glowVelocity[base + 1] ?? 0) * deltaSeconds;
      glowPosition[base + 2] =
        (glowPosition[base + 2] ?? 0) + (glowVelocity[base + 2] ?? 0) * deltaSeconds;
      const progress = 1 - remaining / Math.max(0.001, glowDuration[index] ?? remaining);
      const fade = progress > 0.55 ? Math.max(0, (1 - progress) / 0.45) : 1;
      const twinkle = 0.72 + 0.28 * Math.sin(progress * 18 + index * 1.7);
      glowAlphas[index] = fade * twinkle;
      active += 1;
    }
    if (active > 0) {
      glowPositions.needsUpdate = true;
      glowSizes.needsUpdate = true;
      glowColorAttribute.needsUpdate = true;
      glowAlphaAttribute.needsUpdate = true;
    }
    return active;
  }

  return {
    object: points,
    burst: (kind, x, y, z, tint, countScale = 1): void => {
      emitBurst(kind, x, y, z, 0.2, 0.2, tint, countScale);
    },
    burstAt: (kind, x, y, z, spread, tint, countScale = 1): void => {
      emitBurst(kind, x, y, z, spread, spread * 0.4, tint, countScale);
    },
    sparkle: (x, y, z, color, count): void => {
      for (let emitted = 0; emitted < count; emitted += 1) {
        writeGlowParticle(x, y, z, color);
      }
      glowPoints.visible = true;
    },
    update: (deltaSeconds): void => {
      const burstActive = updateBursts(deltaSeconds) > 0;
      const glowActive = updateGlow(deltaSeconds) > 0;
      points.visible = burstActive || glowActive;
      glowPoints.visible = glowActive;
    },
    setTexture: (texture): void => {
      material.uniforms['map'] = { value: texture };
      glowMaterial.uniforms['map'] = { value: texture };
      material.needsUpdate = true;
      glowMaterial.needsUpdate = true;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      points.removeFromParent();
      glowGeometry.dispose();
      glowMaterial.dispose();
      glowPoints.removeFromParent();
    },
  };
}
