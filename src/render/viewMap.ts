import { Object3D, Vector3 } from 'three';

/** One rendered entity with the previous and current position used for interpolation (spec 11.4). */
interface InterpolatedObject {
  readonly object: Object3D;
  readonly previous: Vector3;
  readonly current: Vector3;
}

/**
 * Keeps one `Object3D` per simulation id (spec 11.2, 11.7) and stores every entity's
 * previous and current position so `draw(alpha)` can lerp between ticks (spec 11.4).
 */
export class InterpolatedObjects {
  private readonly items = new Map<number, InterpolatedObject>();

  /** Number of rendered entities; a leak check on the spawn/despawn path (spec 11.7). */
  get size(): number {
    return this.items.size;
  }

  /** Whether an entity with this simulation id is already rendered. */
  has(id: number): boolean {
    return this.items.has(id);
  }

  /** Returns the rendered object of a simulation id, if any. */
  objectOf(id: number): Object3D | null {
    return this.items.get(id)?.object ?? null;
  }

  /** Registers a new object at its first position (previous = current, so it starts still). */
  add(id: number, object: Object3D, x: number, y: number, z: number): void {
    const position = new Vector3(x, y, z);
    object.position.copy(position);
    this.items.set(id, { object, previous: position.clone(), current: position });
  }

  /** Moves an entity to the next tick's position, keeping the old one for the lerp. */
  moveTo(id: number, x: number, y: number, z: number): void {
    const item = this.items.get(id);
    if (item === undefined) {
      return;
    }
    item.previous.copy(item.current);
    item.current.set(x, y, z);
  }

  /** Removes an entity and returns its object so the caller can detach it from the scene. */
  remove(id: number): Object3D | null {
    const item = this.items.get(id);
    if (item === undefined) {
      return null;
    }
    this.items.delete(id);
    return item.object;
  }

  /** Returns the simulation ids that currently have a rendered object. */
  ids(): IterableIterator<number> {
    return this.items.keys();
  }

  /** Lerps every object between its previous and current position; alpha is 0 to 1 (spec 11.4). */
  apply(alpha: number): void {
    const amount = Math.min(Math.max(alpha, 0), 1);
    for (const item of this.items.values()) {
      item.object.position.lerpVectors(item.previous, item.current, amount);
    }
  }
}
