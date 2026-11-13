/**
 * Procedural masonry for the stone structures of World 1 (spec 9.2, issue #115).
 *
 * The base wall and the portal pillars ship as flat grey palette colours. This patch
 * paints staggered stone blocks with mortar lines, per-block tint and a grounded dark
 * foot onto every grey surface, from the world position. Coloured parts (gate, banners,
 * crystals) are left untouched. No textures, no extra draw calls.
 */
import type { MeshToonMaterial } from 'three';

/** Tuning of the painted masonry. Presentation only. */
export const MASONRY_SURFACE = {
  /** Stone block size in world units. */
  blockLength: 0.52,
  blockHeight: 0.26,
  /** Darkness of a mortar line (1 = invisible). */
  mortarShade: 0.6,
  /** Brightness spread between two neighbouring blocks. */
  blockTintSpread: 0.22,
} as const;

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vMasonryWorld;
varying vec3 vMasonryNormal;
`;

const VERTEX_BODY = /* glsl */ `
vMasonryWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vMasonryNormal = normalize( mat3( modelMatrix ) * objectNormal );
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying vec3 vMasonryWorld;
varying vec3 vMasonryNormal;

float masonryHash( vec2 p ) {
  p = fract( p * vec2( 0.1031, 0.1030 ) );
  p += dot( p, p.yx + 33.33 );
  return fract( ( p.x + p.y ) * p.x );
}
`;

const FRAGMENT_BODY = /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  float chroma = max( base.r, max( base.g, base.b ) ) - min( base.r, min( base.g, base.b ) );
  float isStone = 1.0 - smoothstep( 0.16, 0.3, chroma );
  vec3 w = vMasonryWorld;
  vec3 n = abs( vMasonryNormal );
  vec2 blockSize = vec2( ${MASONRY_SURFACE.blockLength.toFixed(2)}, ${MASONRY_SURFACE.blockHeight.toFixed(2)} );

  // Wall faces lay blocks along their horizontal axis; top faces use a paving grid.
  float along = mix( w.z, w.x, step( n.x, n.z ) );
  vec2 wall = vec2( along, w.y ) / blockSize;
  vec2 paving = w.xz / blockSize.x;
  vec2 grid = mix( wall, paving, step( 0.6, n.y ) );
  grid.x += 0.5 * mod( floor( grid.y ), 2.0 );

  vec2 cell = fract( grid );
  float mortar = smoothstep( 0.0, 0.05, min( cell.x, 1.0 - cell.x ) )
    * smoothstep( 0.0, 0.1, min( cell.y, 1.0 - cell.y ) );
  float tint = 1.0 + ( masonryHash( floor( grid ) ) - 0.5 ) * ${MASONRY_SURFACE.blockTintSpread.toFixed(2)};
  float grain = 0.95 + 0.1 * masonryHash( floor( w.xz * 23.0 ) + floor( w.y * 23.0 ) );
  // The top edge of each block catches the light, the wall foot sinks into shadow.
  float bevel = 1.0 + 0.1 * smoothstep( 0.75, 0.95, cell.y ) * ( 1.0 - step( 0.6, n.y ) );
  float foot = mix( 0.7, 1.0, smoothstep( 0.2, 0.75, w.y ) );

  vec3 stone = base * vec3( 1.05, 1.0, 0.93 ) * tint * grain * bevel * foot;
  stone *= mix( ${MASONRY_SURFACE.mortarShade.toFixed(2)}, 1.0, mortar );
  diffuseColor.rgb = mix( base, stone, isStone );
}
`;

/** Patches a structure toon material in place so its grey surfaces read as masonry. */
export function applyMasonrySurface(material: MeshToonMaterial): void {
  material.onBeforeCompile = (shader): void => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_BODY}`);
  };
  material.customProgramCacheKey = (): string => 'world1-masonry-surface';
  material.needsUpdate = true;
}
