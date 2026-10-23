import {
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
  type ColorRepresentation,
} from 'three';

/** Shade steps of the toon ramp (spec 9.2: shadow 0.55, mid 0.8, light 1.0). */
const SHADE_STEPS = [0.55, 0.8, 1] as const;

let sharedGradientMap: DataTexture | null = null;

/** Returns the shared 3-step gradient map that gives every material the spec 9.2 toon ramp. */
export function getToonGradientMap(): DataTexture {
  if (sharedGradientMap === null) {
    const data = new Uint8Array(SHADE_STEPS.length * 4);
    SHADE_STEPS.forEach((step, index) => {
      const value = Math.round(step * 255);
      data.set([value, value, value, 255], index * 4);
    });
    sharedGradientMap = new DataTexture(data, SHADE_STEPS.length, 1, RGBAFormat);
    sharedGradientMap.minFilter = NearestFilter;
    sharedGradientMap.magFilter = NearestFilter;
    sharedGradientMap.needsUpdate = true;
  }
  return sharedGradientMap;
}

/** Creates a toon material with the 3-step ramp of spec 9.2. */
export function createToonMaterial(
  color: ColorRepresentation,
  emissive: ColorRepresentation = 0x000000,
): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    emissive,
    gradientMap: getToonGradientMap(),
  });
}
