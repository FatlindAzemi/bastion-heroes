import {
  BackSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  type BufferGeometry,
} from 'three';

/** Outline colour from spec 9.2. */
const OUTLINE_COLOR = 0x1b1b2f;

/** Vertices are pushed this far along their normals (spec 9.2: 0.02 units). */
const OUTLINE_THICKNESS = 0.02;

/** One shared material for every outline: black back faces, unlit (spec 9.2). */
const outlineMaterial = new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide });

/** Builds the pushed-out back-face geometry of an inverted hull. */
function createHullGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = source.clone();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const pushed = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    pushed[index * 3 + 0] = position.getX(index) + normal.getX(index) * OUTLINE_THICKNESS;
    pushed[index * 3 + 1] = position.getY(index) + normal.getY(index) * OUTLINE_THICKNESS;
    pushed[index * 3 + 2] = position.getZ(index) + normal.getZ(index) * OUTLINE_THICKNESS;
  }
  geometry.setAttribute('position', new Float32BufferAttribute(pushed, 3));
  return geometry;
}

/**
 * Adds the spec 9.2 inverted-hull outline to a mesh: a black back-face copy with the
 * vertices pushed 0.02 units along their normals. The outline is a child of the mesh,
 * so it follows every transform of the parent.
 */
export function addOutline(mesh: Mesh): Mesh {
  const outline = new Mesh(createHullGeometry(mesh.geometry), outlineMaterial);
  outline.name = 'outline';
  mesh.add(outline);
  return outline;
}
