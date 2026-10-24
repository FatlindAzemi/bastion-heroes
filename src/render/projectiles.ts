import { Group, Mesh, MeshToonMaterial, SphereGeometry } from 'three';

import { rules } from '../data/rules';
import type { ProjectileState } from '../sim/types';
import { projectileColor } from './greyboxPalette';
import { createToonMaterial } from './toonMaterial';
import { InterpolatedObjects } from './viewMap';
import { laneToWorldZ, simXToWorldX } from './worldMapping';

/** Projectile sphere size and flight height (greybox art, spec 9.7 arrives in M3). */
const PROJECTILE_RADIUS = 0.1 * rules.grid.tileSize;
const PROJECTILE_HEIGHT = 0.45 * rules.grid.tileSize;

/** Greybox spheres for projectiles in flight, driven by the sim events (spec 11.7). */
export interface ProjectileLayer {
  spawn(id: number, kind: string, x: number, lane: number): void;
  remove(id: number): void;
  sync(projectiles: readonly ProjectileState[]): void;
  apply(alpha: number): void;
  dispose(): void;
}

/** Creates the projectile layer; the layer owns its group and cleans it up in `dispose`. */
export function createProjectileLayer(parent: Group): ProjectileLayer {
  const geometry = new SphereGeometry(PROJECTILE_RADIUS, 12, 8);
  const objects = new InterpolatedObjects();
  const materials = new Map<number, MeshToonMaterial>();

  /** Returns the shared projectile material of a colour. */
  function materialFor(color: number): MeshToonMaterial {
    const existing = materials.get(color);
    if (existing !== undefined) {
      return existing;
    }
    const material = createToonMaterial(color);
    materials.set(color, material);
    return material;
  }

  /** Creates a projectile sphere at its first position, if it does not exist yet. */
  function addProjectile(id: number, kind: string, x: number, lane: number): void {
    if (objects.has(id)) {
      return;
    }
    const mesh = new Mesh(geometry, materialFor(projectileColor(kind)));
    parent.add(mesh);
    objects.add(id, mesh, simXToWorldX(x), PROJECTILE_HEIGHT, laneToWorldZ(lane));
  }

  /** Detaches and forgets one projectile. */
  function removeProjectile(id: number): void {
    const object = objects.remove(id);
    if (object !== null) {
      parent.remove(object);
    }
  }

  /** Removes projectiles that ended without a `projectileEnded` event (spec 11.7 safety). */
  function removeMissing(seen: ReadonlySet<number>): void {
    for (const id of [...objects.ids()]) {
      if (!seen.has(id)) {
        removeProjectile(id);
      }
    }
  }

  return {
    spawn: addProjectile,
    remove: removeProjectile,
    sync: (projectiles): void => {
      const seen = new Set<number>();
      for (const projectile of projectiles) {
        seen.add(projectile.id);
        const x = simXToWorldX(projectile.x);
        const z = laneToWorldZ(projectile.lane);
        if (objects.has(projectile.id)) {
          objects.moveTo(projectile.id, x, PROJECTILE_HEIGHT, z);
        } else {
          addProjectile(projectile.id, projectile.kind, projectile.x, projectile.lane);
        }
      }
      removeMissing(seen);
    },
    apply: (alpha): void => {
      objects.apply(alpha);
    },
    dispose: (): void => {
      parent.clear();
      geometry.dispose();
      for (const material of materials.values()) {
        material.dispose();
      }
    },
  };
}
