/**
 * Minimal procedural particle bursts for the spec 9.6 code animations (issue #74):
 * spawn dust, the enemy/defender death poofs and the merge star burst. The full
 * VFX set (9.7) arrives with issue #75, which can reuse `burst()` or replace this
 * layer; this module keeps one pooled `InstancedMesh` (one draw call, fixed buffer
 * sizes) so the render loop never allocates.
 *
 * Particles are little solid octahedra that shrink to nothing over their lifetime,
 * so the effect needs no alpha blending and stays robust on every GPU/driver.
 */

import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  type ColorRepresentation,
} from 'three';

/** The burst presets used by the procedural animations (spec 9.6 / 9.7 ids). */
export type BurstKind = 'spawn_dust' | 'death_enemy' | 'death_defender' | 'merge_star';

/** Particle budget: one fixed instance buffer, shared by every burst (one draw call). */
const MAX_PARTICLES = 120;

/** Base particle radius in world units, small next to a 0.9 unit tall unit (spec 9.3). */
const PARTICLE_RADIUS = 0.16;

/** One burst preset: count, colours, motion and lifetime of the particles. */
interface BurstPreset {
  readonly count: number;
  readonly colors: readonly ColorRepresentation[];
  readonly speed: number;
  readonly upward: number;
  readonly gravity: number;
  readonly lifeMin: number;
  readonly lifeMax: number;
}

/** Bursts of spec 9.6: landing dust, purple enemy poof, gold defender poof and merge stars. */
const PRESETS: Readonly<Record<BurstKind, BurstPreset>> = {
  spawn_dust: {
    count: 14,
    colors: [0xd9a066, 0xf4e3c3, 0xbfa07a],
    speed: 1.1,
    upward: 0.5,
    gravity: 4.5,
    lifeMin: 0.35,
    lifeMax: 0.6,
  },
  death_enemy: {
    count: 18,
    colors: [0x4a2f66, 0x7c4dff, 0x2b1b3d, 0xa64dff],
    speed: 1.4,
    upward: 1.1,
    gravity: -0.3,
    lifeMin: 0.5,
    lifeMax: 0.8,
  },
  death_defender: {
    count: 20,
    colors: [0xffd54a, 0xffcc00, 0xfff2b0],
    speed: 2,
    upward: 1.5,
    gravity: 5,
    lifeMin: 0.5,
    lifeMax: 0.8,
  },
  merge_star: {
    count: 22,
    colors: [0xffd54a, 0xffcc00, 0xfff2b0, 0xffffff],
    speed: 1.8,
    upward: 1.7,
    gravity: 4,
    lifeMin: 0.6,
    lifeMax: 0.9,
  },
};

/** The particle layer owned by the unit layer (spec 9.6, 9.7). */
export interface ParticleBursts {
  /** Adds the pooled instanced mesh to the scene at creation. */
  readonly object: InstancedMesh;
  /** Fires a burst at a world position; no allocations, oldest particles are recycled. */
  burst(kind: BurstKind, x: number, y: number, z: number): void;
  /** Advances every live particle; one shared draw call for all bursts. */
  update(deltaSeconds: number): void;
  dispose(): void;
}

/**
 * Creates the pooled particle system. Positions, velocities, colours and
 * lifetimes live in fixed typed arrays and one preallocated instance matrix, so
 * both `burst` and `update` are allocation-free in the render loop (spec 11.4).
 */
export function createParticleBursts(): ParticleBursts {
  const position = new Float32Array(MAX_PARTICLES * 3);
  const velocity = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const duration = new Float32Array(MAX_PARTICLES);
  const gravity = new Float32Array(MAX_PARTICLES);
  const scratchColor = new Color();
  const scratchObject = new Object3D();
  const scratchMatrix = new Matrix4();
  let cursor = 0;
  let randomState = 0x9e3779b9;

  const geometry = new OctahedronGeometry(PARTICLE_RADIUS, 0);
  const material = new MeshBasicMaterial({ toneMapped: false });
  const mesh = new InstancedMesh(geometry, material, MAX_PARTICLES);
  mesh.name = 'procedural-particles';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  // Create the instance colour buffer once and start every instance black/invisible.
  for (let index = 0; index < MAX_PARTICLES; index += 1) {
    mesh.setColorAt(index, scratchColor.setHex(0x000000));
    mesh.setMatrixAt(index, scratchMatrix.makeScale(0, 0, 0));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }

  /** Small deterministic PRNG so a burst looks the same in repeated screenshots. */
  function random(): number {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 0x100000000;
  }

  /** Writes one RGB colour into the instance colour buffer. */
  function writeColor(index: number, hex: ColorRepresentation): void {
    const numeric = typeof hex === 'number' ? hex : 0xffffff;
    const red = ((numeric >> 16) & 0xff) / 255;
    const green = ((numeric >> 8) & 0xff) / 255;
    const blue = (numeric & 0xff) / 255;
    mesh.setColorAt(index, scratchColor.setRGB(red, green, blue));
  }

  /** Sets one instance matrix from its particle position and a scale factor. */
  function writeMatrix(index: number, scale: number): void {
    scratchObject.position.set(
      position[index * 3] ?? 0,
      position[index * 3 + 1] ?? 0,
      position[index * 3 + 2] ?? 0,
    );
    scratchObject.scale.setScalar(scale);
    scratchObject.rotation.set(0, 0, 0);
    scratchObject.updateMatrix();
    mesh.setMatrixAt(index, scratchObject.matrix);
  }

  return {
    object: mesh,
    burst: (kind, x, y, z): void => {
      const preset = PRESETS[kind];
      for (let particle = 0; particle < preset.count; particle += 1) {
        const index = cursor;
        cursor = (cursor + 1) % MAX_PARTICLES;
        const angle = random() * Math.PI * 2;
        const horizontalSpeed = preset.speed * (0.35 + random() * 0.65);
        position[index * 3] = x + (random() - 0.5) * 0.2;
        position[index * 3 + 1] = y + random() * 0.15;
        position[index * 3 + 2] = z + (random() - 0.5) * 0.2;
        velocity[index * 3] = Math.cos(angle) * horizontalSpeed;
        velocity[index * 3 + 1] = preset.upward * (0.5 + random() * 0.9);
        velocity[index * 3 + 2] = Math.sin(angle) * horizontalSpeed;
        const particleLife = preset.lifeMin + random() * (preset.lifeMax - preset.lifeMin);
        life[index] = particleLife;
        duration[index] = particleLife;
        gravity[index] = preset.gravity;
        writeColor(index, preset.colors[Math.floor(random() * preset.colors.length)] ?? 0xffffff);
        writeMatrix(index, 1);
      }
      mesh.visible = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
    },
    update: (deltaSeconds): void => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.1);
      let active = 0;
      for (let index = 0; index < MAX_PARTICLES; index += 1) {
        const currentLife = life[index] ?? 0;
        if (currentLife <= 0) {
          continue;
        }
        const remaining = currentLife - delta;
        if (remaining <= 0) {
          life[index] = 0;
          writeMatrix(index, 0);
          continue;
        }
        life[index] = remaining;
        const base = index * 3;
        const velocityY = (velocity[base + 1] ?? 0) + (gravity[index] ?? 0) * delta;
        velocity[base + 1] = velocityY;
        position[base] = (position[base] ?? 0) + (velocity[base] ?? 0) * delta;
        const nextY = (position[base + 1] ?? 0) + velocityY * delta;
        position[base + 1] = nextY < 0.02 ? 0.02 : nextY;
        if (nextY < 0.02) {
          velocity[base + 1] = velocityY * -0.35;
        }
        position[base + 2] = (position[base + 2] ?? 0) + (velocity[base + 2] ?? 0) * delta;
        // Shrink towards zero over the particle lifetime (no alpha blending needed).
        const fade = Math.min(1, remaining / (duration[index] ?? remaining));
        writeMatrix(index, Math.max(0.001, fade));
        active += 1;
      }
      mesh.visible = active > 0;
      if (active > 0) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
