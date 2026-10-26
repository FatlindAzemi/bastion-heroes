/**
 * Instanced ground shadows for the 2.5D sprite units (issue #114).
 *
 * Every sprite unit needs the spec 9.2 dark ground ellipse, but one mesh per shadow
 * would double the draw calls of the unit layer. All shadows therefore live in one
 * `InstancedMesh` (one draw call) whose matrices are rewritten from the unit
 * positions every frame; flying enemies keep their shadow on the ground.
 */
import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';

/** Shadow slots; more than the level can ever place (5 lanes x 9 columns + enemies). */
const MAX_SHADOWS = 96;

/** Shadow texture resolution and strength of the spec 9.2 blob shadow. */
const SHADOW_PIXELS = 128;
const SHADOW_STRENGTH = 0.4;

/** Plane height above the ground, matching the other blob shadows (spec 9.2). */
const GROUND_Y = 0.012;

/** Builds the soft dark ellipse texture shared by every instanced shadow. */
function createShadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SHADOW_PIXELS;
  canvas.height = SHADOW_PIXELS;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const radius = SHADOW_PIXELS / 2;
    const gradient = context.createRadialGradient(
      radius,
      radius,
      radius * 0.1,
      radius,
      radius,
      radius,
    );
    gradient.addColorStop(0, `rgba(0, 0, 0, ${SHADOW_STRENGTH})`);
    gradient.addColorStop(0.6, `rgba(0, 0, 0, ${SHADOW_STRENGTH * 0.45})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, SHADOW_PIXELS, SHADOW_PIXELS);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** The instanced shadow collection driven by the sprite unit layer. */
export interface UnitShadows {
  readonly object: InstancedMesh;
  /** Writes the shadow of one unit; index is its position in this frame's list. */
  set(index: number, x: number, z: number, width: number): void;
  /** Publishes the number of written shadows for this frame. */
  commit(count: number): void;
  dispose(): void;
}

/** Creates the single-draw-call ground shadow layer. */
export function createUnitShadows(): UnitShadows {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const texture = createShadowTexture();
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const object = new InstancedMesh(geometry, material, MAX_SHADOWS);
  object.name = 'spriteUnitShadows';
  object.instanceMatrix.setUsage(DynamicDrawUsage);
  object.renderOrder = 1;
  object.frustumCulled = false;
  object.count = 0;
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const rotation = new Quaternion();

  return {
    object,
    set: (index, x, z, width): void => {
      if (index < 0 || index >= MAX_SHADOWS) {
        return;
      }
      position.set(x, GROUND_Y, z);
      scale.set(Math.max(width, 0.001), 1, Math.max(width, 0.001));
      matrix.compose(position, rotation, scale);
      object.setMatrixAt(index, matrix);
    },
    commit: (count): void => {
      object.count = Math.min(MAX_SHADOWS, Math.max(0, count));
      object.instanceMatrix.needsUpdate = true;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      object.dispose();
    },
  };
}
