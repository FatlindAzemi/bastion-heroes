/**
 * World 1 environment layer (spec 9.3 row "Level environment", 9.4, 12.6; issue #73).
 *
 * Loads the optimized `public/models/world1.glb` once, converts its palette
 * material to the spec 9.2 toon material and places it at the world origin: the
 * model is authored in the spec 9.1 mapping (1 tile = 1 unit, lane l at
 * three.js z = l + 0.5), so no transform is needed and `pointerToWorld` keeps
 * working unchanged.
 *
 * The loaded environment shows playable grass on all five lanes, so the level's
 * blocked tiles (inactive lanes and `rock` terrain, spec 7.1) are overlaid with
 * the same greybox rock blocks the fallback grid uses. The greybox grid stays on
 * screen while the model loads and if loading fails, so the level is always
 * playable.
 */
import { BufferGeometry, Group, Mesh } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { rockTileGeometries, type LevelViewOptions } from './grid';
import { GREYBOX_COLORS } from './greyboxPalette';
import { toonMaterialsForMesh } from './models';
import { createToonMaterial } from './toonMaterial';

/** The environment model id in public/models/ (spec 12.1). */
const WORLD1_MODEL_ID = 'world1';
/** Top of the environment's grass tiles in three.js world units (from the glTF bounds). */
const ENVIRONMENT_TILE_TOP = 0.2;
/** Rock block base height of the greybox grid (grid.ts), lifted onto the environment tiles. */
const GREYBOX_ROCK_BASE_Y = 0.02;

/** The environment layer of one level scene: the loaded model plus the blocked-tile rocks. */
export interface EnvironmentLayer {
  /** Added to the level scene; empty until the model has loaded. */
  readonly group: Group;
  /** Resolves true once the environment model is in the scene (false keeps the greybox grid). */
  readonly ready: Promise<boolean>;
  dispose(): void;
}

/** The loaded World 1 scene, shared by every level scene for the page lifetime. */
let world1Scene: Promise<Group | null> | null = null;

/** Loads `public/models/world1.glb` once and turns its palette materials into toon materials. */
function loadWorld1(): Promise<Group | null> {
  if (world1Scene !== null) {
    return world1Scene;
  }
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  world1Scene = loader
    .loadAsync(`${import.meta.env.BASE_URL}models/${WORLD1_MODEL_ID}.glb`)
    .then((gltf) => {
      const root = gltf.scene as Group;
      root.name = 'world1_environment';
      root.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = toonMaterialsForMesh(child);
        }
      });
      console.log('environment: loaded world1');
      return root;
    })
    .catch((error: unknown) => {
      console.error('environment: failed to load world1', error);
      return null;
    });
  return world1Scene;
}

/** Adds one merged, toon-shaded rock mesh to the blocker group. */
function addRockMesh(
  group: Group,
  parts: readonly BufferGeometry[],
  color: number,
  heightOffset: number,
): void {
  if (parts.length === 0) {
    return;
  }
  const geometry = mergeGeometries([...parts], false);
  if (geometry === null) {
    throw new Error('environment blockers: geometry merge failed');
  }
  geometry.translate(0, heightOffset, 0);
  group.add(new Mesh(geometry, createToonMaterial(color)));
}

/**
 * Overlays the greybox rock blocks on the environment's blocked tiles: every tile
 * of an inactive lane and every `rock` terrain tile keeps reading as blocked
 * (spec 7.1), even though the environment model shows grass on all lanes.
 */
function createBlockers(options: LevelViewOptions): Group {
  const blockers = new Group();
  blockers.name = 'world1_blockers';
  const rocks = rockTileGeometries(options);
  const heightOffset = ENVIRONMENT_TILE_TOP - GREYBOX_ROCK_BASE_Y;
  addRockMesh(blockers, rocks.blocks, GREYBOX_COLORS.stoneDark, heightOffset);
  addRockMesh(blockers, rocks.crosses, GREYBOX_COLORS.gloom, heightOffset);
  return blockers;
}

/** Detaches and frees the per-level blocker geometry (the shared environment materials stay). */
function disposeBlockers(blockers: Group): void {
  for (const child of [...blockers.children]) {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
    blockers.remove(child);
  }
}

/**
 * Creates the environment layer for one level: the shared model group is added on
 * load, the blocked-tile rocks are added with it. Until then (and on failure) the
 * greybox grid of the level scene stays visible.
 */
export function createEnvironmentLayer(options: LevelViewOptions): EnvironmentLayer {
  const group = new Group();
  group.name = 'world1_environment_layer';
  const blockers = createBlockers(options);
  let disposed = false;
  let model: Group | null = null;

  const ready = loadWorld1().then((loaded) => {
    if (disposed || loaded === null) {
      return false;
    }
    model = loaded;
    group.add(loaded, blockers);
    return true;
  });

  return {
    group,
    ready,
    dispose: (): void => {
      disposed = true;
      if (model !== null) {
        group.remove(model);
        model = null;
      }
      disposeBlockers(blockers);
      group.clear();
    },
  };
}
