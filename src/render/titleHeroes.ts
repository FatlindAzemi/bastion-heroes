/**
 * Title-screen key art: a few defender sprites from the 2.5D atlas standing in front of
 * the Brightvale gate (issue #113/#114). The home screen needs characters to feel like a
 * game box cover instead of an empty diorama, so the same pixel-art billboards that fight
 * in the level pose on the path behind the logo and the Play button.
 */
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type PerspectiveCamera,
} from 'three';

import { createBottomCenterQuad } from './sprites/billboard';
import { frameUvRect } from './sprites/clip';
import { createSpriteMaterial, type SpriteMaterial } from './sprites/material';
import { loadCharacterSheets, loadSpriteManifest } from './sprites/sheets';
import type { SpriteSheetTexture } from './sprites/types';

/** One posed defender of the title key art. */
interface TitleHero {
  readonly mesh: Mesh;
  readonly material: SpriteMaterial;
  /** Base position on the path. */
  readonly x: number;
  readonly z: number;
  /** Bob phase so the heroes do not move in lockstep. */
  readonly phase: number;
}

/** The posed title heroes; `update` animates them against the title camera. */
export interface TitleHeroes {
  readonly group: Group;
  update(elapsedSeconds: number, camera: PerspectiveCamera): void;
  dispose(): void;
}

/** Data id, path position, scale and bob phase of each pose (defender ids of the M2 roster). */
const HERO_POSES = [
  { id: 'glowshroom_monk', x: -0.1, z: -1.4, scale: 0.72, phase: 0.0 },
  { id: 'iron_granny', x: 0.5, z: -1.7, scale: 0.66, phase: 4.4 },
  { id: 'pyro_fox', x: 1.05, z: -1.4, scale: 0.55, phase: 1.7 },
] as const;

/** Height of the pose relative to its manifest world height (box-cover licence). */
const HERO_HEIGHT_FACTOR = 1.9;

/** Idle frame index of a sheet; frame 0 when the clip is missing. */
function idleFrame(sheet: SpriteSheetTexture): number {
  return sheet.character.clips.idle?.frames[0] ?? 0;
}

/** Builds one posed hero mesh from a loaded sheet. */
function createHeroMesh(
  sheet: SpriteSheetTexture,
  pose: (typeof HERO_POSES)[number],
): { mesh: Mesh; material: SpriteMaterial; geometry: PlaneGeometry; width: number } {
  const character = sheet.character;
  const height = character.worldHeight * HERO_HEIGHT_FACTOR * pose.scale;
  const width = height * (character.frameWidth / character.frameHeight);
  const material = createSpriteMaterial(sheet.texture);
  const uv = frameUvRect(
    idleFrame(sheet),
    character.columns,
    character.frameWidth,
    character.frameHeight,
    sheet.sheetWidth,
    sheet.sheetHeight,
    { u0: 0, v0: 0, u1: 1, v1: 1 },
  );
  material.uvRect.set(uv.u0, uv.v0, uv.u1 - uv.u0, uv.v1 - uv.v0);
  const geometry = createBottomCenterQuad(width, height);
  const mesh = new Mesh(geometry, material.material);
  mesh.position.set(pose.x, 0, pose.z);
  mesh.renderOrder = 2;
  return { mesh, material, geometry, width };
}

/** Builds the soft shadow plane under one posed hero. */
function createShadow(radius: number): { mesh: Mesh; geometry: PlaneGeometry } {
  const geometry = new PlaneGeometry(radius * 2, radius);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: 0x1b1b2f,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  return { mesh, geometry };
}

/** Adds one hero mesh and its ground shadow to the group, tracking the hero for animation. */
function addHero(
  group: Group,
  heroes: TitleHero[],
  geometries: PlaneGeometry[],
  shadows: Array<{ mesh: Mesh; material: MeshBasicMaterial }>,
  sheet: SpriteSheetTexture,
  pose: (typeof HERO_POSES)[number],
): void {
  const hero = createHeroMesh(sheet, pose);
  group.add(hero.mesh);
  geometries.push(hero.geometry);
  heroes.push({
    mesh: hero.mesh,
    material: hero.material,
    x: pose.x,
    z: pose.z,
    phase: pose.phase,
  });
  const shadow = createShadow((hero.width / 2) * 0.95);
  shadow.mesh.position.set(pose.x, 0.01, pose.z + 0.12);
  group.add(shadow.mesh);
  geometries.push(shadow.geometry);
  shadows.push({ mesh: shadow.mesh, material: shadow.mesh.material as MeshBasicMaterial });
}

/**
 * Creates the title key-art hero group. The sheets load asynchronously; until then the
 * group is empty and the title scene simply renders without heroes.
 */
export function createTitleHeroes(): TitleHeroes {
  const group = new Group();
  group.name = 'title_heroes';
  const heroes: TitleHero[] = [];
  const geometries: PlaneGeometry[] = [];
  const shadows: Array<{ mesh: Mesh; material: MeshBasicMaterial }> = [];
  const manifestUrl = `${import.meta.env.BASE_URL}sprites/manifest.json`;

  void loadSpriteManifest(manifestUrl).then(async (manifest) => {
    if (manifest === null) {
      return;
    }
    const sheets = await loadCharacterSheets(manifest);
    for (const pose of HERO_POSES) {
      const sheet = sheets.get(pose.id);
      if (sheet !== undefined) {
        addHero(group, heroes, geometries, shadows, sheet, pose);
      }
    }
  });

  return {
    group,
    update: (elapsedSeconds: number, camera: PerspectiveCamera): void => {
      for (const hero of heroes) {
        const bob = Math.sin(elapsedSeconds * 1.5 + hero.phase) * 0.035;
        const sway = Math.sin(elapsedSeconds * 0.9 + hero.phase) * 0.02;
        hero.mesh.position.set(hero.x, bob, hero.z);
        hero.mesh.quaternion.copy(camera.quaternion);
        hero.mesh.rotateZ(sway);
      }
    },
    dispose: (): void => {
      for (const hero of heroes) {
        hero.material.dispose();
      }
      for (const shadow of shadows) {
        shadow.material.dispose();
      }
      for (const geometry of geometries) {
        geometry.dispose();
      }
      heroes.length = 0;
      shadows.length = 0;
      geometries.length = 0;
      group.clear();
    },
  };
}
