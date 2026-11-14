/**
 * Target progress rings of the 2.5D relaunch (issue #114 §3): a thin radial
 * indicator floating above every defender that is charging a real simulation
 * cooldown — the attack interval of a shooter (`nextAttackTick` + the data
 * `attackIntervalS`) or the next produced Essence orb of a producer
 * (`nextOrbTick`). Only sim fields that exist are read; nothing is invented.
 * One instanced mesh with a billboarded ring shader keeps the layer at one draw
 * call; the shader draws a faint track plus the bright filling arc, so a unit
 * that is about to act reads at a glance. Additive HDR colours feed the bloom.
 */

import {
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';

import { defenderById } from '../../data';
import type { DefenderState } from '../../sim/types';
import type { RenderSimState } from '../renderState';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import {
  cooldownProgress,
  TARGET_RING_ATTACK_COLOR,
  TARGET_RING_LIFT,
  TARGET_RING_MIN_PROGRESS,
  TARGET_RING_ORB_COLOR,
  TARGET_RING_RADIUS,
  TICK_RATE,
} from './juice';
import { unitHeadHeight } from './unitHeights';

/** Maximum simultaneous target rings (the board has at most 9 x 5 defenders). */
const MAX_TARGET_RINGS = 24;
/** HDR boost of the ring colour so the bloom pass catches it. */
const RING_HDR = 1.2;
/** Diameter multiplier of the plane quad (the geometry is one unit wide). */
const QUAD_DIAMETER = 2;

/** One ring's resolved sim data. */
interface TargetRingView {
  x: number;
  y: number;
  z: number;
  progress: number;
  color: number;
}

/** Thin radial progress rings over defenders (issue #114 §3). */
export interface TargetRings {
  /** Rebuilds the rings from the current sim state; called once per drawn frame. */
  update(state: Readonly<RenderSimState>): void;
  dispose(): void;
}

/** Resolves the ring data of one defender, or null when it shows no ring. */
function defenderRing(defender: DefenderState, tick: number): TargetRingView | null {
  const definition = defenderById[defender.defenderId];
  const intervalSeconds = definition?.attackIntervalS;
  if (definition === undefined || intervalSeconds === undefined) {
    return null;
  }
  const intervalTicks = intervalSeconds * TICK_RATE;
  const isProducer = definition.role === 'producer';
  const nextTick = isProducer ? defender.nextOrbTick : defender.nextAttackTick;
  if (nextTick === null) {
    return null;
  }
  const progress = cooldownProgress(nextTick, tick, intervalTicks);
  if (progress < TARGET_RING_MIN_PROGRESS) {
    return null;
  }
  return {
    x: simXToWorldX(defender.col + 0.5),
    y: unitHeadHeight('defender', defender.defenderId) + TARGET_RING_LIFT,
    z: laneToWorldZ(defender.lane),
    progress,
    color: isProducer ? TARGET_RING_ORB_COLOR : TARGET_RING_ATTACK_COLOR,
  };
}

/** Creates the target-ring layer. */
export function createTargetRings(parent: import('three').Group): TargetRings {
  const geometry = new PlaneGeometry(1, 1);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aProgress;
      attribute float aAlpha;
      attribute vec3 aColor;
      varying vec2 vQuad;
      varying float vProgress;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vQuad = position.xy;
        vProgress = aProgress;
        vAlpha = aAlpha;
        vColor = aColor;
        vec4 center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float size = length(instanceMatrix[0].xyz);
        vec4 view = modelViewMatrix * center;
        view.xy += position.xy * size;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      const float TAU = 6.28318530718;
      varying vec2 vQuad;
      varying float vProgress;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float radius = length(vQuad) * 2.0;
        if (radius > 1.0) {
          discard;
        }
        float band = smoothstep(0.70, 0.80, radius) * (1.0 - smoothstep(0.90, 0.99, radius));
        // Angle 0 at the top, growing clockwise like a radial cooldown.
        float angle = mod(atan(vQuad.x, vQuad.y), TAU) / TAU;
        float arc = 1.0 - smoothstep(vProgress - 0.015, vProgress + 0.015, angle);
        float lead = (1.0 - smoothstep(0.0, 0.06, abs(angle - vProgress))) * step(vProgress, 0.999);
        float track = band * 0.3;
        float filled = band * arc;
        float alpha = (track + filled + lead * 0.8) * vAlpha;
        vec3 color = vColor * (0.8 + lead * 0.9 + arc * 0.3);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  // The shader billboards from the instance translation, so a plain identity rotation
  // plus the position/scale matrix is enough and no camera is needed per frame.
  const mesh = new InstancedMesh(geometry, material, MAX_TARGET_RINGS);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 880;
  parent.add(mesh);
  const progressAttribute = new InstancedBufferAttribute(new Float32Array(MAX_TARGET_RINGS), 1);
  const alphaAttribute = new InstancedBufferAttribute(new Float32Array(MAX_TARGET_RINGS), 1);
  const colorAttribute = new InstancedBufferAttribute(new Float32Array(MAX_TARGET_RINGS * 3), 3);
  geometry.setAttribute('aProgress', progressAttribute);
  geometry.setAttribute('aAlpha', alphaAttribute);
  geometry.setAttribute('aColor', colorAttribute);
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();

  return {
    update: (state): void => {
      let count = 0;
      for (const defender of state.defenders) {
        if (defender.hp <= 0 || state.tick < defender.activeAtTick) {
          continue;
        }
        const view = defenderRing(defender, state.tick);
        if (view === null || count >= MAX_TARGET_RINGS) {
          continue;
        }
        position.set(view.x, view.y, view.z);
        scale.set(TARGET_RING_RADIUS * QUAD_DIAMETER, TARGET_RING_RADIUS * QUAD_DIAMETER, 1);
        matrix.compose(position, mesh.quaternion, scale);
        mesh.setMatrixAt(count, matrix);
        progressAttribute.setX(count, view.progress);
        alphaAttribute.setX(count, 1);
        colorAttribute.setXYZ(
          count,
          (((view.color >> 16) & 0xff) / 255) * RING_HDR,
          (((view.color >> 8) & 0xff) / 255) * RING_HDR,
          ((view.color & 0xff) / 255) * RING_HDR,
        );
        count += 1;
      }
      mesh.count = count;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        progressAttribute.needsUpdate = true;
        alphaAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
      }
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
