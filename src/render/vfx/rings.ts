/**
 * Flat glowing AOE ground rings and expanding energy shockwaves of the 2.5D
 * relaunch (issue #114 §3): a sharp-edged neon ring that expands and fades, with
 * HDR colours so the bloom pass turns it into a light source. Used for blast hits,
 * trap fire, Ogre smashes and boss smashes. The ground rings blend normally so
 * their emerald/violet/gold hue stays readable on the bright grass, the energy
 * shockwaves blend additively in the air. All rings share one plane geometry and
 * two instanced meshes, so the whole AOE layer stays at two draw calls and the
 * per-frame update allocates nothing.
 */

import {
  AdditiveBlending,
  Camera,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Blending,
} from 'three';

import {
  AOE_GROUND_FADE_START,
  AOE_GROUND_LIFE_S,
  AOE_SHOCKWAVE_FADE_START,
  AOE_SHOCKWAVE_LIFE_S,
  aoeRingAlpha,
  aoeRingScale,
} from './juice';

/** Caps of the two AOE layers; older rings recycle first. */
const MAX_GROUND_RINGS = 12;
const MAX_SHOCKWAVES = 8;
/** Ground rings start at this fraction of their end radius (the impact point). */
const GROUND_START_FRACTION = 0.28;
const SHOCKWAVE_START_FRACTION = 0.18;
/** HDR boost of the ring colour so the bloom pass sees it above 1.0. */
const GROUND_HDR = 1.0;
const SHOCKWAVE_HDR = 1.2;
/**
 * World height of the flat ground rings: the World 1 environment grass tops out at
 * y = 0.2 (environment.ts `ENVIRONMENT_TILE_TOP`), so the rings lie just above it.
 */
export const AOE_GROUND_Y = 0.26;

/** One live ring of either layer. */
interface RingEntry {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  startRadius: number;
  endRadius: number;
  color: number;
  fadeStart: number;
}

/** Expanding ring layers of the AOE VFX (issue #114 §3). */
export interface AoeRings {
  /** Flat ground ring under the impact; `radius` is the final world radius. */
  spawnGround(x: number, y: number, z: number, radius: number, color: number): void;
  /** Camera-facing energy shockwave at the impact point. */
  spawnShockwave(x: number, y: number, z: number, radius: number, color: number): void;
  update(deltaSeconds: number, camera: Camera): void;
  dispose(): void;
}

/** Creates one pooled ring entry. */
function createEntry(): RingEntry {
  return {
    active: false,
    x: 0,
    y: 0,
    z: 0,
    age: 0,
    life: 1,
    startRadius: 0,
    endRadius: 1,
    color: 0xffffff,
    fadeStart: AOE_GROUND_FADE_START,
  };
}

/** Vertex/fragment source of the sharp-edged ring shader (shared by both layers). */
function ringMaterial(blending: Blending, alphaScale: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: { alphaScale: { value: alphaScale } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aAlpha;
      varying vec2 vQuad;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vQuad = position.xy;
        vColor = aColor;
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float alphaScale;
      varying vec2 vQuad;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(vQuad) * 2.0;
        if (d > 1.0) {
          discard;
        }
        // A sharp outer edge, a bright core band and a soft inner halo: the classic
        // energy shockwave read of the 2.5D relaunch.
        float band = smoothstep(0.62, 0.82, d) * (1.0 - smoothstep(0.94, 1.0, d));
        float core = smoothstep(0.78, 0.88, d) * (1.0 - smoothstep(0.97, 1.0, d));
        float halo = (1.0 - smoothstep(0.0, 1.0, d)) * 0.18;
        float alpha = (band * 0.8 + core * 0.6 + halo) * vAlpha * alphaScale;
        vec3 color = vColor * (0.9 + core * 0.8);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

/** A ring pool backed by one instanced mesh and its per-instance attributes. */
interface RingPool {
  readonly mesh: InstancedMesh;
  readonly colors: InstancedBufferAttribute;
  readonly alphas: InstancedBufferAttribute;
  spawn(
    x: number,
    y: number,
    z: number,
    radius: number,
    color: number,
    kind: 'ground' | 'wave',
  ): void;
  write(deltaSeconds: number, camera: Camera | null, rotation: Quaternion): number;
  dispose(): void;
}

/** Creates one ring pool with the given capacity, blending and HDR boost. */
function createRingPool(
  parent: import('three').Group,
  capacity: number,
  additive: boolean,
  hdr: number,
): RingPool {
  const geometry = new PlaneGeometry(1, 1);
  const material = ringMaterial(additive ? AdditiveBlending : NormalBlending, additive ? 0.7 : 1);
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = additive ? 820 : 800;
  parent.add(mesh);
  const entries: RingEntry[] = [];
  for (let index = 0; index < capacity; index += 1) {
    entries.push(createEntry());
  }
  const colors = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const alphas = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute('aColor', colors);
  geometry.setAttribute('aAlpha', alphas);
  let cursor = 0;
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();

  return {
    mesh,
    colors,
    alphas,
    spawn: (x, y, z, radius, ringColor, kind): void => {
      let entry: RingEntry | undefined;
      for (const candidate of entries) {
        if (!candidate.active) {
          entry = candidate;
          break;
        }
      }
      if (entry === undefined) {
        entry = entries[cursor] ?? entries[0];
        cursor = (cursor + 1) % capacity;
      }
      if (entry === undefined) {
        return;
      }
      entry.active = true;
      entry.x = x;
      entry.y = y;
      entry.z = z;
      entry.age = 0;
      entry.life = kind === 'ground' ? AOE_GROUND_LIFE_S : AOE_SHOCKWAVE_LIFE_S;
      entry.startRadius =
        radius * (kind === 'ground' ? GROUND_START_FRACTION : SHOCKWAVE_START_FRACTION);
      entry.endRadius = radius;
      entry.color = ringColor;
      entry.fadeStart = kind === 'ground' ? AOE_GROUND_FADE_START : AOE_SHOCKWAVE_FADE_START;
    },
    write: (deltaSeconds, camera, rotation): number => {
      let count = 0;
      for (const entry of entries) {
        if (!entry.active) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= entry.life) {
          entry.active = false;
          continue;
        }
        const progress = entry.age / entry.life;
        const radius = aoeRingScale(progress, entry.startRadius, entry.endRadius);
        position.set(entry.x, entry.y, entry.z);
        scale.set(radius * 2, radius * 2, 1);
        matrix.compose(position, camera === null ? rotation : camera.quaternion, scale);
        mesh.setMatrixAt(count, matrix);
        colors.setXYZ(
          count,
          (((entry.color >> 16) & 0xff) / 255) * hdr,
          (((entry.color >> 8) & 0xff) / 255) * hdr,
          ((entry.color & 0xff) / 255) * hdr,
        );
        alphas.setX(count, aoeRingAlpha(progress, entry.fadeStart));
        count += 1;
      }
      mesh.count = count;
      return count;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}

/** Creates the AOE ring layer (flat ground rings plus energy shockwaves). */
export function createAoeRings(parent: import('three').Group): AoeRings {
  const ground = createRingPool(parent, MAX_GROUND_RINGS, false, GROUND_HDR);
  const waves = createRingPool(parent, MAX_SHOCKWAVES, true, SHOCKWAVE_HDR);
  // The ground rings lie on the xz plane: rotate the billboard quad flat.
  const groundRotation = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));

  /** Uploads a pool's per-frame instance data when it drew anything. */
  function upload(pool: RingPool, count: number): void {
    if (count === 0) {
      return;
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.colors.needsUpdate = true;
    pool.alphas.needsUpdate = true;
  }

  return {
    spawnGround: (x, y, z, radius, color): void => {
      ground.spawn(x, y, z, radius, color, 'ground');
    },
    spawnShockwave: (x, y, z, radius, color): void => {
      waves.spawn(x, y, z, radius, color, 'wave');
    },
    update: (deltaSeconds, camera): void => {
      upload(ground, ground.write(deltaSeconds, null, groundRotation));
      upload(waves, waves.write(deltaSeconds, camera, groundRotation));
    },
    dispose: (): void => {
      ground.dispose();
      waves.dispose();
    },
  };
}
