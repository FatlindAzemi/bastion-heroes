/**
 * Sprite billboard shader material (issue #114).
 *
 * One material per unit (so the hit flash and the atlas frame can be per-unit
 * uniforms) but one shared texture per sheet: the pipeline is unlit pixel art, so a
 * tiny custom ShaderMaterial is cheaper than a lit standard material and gives the
 * white hit flash of spec 9.2 as a single uniform. `alphaTest ~0.5` is done with a
 * `discard`, which keeps the sprites in the opaque queue (no sorting, no blending).
 */
import { FrontSide, ShaderMaterial, Vector4, type Texture } from 'three';

/** Per-unit uniform handles; kept typed so the render loop never indexes uniforms. */
export interface SpriteMaterial {
  readonly material: ShaderMaterial;
  /** Atlas UV rectangle (u0, v0, du, dv) in texture space. */
  readonly uvRect: Vector4;
  /** 0..1 white flash amount of the spec 9.2 hit flash. */
  readonly flash: { value: number };
  dispose(): void;
}

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform vec4 uUvRect;
uniform float uFlash;

varying vec2 vUv;

void main() {
  vec2 atlasUv = uUvRect.xy + vUv * uUvRect.zw;
  vec4 texel = texture2D( uMap, atlasUv );
  if ( texel.a < 0.5 ) discard;
  vec3 flashed = mix( texel.rgb, vec3( 1.0 ), uFlash );
  gl_FragColor = vec4( flashed * ( 1.0 + uFlash ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Creates the per-unit billboard material that samples one sheet. */
export function createSpriteMaterial(texture: Texture): SpriteMaterial {
  const uvRect = new Vector4(0, 0, 1, 1);
  const flash = { value: 0 };
  const material = new ShaderMaterial({
    name: 'SpriteBillboardMaterial',
    uniforms: {
      uMap: { value: texture },
      uUvRect: { value: uvRect },
      uFlash: flash,
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: FrontSide,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    toneMapped: true,
  });
  return {
    material,
    uvRect,
    flash,
    dispose: (): void => {
      material.dispose();
    },
  };
}
