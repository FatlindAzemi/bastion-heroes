import { MeshToonMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { AMBIENT_MOTES, createAmbientMotes } from '../../src/render/ambientMotes';
import { applyGroundSurface } from '../../src/render/groundSurface';
import { applyMasonrySurface } from '../../src/render/masonrySurface';
import { createPortalVortex, PORTAL_VORTEX } from '../../src/render/portalVortex';

/** A minimal stand-in for the shader object three.js passes to `onBeforeCompile`. */
function compile(material: MeshToonMaterial): { vertexShader: string; fragmentShader: string } {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>',
  };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

describe('Presentation pass 1 (issue #115)', () => {
  it('patches the ground material with the painted surface', () => {
    const material = new MeshToonMaterial();
    applyGroundSurface(material);
    const shader = compile(material);
    expect(shader.vertexShader).toContain('vGroundWorld');
    expect(shader.fragmentShader).toContain('paintGrass');
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect(material.customProgramCacheKey()).toBe('world1-ground-surface');
  });

  it('patches the structure material with masonry', () => {
    const material = new MeshToonMaterial();
    applyMasonrySurface(material);
    const shader = compile(material);
    expect(shader.fragmentShader).toContain('masonryHash');
    expect(material.customProgramCacheKey()).toBe('world1-masonry-surface');
  });

  it('creates one mote per configured pollen and portal spark with finite positions', () => {
    const motes = createAmbientMotes();
    const positions = motes.object.geometry.getAttribute('position');
    expect(positions.count).toBe(AMBIENT_MOTES.pollenCount + AMBIENT_MOTES.portalSparkCount);
    expect(Array.from(positions.array).every((value) => Number.isFinite(value))).toBe(true);
    motes.dispose();
  });

  it('places the portal swirl at the portal mouth in two draw calls', () => {
    const portal = createPortalVortex();
    expect(portal.group.children).toHaveLength(2);
    expect(portal.group.children[0]?.position.x).toBe(PORTAL_VORTEX.x);
    expect(portal.group.children[0]?.position.z).toBe(2.5);
    portal.dispose();
  });
});
