import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

const SHADOW_PIXELS = 128;
const SHADOW_STRENGTH = 0.35;

let sharedShadowTexture: CanvasTexture | null = null;

/** Builds the soft dark ellipse texture used by every blob shadow (spec 9.2). */
function getShadowTexture(): CanvasTexture {
  if (sharedShadowTexture === null) {
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
    sharedShadowTexture = new CanvasTexture(canvas);
  }
  return sharedShadowTexture;
}

/**
 * Creates a fake drop shadow for a prop (spec 9.2: no real-time shadow maps, every unit
 * gets a dark ellipse on the ground). Width and depth are in world units.
 */
export function createBlobShadow(width: number, depth: number): Mesh {
  const material = new MeshBasicMaterial({
    map: getShadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  const shadow = new Mesh(new PlaneGeometry(width, depth), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.renderOrder = 1;
  return shadow;
}
