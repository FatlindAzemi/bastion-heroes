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
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createBottomCenterQuad } from './sprites/billboard';
import { createSpriteMaterial, type SpriteMaterial } from './sprites/material';
import { loadSpriteManifest } from './sprites/sheets';
import type { SpriteManifest, SpriteProp } from './sprites/types';

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
 * Prop composition for the portrait camera (issue #115). The camera looks along +x, so
 * world z is the screen's horizontal axis: z < 0 is the left edge, z > 5 the right edge,
 * x > 9 the far side behind the portal and x < 0 the foreground at the base.
 *
 * The props frame the board like a stage: a tree wall on both sides, a few trees behind
 * the portal, low growth hugging the board edges and nothing on or in front of the base.
 */
const PROP_PLACEMENTS: readonly PropPlacement[] = [
  // Left tree wall.
  { prop: 'tree_round', x: 0.55, z: -1.25, height: 2.6, shadow: true },
  { prop: 'tree_round', x: 3.0, z: -1.5, height: 3.3, shadow: true },
  { prop: 'tree_pine', x: 5.6, z: -1.15, height: 2.9, shadow: true },
  { prop: 'tree_round', x: 7.9, z: -1.7, height: 3.5, shadow: true },
  // Right tree wall, mirrored with different species so the frame is not symmetric.
  { prop: 'tree_pine', x: 0.9, z: 6.3, height: 2.7, shadow: true, flip: true },
  { prop: 'tree_round', x: 3.4, z: 6.55, height: 3.2, shadow: true, flip: true },
  { prop: 'tree_round', x: 5.9, z: 6.2, height: 2.8, shadow: true },
  { prop: 'tree_pine', x: 8.2, z: 6.7, height: 3.4, shadow: true, flip: true },
  // Trees behind the portal close the far end of the stage.
  { prop: 'tree_pine', x: 11.8, z: -0.4, height: 3.1, shadow: true },
  { prop: 'tree_round', x: 12.4, z: 1.3, height: 3.4, shadow: true },
  { prop: 'tree_round', x: 12.2, z: 3.9, height: 3.3, shadow: true, flip: true },
  { prop: 'tree_pine', x: 11.7, z: 5.5, height: 3.0, shadow: true, flip: true },
  // Bushes at the feet of the tree walls and at the two foreground corners.
  { prop: 'bush', x: 1.8, z: -0.95, height: 0.62, shadow: true },
  { prop: 'bush', x: 4.5, z: -1.0, height: 0.54, shadow: true },
  { prop: 'bush', x: 7.0, z: -0.95, height: 0.68, shadow: true },
  { prop: 'bush', x: 2.2, z: 6.0, height: 0.6, shadow: true, flip: true },
  { prop: 'bush', x: 4.8, z: 6.05, height: 0.66, shadow: true },
  { prop: 'bush', x: 7.3, z: 5.95, height: 0.56, shadow: true, flip: true },
  { prop: 'bush', x: -1.75, z: -0.75, height: 0.74, shadow: true },
  { prop: 'bush', x: -1.75, z: 5.75, height: 0.74, shadow: true, flip: true },
  // Boulders anchoring the portal pillars.
  { prop: 'rock', x: 9.2, z: -0.75, height: 0.46 },
  { prop: 'rock', x: 9.3, z: 5.8, height: 0.42 },
  // Mushrooms and flowers in small deliberate clusters along both board edges.
  { prop: 'mushroom', x: 2.6, z: -0.55, height: 0.44 },
  { prop: 'flower_cluster', x: 3.05, z: -0.5, height: 0.3 },
  { prop: 'mushroom', x: 6.2, z: 5.6, height: 0.46, flip: true },
  { prop: 'flower_cluster', x: 5.7, z: 5.55, height: 0.3 },
  { prop: 'flower_cluster', x: 0.7, z: 5.5, height: 0.3 },
  { prop: 'flower_cluster', x: 7.9, z: -0.5, height: 0.3 },
  // Grass tufts soften the seam between the board and the dirt on both edges.
  { prop: 'grass_tuft_b', x: 0.4, z: -0.4, height: 0.4 },
  { prop: 'grass_tuft_a', x: 1.3, z: -0.32, height: 0.3 },
  { prop: 'grass_tuft_a', x: 3.7, z: -0.36, height: 0.26 },
  { prop: 'grass_tuft_b', x: 4.9, z: -0.42, height: 0.38 },
  { prop: 'grass_tuft_a', x: 6.4, z: -0.34, height: 0.3 },
  { prop: 'grass_tuft_b', x: 8.5, z: -0.38, height: 0.26 },
  { prop: 'grass_tuft_b', x: 1.6, z: 5.42, height: 0.4 },
  { prop: 'grass_tuft_a', x: 2.9, z: 5.34, height: 0.3 },
  { prop: 'grass_tuft_a', x: 4.3, z: 5.38, height: 0.26 },
  { prop: 'grass_tuft_b', x: 7.2, z: 5.42, height: 0.38 },
  { prop: 'grass_tuft_a', x: 8.4, z: 5.34, height: 0.3 },
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

/** Shared material of every prop ground shadow. */
function createShadowMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0x1b1b2f,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** The soft ground shadow quad of one prop, in world space. */
function shadowGeometry(placement: PropPlacement): BufferGeometry {
  const width = Math.max(0.5, placement.height * 0.5);
  const geometry = new PlaneGeometry(width, width * 0.45);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(placement.x, PROP_GROUND_Y + 0.01, placement.z + 0.1);
  return geometry;
}

/**
 * The camera-facing quad of one prop, baked into world space: bottom-centre anchor,
 * mirrored UVs for flipped props. The level camera never turns (spec 9.1), so props
 * of one sheet can share one merged mesh and one draw call (spec 9.3 budget).
 */
function propGeometry(
  sheet: SpriteProp,
  placement: PropPlacement,
  rotation: Quaternion,
): BufferGeometry {
  const height = Math.max(0.05, placement.height);
  const width = height * (sheet.frameWidth / sheet.frameHeight);
  const geometry = createBottomCenterQuad(width, height);
  if (placement.flip === true) {
    const uv = geometry.getAttribute('uv');
    for (let index = 0; index < uv.count; index += 1) {
      uv.setX(index, 1 - uv.getX(index));
    }
  }
  geometry.applyQuaternion(rotation);
  geometry.translate(placement.x, PROP_GROUND_Y, placement.z);
  return geometry;
}

/** Merges geometries into one, freeing the parts; null when there are none. */
function mergeAll(parts: BufferGeometry[]): BufferGeometry | null {
  const merged = parts.length === 0 ? null : mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return merged;
}

/** One merged billboard mesh per prop sheet. */
interface PropBatch {
  readonly sheet: SpriteProp;
  readonly placements: readonly PropPlacement[];
  readonly material: SpriteMaterial;
  readonly mesh: Mesh;
}

/** (Re)bakes a batch's merged geometry for the camera orientation. */
function bakeBatch(batch: PropBatch, rotation: Quaternion): void {
  const merged = mergeAll(batch.placements.map((p) => propGeometry(batch.sheet, p, rotation)));
  batch.mesh.geometry.dispose();
  batch.mesh.geometry = merged ?? new BufferGeometry();
}

/** Groups the placements by prop sheet. */
function placementsBySheet(): Map<PropPlacement['prop'], PropPlacement[]> {
  const groups = new Map<PropPlacement['prop'], PropPlacement[]>();
  for (const placement of PROP_PLACEMENTS) {
    const list = groups.get(placement.prop) ?? [];
    list.push(placement);
    groups.set(placement.prop, list);
  }
  return groups;
}

/** Loads every prop sheet named in the manifest; missing sheets map to null. */
async function loadPropSheets(
  manifest: SpriteManifest,
): Promise<Map<PropPlacement['prop'], { sheet: SpriteProp; texture: Texture } | null>> {
  const entries = await Promise.all(
    Object.values(PROP_MANIFEST_KEYS).map(async (key) => {
      const sheet = manifest.props[key];
      const texture = sheet === undefined ? null : await loadPropTexture(sheet.image);
      return [key, sheet === undefined || texture === null ? null : { sheet, texture }] as const;
    }),
  );
  return new Map(entries);
}

/** Builds the per-sheet batches and the merged shadow mesh into the group. */
function buildBatches(
  group: Group,
  sheets: Awaited<ReturnType<typeof loadPropSheets>>,
  rotation: Quaternion,
): { batches: PropBatch[]; shadow: Mesh | null } {
  const batches: PropBatch[] = [];
  const shadowParts: BufferGeometry[] = [];
  for (const [key, placements] of placementsBySheet()) {
    const loaded = sheets.get(key);
    if (loaded === null || loaded === undefined) {
      continue;
    }
    const material = createSpriteMaterial(loaded.texture);
    material.uvRect.set(0, 0, 1, 1);
    const batch = {
      ...loaded,
      placements,
      material,
      mesh: new Mesh(new BufferGeometry(), material.material),
    };
    bakeBatch(batch, rotation);
    group.add(batch.mesh);
    batches.push(batch);
    shadowParts.push(...placements.filter((p) => p.shadow === true).map(shadowGeometry));
  }
  const shadowGeometryMerged = mergeAll(shadowParts);
  const shadow =
    shadowGeometryMerged === null ? null : new Mesh(shadowGeometryMerged, createShadowMaterial());
  if (shadow !== null) {
    group.add(shadow);
  }
  return { batches, shadow };
}

/**
 * Creates the pixel-art prop layer once the manifest and prop sheets loaded. Missing
 * assets simply leave the layer empty (the 3D environment mesh is hidden only when the
 * sprites arrived, see `createEnvironmentLayer`).
 */
export function createPropSpriteLayer(camera: PerspectiveCamera): PropSpriteLayer {
  const group = new Group();
  group.name = 'prop_sprites';
  const bakedRotation = new Quaternion().copy(camera.quaternion);
  let built: { batches: PropBatch[]; shadow: Mesh | null } = { batches: [], shadow: null };
  let disposed = false;
  const manifestUrl = `${import.meta.env.BASE_URL}sprites/manifest.json`;

  void loadSpriteManifest(manifestUrl).then(async (manifest) => {
    if (manifest === null) {
      return;
    }
    const sheets = await loadPropSheets(manifest);
    if (!disposed) {
      built = buildBatches(group, sheets, bakedRotation);
    }
  });

  return {
    group,
    update: (targetCamera: PerspectiveCamera): void => {
      // The level camera only shakes; re-bake only if it ever turns.
      if (bakedRotation.angleTo(targetCamera.quaternion) < 1e-6) {
        return;
      }
      bakedRotation.copy(targetCamera.quaternion);
      for (const batch of built.batches) {
        bakeBatch(batch, bakedRotation);
      }
    },
    dispose: (): void => {
      disposed = true;
      for (const batch of built.batches) {
        batch.material.dispose();
        batch.mesh.geometry.dispose();
      }
      if (built.shadow !== null) {
        built.shadow.geometry.dispose();
        (built.shadow.material as MeshBasicMaterial).dispose();
      }
      built = { batches: [], shadow: null };
      group.clear();
    },
  };
}
