/**
 * Side ground rings of the Duel (spec 18.1, 9.2): every unit stands on a ring in its
 * side's colour, teal (#3BF0C8) for the viewer's own units and red (#FF4D4D) for the
 * opponent's. It replaces the "warm defenders, purple enemies" rule, because both
 * players use both kinds of units. All rings are one instanced mesh (one draw call).
 */
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

import { AOE_GROUND_Y } from '../vfx/rings';
import { OWN_SIDE_COLOR, ENEMY_SIDE_COLOR } from './duelColors';

/** Enough for both sides' caps: 12 raiders, summons and a full defender zone each. */
const MAX_RINGS = 96;
/** World diameter of a ring: inside the 1.0 tile footprint (spec 9.1). */
const RING_DIAMETER = 0.86;
/** Rings lie just under the AOE rings, above the ground and the blob shadows. */
const RING_Y = AOE_GROUND_Y - 0.008;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = uv;
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
}
`;

/** A crisp outer ring with a dark outline and a faint inner fill, so it reads on grass. */
const FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float d = length( vUv - 0.5 ) * 2.0;
  float edge = fwidth( d ) * 1.5;
  float ring = smoothstep( 0.72 - edge, 0.72, d ) * ( 1.0 - smoothstep( 0.9, 0.9 + edge, d ) );
  float outline = smoothstep( 0.66 - edge, 0.66, d ) * ( 1.0 - smoothstep( 0.97, 0.97 + edge, d ) );
  float fill = ( 1.0 - smoothstep( 0.2, 0.72, d ) ) * 0.22 + 0.08;
  float inside = 1.0 - step( 0.72, d );
  vec3 color = mix( vec3( 0.106, 0.106, 0.184 ), vColor * 1.15, ring );
  float alpha = max( max( ring, outline * 0.55 ), fill * inside );
  if ( alpha < 0.01 ) discard;
  gl_FragColor = vec4( color, alpha );
}
`;

/** One unit's ring in view world coordinates. */
export interface SideRingUnit {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly own: boolean;
}

/** Interpolated ring of one unit (spec 11.4). */
interface RingEntry {
  previousX: number;
  previousZ: number;
  x: number;
  z: number;
  own: boolean;
}

/** The ground rings of every unit on the board. */
export interface SideRings {
  readonly mesh: InstancedMesh;
  /** Stores the units of the latest tick; called once per tick. */
  sync(units: readonly SideRingUnit[]): void;
  /** Lerps every ring between the last two ticks (alpha 0..1) and uploads them. */
  apply(alpha: number): void;
  dispose(): void;
}

/** Creates the shared ring material: unlit, colour from the instance, no depth writes. */
function createRingMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
}

/** Moves every known ring to its new tick position; new units start still. */
function storeUnits(entries: Map<number, RingEntry>, units: readonly SideRingUnit[]): void {
  const seen = new Set<number>();
  for (const unit of units) {
    seen.add(unit.id);
    const entry = entries.get(unit.id);
    if (entry === undefined) {
      entries.set(unit.id, { previousX: unit.x, previousZ: unit.z, ...unit });
      continue;
    }
    entry.previousX = entry.x;
    entry.previousZ = entry.z;
    entry.x = unit.x;
    entry.z = unit.z;
    entry.own = unit.own;
  }
  for (const id of [...entries.keys()]) {
    if (!seen.has(id)) {
      entries.delete(id);
    }
  }
}

/** Creates the instanced ring layer. */
export function createSideRings(): SideRings {
  const geometry = new PlaneGeometry(RING_DIAMETER, RING_DIAMETER);
  geometry.rotateX(-Math.PI / 2);
  const material = createRingMaterial();
  const mesh = new InstancedMesh(geometry, material, MAX_RINGS);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.count = 0;
  const entries = new Map<number, RingEntry>();
  const matrix = new Matrix4();
  const colors = { own: new Color(OWN_SIDE_COLOR), enemy: new Color(ENEMY_SIDE_COLOR) };
  return {
    mesh,
    sync: (units): void => storeUnits(entries, units),
    apply: (alpha): void => {
      const amount = Math.min(Math.max(alpha, 0), 1);
      let count = 0;
      for (const entry of entries.values()) {
        if (count >= MAX_RINGS) {
          break;
        }
        const x = entry.previousX + (entry.x - entry.previousX) * amount;
        const z = entry.previousZ + (entry.z - entry.previousZ) * amount;
        mesh.setMatrixAt(count, matrix.makeTranslation(x, RING_Y, z));
        mesh.setColorAt(count, entry.own ? colors.own : colors.enemy);
        count += 1;
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
