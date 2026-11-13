/**
 * Animated enemy portal (spec 9.2, 9.4, 9.7; issue #115).
 *
 * The environment model's portal is a static stack of flat discs. This layer puts a
 * swirling, bloom-lit energy surface in front of it and a soft violet glow on the ground,
 * so the portal reads as the living source of the Gloom. Two draw calls, no textures.
 */
import {
  AdditiveBlending,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

import { rules } from '../data/rules';

/** Portal mouth of `build_portal()` in `assets-src/blender/environment/world1.py`. */
export const PORTAL_VORTEX = {
  /** World x of the swirl surface, just in front of the modelled portal discs. */
  x: 9.27,
  /** World y of the portal centre. */
  y: 1.8,
  /** Radius of the swirl surface in world units. */
  radius: 1.78,
  /** Radius of the violet glow on the ground in front of the portal. */
  groundGlowRadius: 3.2,
  /** Brightness of the hot core; values above 1 feed the bloom pass (spec 9.2). */
  coreIntensity: 1.5,
} as const;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const SWIRL_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uCore;

float hash( vec2 p ) {
  p = fract( p * vec2( 0.1031, 0.1030 ) );
  p += dot( p, p.yx + 33.33 );
  return fract( ( p.x + p.y ) * p.x );
}

float noise( vec2 p ) {
  vec2 cell = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( hash( cell ), hash( cell + vec2( 1.0, 0.0 ) ), f.x ),
    mix( hash( cell + vec2( 0.0, 1.0 ) ), hash( cell + vec2( 1.0, 1.0 ) ), f.x ),
    f.y );
}

float fbm( vec2 p ) {
  return 0.55 * noise( p ) + 0.3 * noise( p * 2.1 + 7.0 ) + 0.15 * noise( p * 4.3 + 19.0 );
}

void main() {
  vec2 centred = vUv * 2.0 - 1.0;
  float radius = length( centred );
  float angle = atan( centred.y, centred.x );

  // Spiral arms: the angle is twisted by the radius and everything rotates inwards.
  float twist = angle + 2.6 / ( radius + 0.28 ) - uTime * 0.9;
  vec2 swirl = vec2( cos( twist ), sin( twist ) ) * ( radius * 2.4 + 0.4 );
  float arms = fbm( swirl + vec2( 0.0, uTime * 0.35 ) );
  float streaks = 0.5 + 0.5 * sin( twist * 5.0 + arms * 5.0 );
  float energy = arms * 0.65 + streaks * 0.35;

  vec3 abyss = vec3( 0.07, 0.02, 0.2 );
  vec3 violet = vec3( 0.5, 0.2, 1.0 );
  vec3 magenta = vec3( 0.95, 0.3, 1.0 );
  vec3 cyan = vec3( 0.3, 0.95, 1.0 );
  vec3 color = mix( abyss, violet, smoothstep( 0.25, 0.6, energy ) );
  color = mix( color, magenta, smoothstep( 0.6, 0.85, energy ) * 0.75 );

  // Hot cyan-white core and a bright energy rim (both bloom).
  float pulse = 0.9 + 0.1 * sin( uTime * 2.3 );
  float core = smoothstep( 0.42, 0.0, radius ) * pulse;
  color = mix( color, cyan, core * 0.85 );
  color += vec3( 1.0, 1.0, 1.0 ) * pow( core, 3.0 ) * uCore;
  float rim = smoothstep( 0.78, 0.93, radius ) * smoothstep( 1.0, 0.94, radius );
  color += magenta * rim * ( 0.9 + 0.6 * energy );

  float alpha = smoothstep( 1.0, 0.95, radius );
  gl_FragColor = vec4( color, alpha );
}
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
void main() {
  float radius = length( vUv * 2.0 - 1.0 );
  float falloff = pow( max( 0.0, 1.0 - radius ), 2.0 );
  float pulse = 0.82 + 0.18 * sin( uTime * 1.7 );
  gl_FragColor = vec4( vec3( 0.42, 0.16, 0.95 ) * falloff * pulse * 0.6, 1.0 );
}
`;

/** The animated portal of one level scene. */
export interface PortalVortex {
  readonly group: Group;
  update(timeSeconds: number): void;
  dispose(): void;
}

/** Creates the swirl surface and its ground glow at the enemy spawn (spec 3.1). */
export function createPortalVortex(): PortalVortex {
  const group = new Group();
  group.name = 'portal_vortex';
  const centreZ = (rules.grid.laneCount * rules.grid.tileSize) / 2;
  const time = { value: 0 };

  const swirlGeometry = new CircleGeometry(PORTAL_VORTEX.radius, 48);
  const swirlMaterial = new ShaderMaterial({
    uniforms: { uTime: time, uCore: { value: PORTAL_VORTEX.coreIntensity } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: SWIRL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const swirl = new Mesh(swirlGeometry, swirlMaterial);
  // The circle faces +z by default; turn it to face the camera side (-x).
  swirl.rotation.y = -Math.PI / 2;
  swirl.position.set(PORTAL_VORTEX.x, PORTAL_VORTEX.y, centreZ);
  swirl.renderOrder = 1;
  group.add(swirl);

  const glowSize = PORTAL_VORTEX.groundGlowRadius * 2;
  const glowGeometry = new PlaneGeometry(glowSize, glowSize);
  glowGeometry.rotateX(-Math.PI / 2);
  const glowMaterial = new ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: VERTEX_SHADER,
    fragmentShader: GLOW_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.position.set(PORTAL_VORTEX.x - 0.7, 0.23, centreZ);
  group.add(glow);

  return {
    group,
    update: (timeSeconds: number): void => {
      time.value = timeSeconds;
    },
    dispose: (): void => {
      swirlGeometry.dispose();
      swirlMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      group.clear();
    },
  };
}
