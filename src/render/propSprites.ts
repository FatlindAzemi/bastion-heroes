/**
 * 2.5D pixel-art prop sprites for the level environment (issue #114).
 *
 * The Blender environment still builds the ground, the base gate and the portal, but its
 * trees, bushes, rocks, flowers and mushrooms moved to their own GLB mesh that the
 * renderer hides. This layer places the matching pixel-art props from
 * `public/sprites/manifest.json` at the authored positions of the old 3D props, so the
 * playfield keeps exactly the same framing with a cohesive HD-2D look.
 */
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type PerspectiveCamera,
  type Texture,
} from 'three';

import { createBottomCenterQuad } from './sprites/billboard';
import { createSpriteMaterial, type SpriteMaterial } from './sprites/material';
import { loadSpriteManifest } from './sprites/sheets';
import type { SpriteProp } from './sprites/types';

/** One prop instance placed in the world. */
interface PropPlacement {
  /** Key of the prop in the manifest (round_tree, pine_tree, bush, rock, mushroom, flower_cluster). */
  readonly prop: keyof typeof PROP_MANIFEST_KEYS;
  readonly x: number;
  readonly z: number;
  /** Height in world units (matches the old 3D prop silhouette). */
  readonly height: number;
  /** Mirror the sprite horizontally for variety. */
  readonly flip?: boolean;
  /** Draw a soft ground shadow (trees and bushes only). */
  readonly shadow?: boolean;
}

/** Manifest prop keys, kept as a typed map so a typo fails at compile time. */
const PROP_MANIFEST_KEYS = {
  tree_round: 'tree_round',
  tree_pine: 'tree_pine',
  bush: 'bush',
  rock: 'rock',
  mushroom: 'mushroom',
  flower_cluster: 'flower_cluster',
  grass_tuft_a: 'grass_tuft_a',
  grass_tuft_b: 'grass_tuft_b',
  grass_tuft_c: 'grass_tuft_c',
} as const;

/**
 * The prop placements mirror the authored positions of `build_edges()` in
 * `assets-src/blender/environment/world1.py` (1 tile = 1 unit, lane l at z = l + 0.5).
 * Heights match the old 3D silhouettes so the framing does not change.
 */
const PROP_PLACEMENTS: readonly PropPlacement[] = [
  // Far tree line behind the field.
  { prop: 'tree_round', x: 0.55, z: -1.25, height: 2.6, shadow: true },
  { prop: 'tree_round', x: 3.0, z: -1.5, height: 3.3, shadow: true },
  { prop: 'tree_pine', x: 5.6, z: -1.15, height: 2.9, shadow: true },
  { prop: 'tree_round', x: 7.9, z: -1.7, height: 3.5, shadow: true },
  // Side framing trees at the base and the portal.
  { prop: 'tree_round', x: -2.85, z: 0.7, height: 2.8, shadow: true },
  { prop: 'tree_pine', x: 12.4, z: 5.5, height: 2.4, shadow: true },
  // Bushes softening the corners and borders.
  { prop: 'bush', x: 1.7, z: -0.9, height: 0.62, shadow: true },
  { prop: 'bush', x: 4.4, z: -0.95, height: 0.5, shadow: true },
  { prop: 'bush', x: 7.0, z: -0.9, height: 0.68, shadow: true },
  { prop: 'bush', x: -2.35, z: 2.3, height: 0.56, shadow: true },
  { prop: 'bush', x: 11.1, z: 1.2, height: 0.62, shadow: true },
  // Boulders.
  { prop: 'rock', x: 1.15, z: -1.9, height: 0.42 },
  { prop: 'rock', x: 6.9, z: -1.85, height: 0.36 },
  { prop: 'rock', x: -3.0, z: 4.4, height: 0.5 },
  { prop: 'rock', x: 10.6, z: 5.3, height: 0.34 },
  { prop: 'rock', x: 2.1, z: 5.75, height: 0.3 },
  { prop: 'rock', x: 6.4, z: 5.8, height: 0.34 },
  // Front border flowers and mushrooms.
  { prop: 'flower_cluster', x: 1.1, z: 5.65, height: 0.3 },
  { prop: 'flower_cluster', x: 3.2, z: 5.9, height: 0.3 },
  { prop: 'flower_cluster', x: 4.9, z: 5.6, height: 0.3 },
  { prop: 'flower_cluster', x: 7.4, z: 5.85, height: 0.3 },
  { prop: 'flower_cluster', x: 8.6, z: 5.55, height: 0.3 },
  { prop: 'mushroom', x: 0.3, z: 5.35, height: 0.48, flip: true },
  { prop: 'mushroom', x: 5.6, z: 6.0, height: 0.4 },
  { prop: 'mushroom', x: 9.4, z: 5.5, height: 0.44, flip: true },
  { prop: 'mushroom', x: 2.2, z: -0.75, height: 0.52 },
  { prop: 'rock', x: 2.2, z: 6.15, height: 0.12 },
  { prop: 'rock', x: 4.0, z: 6.15, height: 0.12 },
  { prop: 'rock', x: 5.8, z: 6.15, height: 0.12 },
  { prop: 'rock', x: 7.6, z: 6.15, height: 0.12 },
  { prop: 'rock', x: 9.4, z: 6.15, height: 0.12 },
  // Grass tufts break up the flat dirt apron on the near and far borders.
  { prop: 'grass_tuft_b', x: 0.2, z: 6.3, height: 0.44 },
  { prop: 'grass_tuft_a', x: 0.7, z: 5.9, height: 0.32 },
  { prop: 'grass_tuft_c', x: 1.5, z: 6.25, height: 0.24 },
  { prop: 'grass_tuft_b', x: 2.8, z: 5.85, height: 0.4 },
  { prop: 'grass_tuft_a', x: 3.6, z: 6.3, height: 0.34 },
  { prop: 'grass_tuft_c', x: 4.5, z: 5.95, height: 0.26 },
  { prop: 'grass_tuft_b', x: 5.3, z: 6.35, height: 0.42 },
  { prop: 'grass_tuft_a', x: 6.2, z: 6.0, height: 0.3 },
  { prop: 'grass_tuft_c', x: 7.1, z: 6.3, height: 0.24 },
  { prop: 'grass_tuft_b', x: 8.0, z: 5.95, height: 0.45 },
  { prop: 'grass_tuft_a', x: 8.9, z: 6.25, height: 0.33 },
  { prop: 'grass_tuft_c', x: 9.7, z: 5.9, height: 0.27 },
  { prop: 'grass_tuft_b', x: -2.4, z: 1.6, height: 0.4 },
  { prop: 'grass_tuft_a', x: -2.55, z: 3.2, height: 0.31 },
  { prop: 'grass_tuft_c', x: -2.3, z: 4.6, height: 0.25 },
  { prop: 'grass_tuft_b', x: 11.3, z: 0.4, height: 0.42 },
  { prop: 'grass_tuft_a', x: 11.5, z: 3.8, height: 0.32 },
  { prop: 'grass_tuft_c', x: 11.15, z: 4.9, height: 0.26 },
  { prop: 'grass_tuft_b', x: 1.1, z: -0.3, height: 0.38 },
  { prop: 'grass_tuft_a', x: 4.8, z: -0.35, height: 0.3 },
  { prop: 'grass_tuft_c', x: 8.4, z: -0.25, height: 0.25 },
];

/** Top of the World 1 grass tiles in world units (world1 environment build). */
const PROP_GROUND_Y = 0.2;

/** Shared texture loads of the prop sheets by URL. */
const textureLoads = new Map<string, Promise<Texture | null>>();

/** Loads one prop atlas with crisp nearest-neighbour pixel sampling. */
function loadPropTexture(url: string): Promise<Texture | null> {
  const cached = textureLoads.get(url);
  if (cached !== undefined) {
    return cached;
  }
  const load = new Promise<Texture | null>((resolve) => {
    new TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
  textureLoads.set(url, load);
  return load;
}

/** The loaded prop sprite layer. */
export interface PropSpriteLayer {
  readonly group: Group;
  /** Keeps the flat props facing the camera (the level camera only shakes, never turns). */
  update(camera: PerspectiveCamera): void;
  dispose(): void;
}

/** Creates the soft ground shadow of a prop. */
function createShadow(width: number): Mesh {
  const geometry = new PlaneGeometry(width, width * 0.45);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: 0x1b1b2f,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: DoubleSide,
  });
  return new Mesh(geometry, material);
}

/** Builds one prop billboard from a loaded prop sheet. */
function buildPropMesh(
  sheet: SpriteProp,
  texture: Texture,
  placement: PropPlacement,
  camera: PerspectiveCamera,
): { mesh: Mesh; material: SpriteMaterial; geometry: PlaneGeometry } {
  const height = Math.max(0.05, placement.height);
  const width = height * (sheet.frameWidth / sheet.frameHeight);
  const material = createSpriteMaterial(texture);
  material.uvRect.set(0, 0, 1, 1);
  const geometry = createBottomCenterQuad(width, height);
  const mesh = new Mesh(geometry, material.material);
  mesh.position.set(placement.x, PROP_GROUND_Y, placement.z);
  mesh.quaternion.copy(camera.quaternion);
  if (placement.flip === true) {
    mesh.scale.x = -1;
  }
  return { mesh, material, geometry };
}

/**
 * Creates the pixel-art prop layer once the manifest and prop sheets loaded. Missing
 * assets simply leave the layer empty (the 3D environment mesh is hidden only when the
 * sprites arrived, see `createEnvironmentLayer`).
 */
export function createPropSpriteLayer(camera: PerspectiveCamera): PropSpriteLayer {
  const group = new Group();
  group.name = 'prop_sprites';
  const materials: SpriteMaterial[] = [];
  const geometries: PlaneGeometry[] = [];
  const shadows: Mesh[] = [];
  const billboards: Mesh[] = [];
  const manifestUrl = `${import.meta.env.BASE_URL}sprites/manifest.json`;

  void loadSpriteManifest(manifestUrl).then(async (manifest) => {
    if (manifest === null) {
      return;
    }
    const textures = await Promise.all(
      Object.values(PROP_MANIFEST_KEYS).map(async (key) => {
        const prop = manifest.props[key];
        if (prop === undefined) {
          return [key, null] as const;
        }
        return [key, await loadPropTexture(prop.image)] as const;
      }),
    );
    const textureByKey = new Map(textures);
    for (const placement of PROP_PLACEMENTS) {
      const sheet = manifest.props[placement.prop];
      const texture = textureByKey.get(placement.prop);
      if (sheet === undefined || texture === null || texture === undefined) {
        continue;
      }
      const built = buildPropMesh(sheet, texture, placement, camera);
      group.add(built.mesh);
      billboards.push(built.mesh);
      materials.push(built.material);
      geometries.push(built.geometry);
      if (placement.shadow === true) {
        const width = Math.max(0.5, placement.height * 0.5);
        const shadow = createShadow(width);
        shadow.position.set(placement.x, PROP_GROUND_Y + 0.01, placement.z + 0.1);
        group.add(shadow);
        shadows.push(shadow);
      }
    }
  });

  return {
    group,
    update: (targetCamera: PerspectiveCamera): void => {
      for (const mesh of billboards) {
        mesh.quaternion.copy(targetCamera.quaternion);
      }
    },
    dispose: (): void => {
      for (const material of materials) {
        material.dispose();
      }
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const shadow of shadows) {
        shadow.geometry.dispose();
        const material = shadow.material as MeshBasicMaterial;
        material.dispose();
      }
      materials.length = 0;
      geometries.length = 0;
      shadows.length = 0;
      billboards.length = 0;
      group.clear();
    },
  };
}
