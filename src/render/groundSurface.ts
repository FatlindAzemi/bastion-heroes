/**
 * Procedural painted ground surface for the World 1 environment (spec 9.2, issue #115).
 *
 * The environment model ships flat palette colours. This module patches the ground's
 * toon material so the fragment shader paints detail from the world position: grass
 * mottling and blade grain, bevelled playfield tiles, pebbled dirt, ambient occlusion
 * around the raised board, a focus falloff away from the playfield, the portal's
 * corruption creeping over the far columns and slow drifting cloud shadows. No extra
 * geometry, textures or draw calls are needed.
 */
import type { MeshToonMaterial } from 'three';

import { rules } from '../data/rules';

/** Playfield size in world units (spec 9.1: 1 tile = 1 unit). */
const BOARD_WIDTH = rules.grid.columnCount * rules.grid.tileSize;
const BOARD_DEPTH = rules.grid.laneCount * rules.grid.tileSize;

/** Tuning of the painted surface. Presentation only; none of these are balance numbers. */
export const GROUND_SURFACE = {
  /** Darkness of the groove between two tiles (1 = no groove). */
  tileGrooveShade: 0.7,
  /** Groove half width in tiles. */
  tileGrooveWidth: 0.055,
  /** Darkest ambient occlusion right next to the raised board. */
  boardOcclusionShade: 0.62,
  /** Distance over which the board occlusion fades out, in tiles. */
  boardOcclusionReach: 0.7,
  /** How much the ground darkens far away from the playfield (0..1). */
  focusFalloff: 0.42,
  /** Strength of the violet portal corruption on the far columns (0..1). */
  corruptionStrength: 0.55,
  /** Darkness of a drifting cloud shadow (1 = no shadow). */
  cloudShade: 0.8,
} as const;

/** Shared clock of every patched ground material, in seconds. */
const timeUniform = { value: 0 };

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vGroundWorld;
varying float vGroundUp;
`;

const VERTEX_BODY = /* glsl */ `
vGroundWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vGroundUp = normalize( mat3( modelMatrix ) * objectNormal ).y;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying vec3 vGroundWorld;
varying float vGroundUp;
uniform float uGroundTime;

float groundHash( vec2 p ) {
  p = fract( p * vec2( 0.1031, 0.1030 ) );
  p += dot( p, p.yx + 33.33 );
  return fract( ( p.x + p.y ) * p.x );
}

float groundNoise( vec2 p ) {
  vec2 cell = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = groundHash( cell );
  float b = groundHash( cell + vec2( 1.0, 0.0 ) );
  float c = groundHash( cell + vec2( 0.0, 1.0 ) );
  float d = groundHash( cell + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

float groundFbm( vec2 p ) {
  float sum = 0.0;
  float amplitude = 0.5;
  for ( int octave = 0; octave < 3; octave ++ ) {
    sum += amplitude * groundNoise( p );
    p = p * 2.03 + vec2( 17.3, 9.1 );
    amplitude *= 0.5;
  }
  return sum / 0.875;
}

/** Paints grass: sunny and shaded patches plus fine blade grain along the lanes. */
vec3 paintGrass( vec3 base, vec2 p ) {
  float patches = groundFbm( p * 0.55 );
  float mottling = groundFbm( p * 2.6 + 31.0 );
  float blades = groundNoise( vec2( p.y * 46.0, p.x * 11.0 ) );
  vec3 deep = base * vec3( 0.62, 0.82, 0.6 );
  vec3 sunny = base * vec3( 1.1, 1.06, 0.78 ) + vec3( 0.03, 0.03, 0.0 );
  vec3 color = mix( deep, sunny, smoothstep( 0.25, 0.8, patches * 0.6 + mottling * 0.4 ) );
  return color * ( 0.93 + 0.14 * blades );
}

/** Paints dirt: soft clay patches with scattered darker pebbles. */
vec3 paintDirt( vec3 base, vec2 p ) {
  float patches = groundFbm( p * 0.8 + 5.0 );
  float grain = groundNoise( p * 19.0 );
  float pebble = step( 0.94, groundHash( floor( p * 9.0 ) ) )
    * smoothstep( 0.42, 0.2, length( fract( p * 9.0 ) - 0.5 ) );
  vec3 color = mix( base * vec3( 0.66, 0.6, 0.56 ), base * vec3( 0.98, 0.9, 0.78 ), patches );
  color *= 0.94 + 0.1 * grain;
  return mix( color, color * 0.62, pebble );
}
`;

const FRAGMENT_BODY = /* glsl */ `
{
  vec2 p = vGroundWorld.xz;
  vec2 boardSize = vec2( ${BOARD_WIDTH.toFixed(1)}, ${BOARD_DEPTH.toFixed(1)} );
  vec3 base = diffuseColor.rgb;
  float top = smoothstep( 0.4, 0.8, vGroundUp );
  float isGrass = step( base.r * 1.08, base.g );
  vec3 painted = mix( paintDirt( base, p ), paintGrass( base, p ), isGrass );

  // Distance outside the playfield rectangle (0 inside).
  float outside = length( max( vec2( 0.0 ), max( -p, p - boardSize ) ) );
  float onBoard = ( 1.0 - step( 0.0001, outside ) ) * top;

  // Bevelled tiles: a dark groove on the tile border and a slightly lifted centre.
  vec2 tile = fract( p );
  float edge = min( min( tile.x, 1.0 - tile.x ), min( tile.y, 1.0 - tile.y ) );
  float groove = smoothstep( 0.0, ${GROUND_SURFACE.tileGrooveWidth.toFixed(3)}, edge );
  float lift = smoothstep( 0.05, 0.42, edge );
  painted *= mix( 1.0, mix( ${GROUND_SURFACE.tileGrooveShade.toFixed(2)}, 1.0, groove ) * ( 0.95 + 0.1 * lift ), onBoard );

  // Ambient occlusion where the raised board meets the surrounding ground.
  float occlusion = mix( ${GROUND_SURFACE.boardOcclusionShade.toFixed(2)}, 1.0,
    smoothstep( 0.0, ${GROUND_SURFACE.boardOcclusionReach.toFixed(2)}, outside ) );
  painted *= mix( 1.0, occlusion, step( 0.0001, outside ) * top );

  // Side walls of the raised board read as shaded earth; other steep faces keep their colour.
  float nearBoard = 1.0 - smoothstep( 0.05, 0.3, outside );
  painted = mix( mix( base, base * vec3( 0.5, 0.42, 0.4 ), nearBoard ), painted, top );

  // The portal's corruption creeps over the far columns in slow pulsing veins.
  float veins = groundFbm( p * 1.8 + vec2( -uGroundTime * 0.12, 0.0 ) );
  float creep = smoothstep( 6.6, 9.4, p.x + veins * 1.4 ) * ( 1.0 - smoothstep( 0.0, 2.5, outside ) );
  float pulse = 0.85 + 0.15 * sin( uGroundTime * 1.7 + p.x * 2.0 );
  vec3 corrupted = painted * vec3( 0.55, 0.4, 0.86 ) + vec3( 0.07, 0.0, 0.16 ) * pulse;
  painted = mix( painted, corrupted, creep * ${GROUND_SURFACE.corruptionStrength.toFixed(2)} );

  // Focus falloff: the world cools and darkens away from the playfield.
  float distant = smoothstep( 1.2, 9.0, outside );
  painted = mix( painted, painted * vec3( 0.6, 0.68, 0.82 ), distant * ${GROUND_SURFACE.focusFalloff.toFixed(2)} );

  // Slow cloud shadows drifting across the meadow.
  float clouds = groundFbm( p * 0.21 + vec2( uGroundTime * 0.05, uGroundTime * 0.018 ) );
  painted *= mix( 1.0, ${GROUND_SURFACE.cloudShade.toFixed(2)}, smoothstep( 0.52, 0.74, clouds ) );

  diffuseColor.rgb = painted;
}
`;

/**
 * Patches a ground toon material in place so it paints the procedural surface. Safe to
 * call once per material; the material keeps its palette map and toon ramp.
 */
export function applyGroundSurface(material: MeshToonMaterial): void {
  material.onBeforeCompile = (shader): void => {
    shader.uniforms['uGroundTime'] = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_BODY}`);
  };
  material.customProgramCacheKey = (): string => 'world1-ground-surface';
  material.needsUpdate = true;
}

/** Advances the shared ground clock (cloud shadows and corruption pulse). */
export function setGroundSurfaceTime(seconds: number): void {
  timeUniform.value = seconds;
}
