/**
 * glTF model loading and per-unit animation for the style pilot (spec 9.6, 11.7,
 * 12.6). Models are optimized with EXT_meshopt_compression, so the GLTFLoader
 * gets MeshoptDecoder; each spawned unit is a SkeletonUtils clone with its own
 * AnimationMixer and its own toon materials (so the hit flash lights up one unit
 * only). The palette texture is embedded in the .glb and sampled nearest, and
 * every skinned mesh gets the spec 9.2 inverted-hull outline.
 */

import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  BackSide,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { getToonGradientMap } from './toonMaterial';

/** The models committed so far (issues #66, #67, #70; more arrive in 3.6/3.7). */
export const PILOT_MODEL_IDS = [
  'glowshroom_monk',
  'sparkbolt_gremlin',
  'gloomling',
  'pothead',
  'shieldbearer',
  'boomcap_brewer',
  'snowpup_yeti',
] as const;

/** Outline colour and thickness of spec 9.2. */
const OUTLINE_COLOR = 0x1b1b2f;
const OUTLINE_THICKNESS = 0.02;

/** One loaded model: the glTF scene is the template for per-unit clones. */
export interface PilotModelAsset {
  readonly scene: Group;
  readonly animations: readonly AnimationClip[];
}

/** Lazily loaded model library; `ready` resolves when every load attempt finished. */
export interface PilotModelLibrary {
  get(id: string): PilotModelAsset | null;
  readonly ready: Promise<void>;
  dispose(): void;
}

/**
 * The shared inverted-hull material for skinned meshes: a black back-face toon
 * material whose vertices are pushed out along their skinned normals.
 */
const skinnedOutlineMaterial = new MeshToonMaterial({
  color: OUTLINE_COLOR,
  side: BackSide,
  gradientMap: getToonGradientMap(),
});
skinnedOutlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <skinning_vertex>',
    '#include <skinning_vertex>\n\ttransformed += objectNormal * ' +
      OUTLINE_THICKNESS.toFixed(3) +
      ';',
  );
};

/** Prepares the palette texture for pixel-exact swatch sampling (spec 9.3). */
function configurePaletteTexture(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

/** A per-unit toon material that keeps the palette map of an imported material. */
function toonMaterialFor(source: Mesh['material']): MeshToonMaterial | MeshToonMaterial[] {
  if (Array.isArray(source)) {
    return source.map((material) => toonMaterialForSingle(material));
  }
  return toonMaterialForSingle(source);
}

function toonMaterialForSingle(source: Mesh['material']): MeshToonMaterial {
  const map = source instanceof MeshStandardMaterial ? source.map : null;
  if (map !== null) {
    configurePaletteTexture(map);
  }
  return new MeshToonMaterial({ map, gradientMap: getToonGradientMap() });
}

/** Adds the skinned inverted-hull outline as a sibling of the skinned mesh. */
function addSkinnedOutline(mesh: SkinnedMesh): void {
  const outline = new SkinnedMesh(mesh.geometry, skinnedOutlineMaterial);
  outline.name = 'outline';
  outline.bind(mesh.skeleton, mesh.bindMatrix);
  outline.frustumCulled = false;
  outline.position.copy(mesh.position);
  outline.quaternion.copy(mesh.quaternion);
  outline.scale.copy(mesh.scale);
  mesh.parent?.add(outline);
}

/** Loads every pilot model once; a failed model keeps the capsule fallback. */
export function createPilotModels(): PilotModelLibrary {
  const assets = new Map<string, PilotModelAsset>();
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let disposed = false;

  const ready = Promise.all(
    PILOT_MODEL_IDS.map(async (id) => {
      const url = `${import.meta.env.BASE_URL}models/${id}.glb`;
      try {
        const gltf = await loader.loadAsync(url);
        const scene = gltf.scene as Group;
        scene.traverse((child) => {
          if (child instanceof Mesh) {
            // Animated skinned meshes can leave their rest-pose bounds and pop.
            child.frustumCulled = false;
          }
        });
        assets.set(id, { scene, animations: gltf.animations });
        console.log(`models: loaded ${id} (${gltf.animations.length} clips)`);
      } catch (error) {
        console.error(`models: failed to load ${url}`, error);
      }
    }),
  ).then(() => undefined);

  return {
    get: (id): PilotModelAsset | null => assets.get(id) ?? null,
    ready: ready.then(() => {
      if (disposed) {
        disposeAssets(assets);
      }
    }),
    dispose: (): void => {
      disposed = true;
      disposeAssets(assets);
    },
  };
}

/** Frees the GPU resources of the loaded scenes (clones share their geometry). */
function disposeAssets(assets: Map<string, PilotModelAsset>): void {
  for (const asset of assets.values()) {
    asset.scene.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof MeshToonMaterial && material.map !== null) {
          material.map.dispose();
        }
        material.dispose();
      }
    });
  }
  assets.clear();
}

/** One animated unit instance created from a loaded model. */
export interface ModelInstance {
  readonly object: Object3D;
  /** Plays a looping base clip (idle for defenders, walk for enemies). */
  playBase(clipName: string): void;
  /** Plays a one-shot clip and returns to the base clip when it finishes. */
  playOneShot(clipName: string): void;
  /** Mixes the toon materials towards white for the spec 9.2 hit flash. */
  setFlash(on: boolean): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** Clones one loaded model with its own materials, mixer and outline (spec 11.7). */
export function createModelInstance(asset: PilotModelAsset): ModelInstance | null {
  const object = cloneSkeleton(asset.scene) as Group;
  const materials = new Set<MeshToonMaterial>();
  const skinnedMeshes: SkinnedMesh[] = [];
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    const toon = toonMaterialFor(child.material);
    child.material = toon;
    for (const material of Array.isArray(toon) ? toon : [toon]) {
      materials.add(material);
    }
    if (child instanceof SkinnedMesh) {
      skinnedMeshes.push(child);
    }
  });
  for (const mesh of skinnedMeshes) {
    addSkinnedOutline(mesh);
  }
  const mixer = new AnimationMixer(object);
  const actions = new Map<string, AnimationAction>();
  for (const clip of asset.animations) {
    actions.set(clip.name, mixer.clipAction(clip));
  }
  let baseAction: AnimationAction | null = null;
  let oneShotAction: AnimationAction | null = null;
  mixer.addEventListener('finished', (event) => {
    if (event.action !== oneShotAction) {
      return;
    }
    oneShotAction = null;
    baseAction?.reset().fadeIn(0.08).play();
  });

  return {
    object,
    playBase: (clipName): void => {
      const action = actions.get(clipName);
      if (action === undefined || action === baseAction) {
        return;
      }
      action.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.15).play();
      baseAction?.fadeOut(0.15);
      baseAction = action;
    },
    playOneShot: (clipName): void => {
      const action = actions.get(clipName);
      if (action === undefined) {
        return;
      }
      action.reset().setLoop(LoopOnce, 1).fadeIn(0.05).play();
      action.clampWhenFinished = true;
      baseAction?.fadeOut(0.05);
      oneShotAction?.fadeOut(0.05);
      oneShotAction = action;
    },
    setFlash: (on): void => {
      for (const material of materials) {
        material.emissive.setHex(on ? 0xffffff : 0x000000);
        material.emissiveIntensity = on ? 1 : 0;
      }
    },
    update: (deltaSeconds): void => {
      mixer.update(Math.min(Math.max(deltaSeconds, 0), 0.1));
    },
    dispose: (): void => {
      mixer.stopAllAction();
      for (const material of materials) {
        material.dispose();
      }
      materials.clear();
    },
  };
}
