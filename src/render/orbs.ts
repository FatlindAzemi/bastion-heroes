import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';

import { rules } from '../data/rules';
import type { OrbState } from '../sim/types';
import { GREYBOX_COLORS } from './greyboxPalette';
import { InterpolatedObjects } from './viewMap';
import { laneToWorldZ, simXToWorldX } from './worldMapping';

/** Essence orb size (spec 9.4 teal with a white core). */
const ORB_RADIUS = 0.17 * rules.grid.tileSize;
const ORB_CORE_RADIUS = 0.06 * rules.grid.tileSize;

/** Teal Essence orbs (spec 3.3, 9.4), driven by the sim events (spec 11.7). */
export interface OrbLayer {
  spawn(id: number, x: number, lane: number, height: number): void;
  remove(id: number): void;
  sync(orbs: readonly OrbState[], height: number): void;
  apply(alpha: number): void;
  dispose(): void;
}

/** Creates the orb layer; the layer owns its group and cleans it up in `dispose`. */
export function createOrbLayer(parent: Group): OrbLayer {
  const outerGeometry = new SphereGeometry(ORB_RADIUS, 14, 10);
  const coreGeometry = new SphereGeometry(ORB_CORE_RADIUS, 10, 8);
  const outerMaterial = new MeshBasicMaterial({ color: GREYBOX_COLORS.teal });
  const coreMaterial = new MeshBasicMaterial({ color: GREYBOX_COLORS.white });
  const objects = new InterpolatedObjects();

  /** Creates a teal orb with its white core at its first position. */
  function addOrb(id: number, x: number, lane: number, height: number): void {
    if (objects.has(id)) {
      return;
    }
    const orb = new Group();
    orb.add(new Mesh(outerGeometry, outerMaterial));
    orb.add(new Mesh(coreGeometry, coreMaterial));
    parent.add(orb);
    objects.add(id, orb, simXToWorldX(x), height, laneToWorldZ(lane));
  }

  /** Detaches and forgets one orb. */
  function removeOrb(id: number): void {
    const object = objects.remove(id);
    if (object !== null) {
      parent.remove(object);
    }
  }

  /** Removes orbs that disappeared without a collection/expiry event (spec 11.7 safety). */
  function removeMissing(seen: ReadonlySet<number>): void {
    for (const id of [...objects.ids()]) {
      if (!seen.has(id)) {
        removeOrb(id);
      }
    }
  }

  return {
    spawn: addOrb,
    remove: removeOrb,
    sync: (orbs, height): void => {
      const seen = new Set<number>();
      for (const orb of orbs) {
        seen.add(orb.id);
        const x = simXToWorldX(orb.x);
        const z = laneToWorldZ(orb.lane);
        if (objects.has(orb.id)) {
          objects.moveTo(orb.id, x, height, z);
        } else {
          addOrb(orb.id, orb.x, orb.lane, height);
        }
      }
      removeMissing(seen);
    },
    apply: (alpha): void => {
      objects.apply(alpha);
    },
    dispose: (): void => {
      parent.clear();
      outerGeometry.dispose();
      coreGeometry.dispose();
      outerMaterial.dispose();
      coreMaterial.dispose();
    },
  };
}
