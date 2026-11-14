/**
 * The Duel environment (spec 18.1, 18.7; issue #129): the World 1 ground and backdrop
 * plus two bastions, one at each end of the board. It reuses the shared World 1 model
 * and its painted ground, without the portal; the shared model itself is never
 * changed, so a later campaign level still finds it intact. Each bastion has its own
 * material so a gate hit can flash only the struck bastion. Final gate models are D2.3.
 */
import { Color, Group, Mesh, MeshToonMaterial, type BufferGeometry } from 'three';

import { loadWorld1 } from '../environment';
import { applyMasonrySurface } from '../masonrySurface';
import {
  BOARD_CENTER_X,
  halfTurnMatrix,
  keepTrianglesBelowX,
  worldFloatGeometry,
} from './bastionGeometry';

/** Which end of the drawn board: the viewer's own bastion (bottom) or the opponent's (top). */
export type BoardEnd = 'near' | 'far';

/** Seconds a gate-hit flash takes to fade. */
const GATE_FLASH_S = 0.45;
/** Peak emissive strength of the flash; above 1 the bloom pass makes the bastion glow. */
const GATE_FLASH_PEAK = 0.55;

/** The two bastions and the ground of the Duel board. */
export interface DuelEnvironment {
  readonly group: Group;
  /** Resolves true once the model is in the scene (false keeps the greybox grid). */
  readonly ready: Promise<boolean>;
  /** Flashes one bastion in `color` (a gate hit, spec 18.7). */
  flash(end: BoardEnd, color: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** One bastion mesh with its own flashing material. */
interface Bastion {
  readonly mesh: Mesh;
  readonly material: MeshToonMaterial;
  flash: number;
}

/** A mesh drawing a shared geometry and material at the source's world transform. */
function sharedCopy(source: Mesh): Mesh {
  const copy = new Mesh(source.geometry, source.material);
  source.updateWorldMatrix(true, false);
  copy.matrixAutoUpdate = false;
  copy.matrix.copy(source.matrixWorld);
  return copy;
}

/** A bastion from a geometry it owns and a masonry material of its own. */
function createBastion(geometry: BufferGeometry, template: MeshToonMaterial): Bastion {
  const material = template.clone();
  applyMasonrySurface(material);
  return { mesh: new Mesh(geometry, material), material, flash: 0 };
}

/** Builds the near (south) and far (north) bastions from the World 1 structures. */
function createBastions(root: Group): Record<BoardEnd, Bastion> | null {
  const structures = root.getObjectByName('world1_structures');
  if (!(structures instanceof Mesh) || !(structures.material instanceof MeshToonMaterial)) {
    return null;
  }
  const southHalf = keepTrianglesBelowX(worldFloatGeometry(structures), BOARD_CENTER_X);
  const northHalf = southHalf.clone().applyMatrix4(halfTurnMatrix());
  return {
    near: createBastion(southHalf, structures.material),
    far: createBastion(northHalf, structures.material),
  };
}

/** Adds the shared ground and backdrop meshes of the World 1 model. */
function addGround(group: Group, root: Group): void {
  for (const name of ['world1_ground', 'world1_backdrop']) {
    const mesh = root.getObjectByName(name);
    if (mesh instanceof Mesh) {
      group.add(sharedCopy(mesh));
    }
  }
}

/** Lets each bastion's flash fade out. */
function updateFlash(bastion: Bastion, deltaSeconds: number, color: Color): void {
  bastion.flash = Math.max(0, bastion.flash - deltaSeconds / GATE_FLASH_S);
  const strength = bastion.flash * bastion.flash * GATE_FLASH_PEAK;
  bastion.material.emissive.copy(color).multiplyScalar(strength);
}

/** Creates the Duel environment; empty until the shared World 1 model has loaded. */
export function createDuelEnvironment(): DuelEnvironment {
  const group = new Group();
  group.name = 'duel_environment';
  let bastions: Record<BoardEnd, Bastion> | null = null;
  const flashColors: Record<BoardEnd, Color> = { near: new Color(), far: new Color() };
  let disposed = false;
  const ready = loadWorld1().then((root) => {
    if (disposed || root === null) {
      return false;
    }
    addGround(group, root);
    bastions = createBastions(root);
    if (bastions !== null) {
      group.add(bastions.near.mesh, bastions.far.mesh);
    }
    return true;
  });
  return {
    group,
    ready,
    flash: (end, color): void => {
      flashColors[end].setHex(color);
      if (bastions !== null) {
        bastions[end].flash = 1;
      }
    },
    update: (deltaSeconds): void => {
      if (bastions !== null) {
        updateFlash(bastions.near, deltaSeconds, flashColors.near);
        updateFlash(bastions.far, deltaSeconds, flashColors.far);
      }
    },
    dispose: (): void => {
      disposed = true;
      for (const bastion of bastions === null ? [] : [bastions.near, bastions.far]) {
        bastion.mesh.geometry.dispose();
        bastion.material.dispose();
      }
      bastions = null;
      group.clear();
    },
  };
}
