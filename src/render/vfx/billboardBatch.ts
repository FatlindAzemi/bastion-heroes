/**
 * One instanced batch of camera-facing textured quads (spec 9.7): damage numbers,
 * combo popups and the Essence orb glow use this so every text/glow layer stays at
 * one draw call. Positions and sizes are per-instance attributes; the vertex shader
 * billboards the quad in view space, so the batch needs no per-frame CPU matrices.
 */

import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Texture,
} from 'three';

/** One quad instance: world centre, world size, atlas cell, tint and opacity. */
export interface BillboardQuad {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  cell: number;
  color: number;
  alpha: number;
}

/** A pooled batch of billboard quads; `begin`/`add`/`end` per frame, no allocations. */
export interface BillboardBatch {
  readonly mesh: Mesh;
  /** Sets the atlas texture (also right after the async canvas/fonts are ready). */
  setTexture(texture: Texture): void;
  /** Starts a new frame, discarding the previous quads. */
  begin(): void;
  /** Appends one quad; extra quads past the capacity are ignored. */
  add(quad: BillboardQuad): void;
  /** Uploads the frame to the GPU. */
  end(): void;
  dispose(): void;
}

/** Creates a billboard batch with the given capacity and atlas grid (columns x rows). */
export function createBillboardBatch(
  capacity: number,
  columns: number,
  rows: number,
  texture: Texture | null,
): BillboardBatch {
  const geometry = new InstancedBufferGeometry();
  const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  geometry.setAttribute('position', new BufferAttribute(quad, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.instanceCount = 0;

  const centers = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const sizes = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
  const cells = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  const colors = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const alphas = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute('aCenter', centers);
  geometry.setAttribute('aSize', sizes);
  geometry.setAttribute('aCell', cells);
  geometry.setAttribute('aColor', colors);
  geometry.setAttribute('aAlpha', alphas);

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    uniforms: {
      map: { value: texture },
      atlas: { value: { x: columns, y: rows } },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aCenter;
      attribute vec2 aSize;
      attribute float aCell;
      attribute vec3 aColor;
      attribute float aAlpha;
      varying vec2 vQuad;
      varying float vCell;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vQuad = position.xy + 0.5;
        vCell = aCell;
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 view = modelViewMatrix * vec4(aCenter, 1.0);
        view.xy += position.xy * aSize;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec2 atlas;
      varying vec2 vQuad;
      varying float vCell;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float column = mod(vCell, atlas.x);
        float row = floor(vCell / atlas.x);
        vec2 uv = vec2(
          (column + vQuad.x) / atlas.x,
          1.0 - (row + 1.0 - vQuad.y) / atlas.y
        );
        vec4 texel = texture2D(map, uv);
        gl_FragColor = vec4(texel.rgb * vColor, texel.a * vAlpha);
      }
    `,
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 900;
  mesh.visible = false;
  let cursor = 0;
  const scratch = new Color();

  return {
    mesh,
    setTexture: (nextTexture): void => {
      material.uniforms['map'] = { value: nextTexture };
      material.needsUpdate = true;
    },
    begin: (): void => {
      cursor = 0;
    },
    add: (quadItem): void => {
      if (cursor >= capacity) {
        return;
      }
      const index = cursor;
      centers.setXYZ(index, quadItem.x, quadItem.y, quadItem.z);
      sizes.setXY(index, quadItem.width, quadItem.height);
      cells.setX(index, quadItem.cell);
      scratch.setHex(quadItem.color);
      colors.setXYZ(index, scratch.r, scratch.g, scratch.b);
      alphas.setX(index, quadItem.alpha);
      cursor += 1;
    },
    end: (): void => {
      geometry.instanceCount = cursor;
      mesh.visible = cursor > 0;
      if (cursor === 0) {
        return;
      }
      centers.needsUpdate = true;
      sizes.needsUpdate = true;
      cells.needsUpdate = true;
      colors.needsUpdate = true;
      alphas.needsUpdate = true;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
