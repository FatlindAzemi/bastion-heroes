import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  LinearFilter,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createBlobShadow } from './blobShadow';
import { addOutline } from './outline';
import { createToonMaterial, getToonGradientMap } from './toonMaterial';

/**
 * Art values only (no game balance numbers). Colours come from the spec 9.4 palette,
 * sizes are world units chosen for this menu composition (1 tile = 1 unit, spec 9.1).
 */
const PALETTE = {
  skyTop: 0x9fd8ff,
  skyBottom: 0xe9f8ff,
  haze: 0xcfeaff,
  grassLight: 0x7ed957,
  grassDark: 0x6cc644,
  dirtLight: 0xd9a066,
  dirtDark: 0xb97f4e,
  stone: 0x8a9ba8,
  stoneLight: 0x9aa8b3,
  stoneDark: 0x6b7b88,
  iron: 0x4a5560,
  wood: 0x6f4526,
  woodDark: 0x55341d,
  leaf: 0x5fbf4a,
  leafDark: 0x2e7d32,
  trunk: 0x8b5a2b,
  mushroomRed: 0xe5483b,
  mushroomCream: 0xefe6d2,
  white: 0xf4fbff,
  orange: 0xff8a2b,
  glowOrange: 0xffb45e,
  cyan: 0x22d3ee,
  teal: 0x3bf0c8,
  violet: 0x7c4dff,
  gloom: 0x2b1b3d,
  gloomPurple: 0x4a2f66,
  eyeGlow: 0x3cf2ff,
} as const;

const CLOUDS = [
  { x: -11, y: 5.8, z: -18, scale: 1.15, speed: 0.55 },
  { x: -3.2, y: 7.2, z: -23, scale: 1.5, speed: 0.38 },
  { x: 6, y: 6.2, z: -17, scale: 1.05, speed: 0.62 },
  { x: 13.5, y: 5.4, z: -22, scale: 1.35, speed: 0.45 },
  { x: -17, y: 4.6, z: -30, scale: 1.6, speed: 0.3 },
  { x: 16.5, y: 5.2, z: -28, scale: 1.45, speed: 0.35 },
];

const TREES = [
  { x: -7.6, z: -7.4, scale: 1.5, light: false },
  { x: 6.6, z: -8.2, scale: 1.35, light: true },
  { x: -9.4, z: -11.5, scale: 1.9, light: true },
  { x: 11.5, z: -14.5, scale: 1.8, light: false },
  { x: -4.2, z: -13.5, scale: 1.6, light: false },
  { x: 3.6, z: -15, scale: 1.75, light: true },
  { x: 0.2, z: -18, scale: 2.1, light: false },
];

const MUSHROOMS = [
  { x: -4.1, z: 3.2, scale: 1.25 },
  { x: 3.4, z: 2.5, scale: 1.1 },
  { x: -5.6, z: 0.6, scale: 0.85 },
  { x: 2.5, z: 4.9, scale: 0.7 },
];

const ROCKS = [
  { x: -2.7, z: 5.3, scale: 0.55 },
  { x: 4.9, z: 4.1, scale: 0.45 },
  { x: -4.6, z: 4.4, scale: 0.35 },
];

const FLOWERS = [
  { x: -2.4, z: 4.4, light: true },
  { x: 2.1, z: 5.1, light: false },
  { x: -3.1, z: 1.9, light: true },
  { x: 3.9, z: 3.6, light: false },
  { x: 0.9, z: 6.2, light: true },
  { x: -1.3, z: 7, light: false },
];

const ORBS = [
  { x: -2.6, y: 1.5, z: 0.8, phase: 0 },
  { x: 2.9, y: 1.2, z: -0.8, phase: 2.1 },
  { x: -0.9, y: 1.85, z: -2.2, phase: 4.2 },
];

const GRASS_TUFTS = [
  [-3.2, 4.9],
  [-4.4, 2.4],
  [3.1, 5.5],
  [4.3, 3.2],
  [-1.9, 6.6],
  [1.4, 7.1],
  [-5.6, 3.6],
];

interface AnimatedCloud {
  object: Object3D;
  startX: number;
  speed: number;
}

interface AnimatedFlag {
  object: Object3D;
  phase: number;
}

interface AnimatedOrb {
  object: Object3D;
  baseY: number;
  phase: number;
}

interface AnimatedPortal {
  ring: Mesh;
  core: Mesh;
  glow: Sprite;
  motes: Points;
}

/** Scene contents plus the per-frame animation hook of the title screen. */
export interface TitleScene {
  update(elapsedSeconds: number): void;
}

interface TitleLayers {
  clouds: AnimatedCloud[];
  flags: AnimatedFlag[];
  orbs: AnimatedOrb[];
  portals: AnimatedPortal[];
  dust: Points;
}

/** Builds the stylized meadow-and-bastion backdrop and returns the animation hook. */
export function createTitleScene(scene: Scene): TitleScene {
  scene.fog = new Fog(PALETTE.haze, 16, 46);
  const layers = addTitleLayers(scene);
  return {
    update(elapsedSeconds: number): void {
      updateTitleLayers(layers, elapsedSeconds);
    },
  };
}

/** Adds the sky, meadow, gate, rift, props and Essence orbs to the scene. */
function addTitleLayers(scene: Scene): TitleLayers {
  scene.add(createSky());
  scene.add(createSun());
  scene.add(createGround());
  scene.add(createHills());
  scene.add(createTrees());
  const bastion = createBastion();
  scene.add(bastion.group);
  const portal = createPortal();
  scene.add(portal.group);
  scene.add(createMushrooms());
  scene.add(createRocks());
  scene.add(createFlowers());
  scene.add(createGrassTufts());
  const cloudLayer = createClouds();
  scene.add(cloudLayer.group);
  const orbLayer = createEssenceOrbs();
  scene.add(orbLayer.group);
  const dust = createDustMotes();
  scene.add(dust);
  return {
    clouds: cloudLayer.clouds,
    flags: bastion.flags,
    orbs: orbLayer.orbs,
    portals: [portal],
    dust,
  };
}

/** Advances every animated element of the title scene. */
function updateTitleLayers(layers: TitleLayers, elapsedSeconds: number): void {
  updateClouds(layers.clouds, elapsedSeconds);
  updateFlags(layers.flags, elapsedSeconds);
  updateOrbs(layers.orbs, elapsedSeconds);
  updatePortals(layers.portals, elapsedSeconds);
  layers.dust.rotation.y = Math.sin(elapsedSeconds * 0.05) * 0.08;
}

/** Appends a transformed box to a merge list. */
function pushBox(
  parts: BufferGeometry[],
  size: [number, number, number],
  position: [number, number, number],
  rotationY = 0,
  rotationZ = 0,
): void {
  const geometry = new BoxGeometry(size[0], size[1], size[2]);
  if (rotationY !== 0) {
    geometry.rotateY(rotationY);
  }
  if (rotationZ !== 0) {
    geometry.rotateZ(rotationZ);
  }
  geometry.translate(position[0], position[1], position[2]);
  parts.push(geometry);
}

/** Merges transformed geometries, failing loudly instead of shipping an empty mesh. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  if (geometry === null) {
    throw new Error('Title screen: geometry merge failed');
  }
  return geometry;
}

/** Vertical sky gradient built from the two spec 9.4 sky tones. */
function createSky(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const gradient = context.createLinearGradient(0, 0, 0, 1024);
    gradient.addColorStop(0, '#9fd8ff');
    gradient.addColorStop(0.55, '#bfe6ff');
    gradient.addColorStop(1, '#eefaff');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4, 1024);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return new Mesh(
    new SphereGeometry(80, 24, 16),
    new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false, fog: false }),
  );
}

/** Soft additive glow texture for the sun and the Essence orbs. */
function createGlowTexture(innerColor: string, outerColor: string): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const radius = size / 2;
    const gradient = context.createRadialGradient(radius, radius, 2, radius, radius, radius);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.35, outerColor);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Warm sun glow in the upper left, matching the spec 9.2 key light direction. */
function createSun(): Sprite {
  const sun = new Sprite(
    new SpriteMaterial({
      map: createGlowTexture('rgba(255, 249, 228, 1)', 'rgba(255, 214, 140, 0.6)'),
      color: PALETTE.glowOrange,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    }),
  );
  sun.position.set(-26, 17, -42);
  sun.scale.setScalar(9);
  return sun;
}

/** Checkerboard meadow of spec 9.4 plus the dirt path towards the gate. */
function createGround(): Group {
  const group = new Group();
  const ground = new Mesh(
    new PlaneGeometry(110, 110),
    new MeshToonMaterial({ map: createCheckerTexture(), gradientMap: getToonGradientMap() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -18);
  group.add(ground);

  const dirtParts: BufferGeometry[] = [];
  const dirtDarkParts: BufferGeometry[] = [];
  const path = new PlaneGeometry(2.3, 16);
  path.rotateX(-Math.PI / 2);
  path.translate(0, 0.02, 4.2);
  dirtParts.push(path);
  const plaza = new CircleGeometry(1.7, 32);
  plaza.rotateX(-Math.PI / 2);
  plaza.translate(0, 0.022, -0.6);
  dirtParts.push(plaza);
  for (const side of [-1, 1]) {
    const edge = new PlaneGeometry(0.22, 16);
    edge.rotateX(-Math.PI / 2);
    edge.translate(side * 1.15, 0.025, 4.2);
    dirtDarkParts.push(edge);
  }
  group.add(new Mesh(merge(dirtParts), createToonMaterial(PALETTE.dirtLight)));
  group.add(new Mesh(merge(dirtDarkParts), createToonMaterial(PALETTE.dirtDark)));
  addSteppingStones(group);
  return group;
}

/** Flat stepping stones along the path. */
function addSteppingStones(group: Group): void {
  const stones: BufferGeometry[] = [];
  for (let index = 0; index < 7; index += 1) {
    const stone = new CircleGeometry(0.3 + (index % 2) * 0.06, 10);
    stone.rotateX(-Math.PI / 2);
    stone.translate(Math.sin(index * 1.7) * 0.25, 0.03, 1.4 + index * 1.55);
    stones.push(stone);
  }
  group.add(
    new Mesh(
      merge(stones),
      new MeshToonMaterial({ color: 0xc9b79c, gradientMap: getToonGradientMap() }),
    ),
  );
}

/** 1-unit checkerboard lawn texture in the two grass greens of spec 9.4. */
function createCheckerTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.fillStyle = '#7ed957';
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = '#6cc644';
    context.fillRect(32, 0, 32, 32);
    context.fillRect(0, 32, 32, 32);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(55, 55);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Layered rolling hills that fade into the haze (spec 9.4 greens). */
function createHills(): Group {
  const group = new Group();
  const hills: Array<{ x: number; z: number; scale: [number, number, number]; color: number }> = [
    { x: -16, z: -27, scale: [13, 4.2, 8], color: PALETTE.leaf },
    { x: 13, z: -25, scale: [11, 3.6, 7], color: PALETTE.leafDark },
    { x: 0, z: -33, scale: [18, 5.2, 9], color: PALETTE.leafDark },
  ];
  for (const hill of hills) {
    const mesh = new Mesh(new SphereGeometry(1, 22, 14), createToonMaterial(hill.color));
    mesh.position.set(hill.x, -2.2, hill.z);
    mesh.scale.set(...hill.scale);
    group.add(mesh);
  }
  return group;
}

/** Merged low-poly trees made of chunky foliage blobs; the two greens keep the silhouette readable. */
function createTrees(): Group {
  const group = new Group();
  const trunks: BufferGeometry[] = [];
  const darkFoliage: BufferGeometry[] = [];
  const lightFoliage: BufferGeometry[] = [];
  for (const tree of TREES) {
    const scale = tree.scale;
    const trunk = new CylinderGeometry(0.11, 0.19, 1.2, 6);
    trunk.translate(tree.x, 0.6 * scale, tree.z);
    trunk.scale(scale, scale, scale);
    trunks.push(trunk);

    const blobs: Array<[number, number, number, number]> = [
      [0, 1.4, 0, 0.82],
      [0.55, 1.12, 0.16, 0.56],
      [-0.52, 1.18, -0.12, 0.5],
      [0.06, 1.92, 0.02, 0.46],
    ];
    for (const [dx, dy, dz, radius] of blobs) {
      const blob = new SphereGeometry(radius, 9, 7);
      blob.translate(tree.x + dx * scale, dy * scale, tree.z + dz * scale);
      blob.scale(scale, scale * 0.92, scale);
      (tree.light ? lightFoliage : darkFoliage).push(blob);
    }
  }
  group.add(new Mesh(merge(trunks), createToonMaterial(PALETTE.trunk)));
  group.add(new Mesh(merge(darkFoliage), createToonMaterial(PALETTE.leafDark)));
  group.add(new Mesh(merge(lightFoliage), createToonMaterial(PALETTE.leaf)));
  return group;
}
/** Geometry lists of the gate, grouped by the material that renders them. */
interface BastionParts {
  stone: BufferGeometry[];
  stoneLight: BufferGeometry[];
  dark: BufferGeometry[];
  wood: BufferGeometry[];
  iron: BufferGeometry[];
  moss: BufferGeometry[];
  torch: BufferGeometry[];
  crest: BufferGeometry[];
  crestCore: BufferGeometry[];
}

/** The Brightvale gate: crenellated towers, a curtain wall, an arched wooden gate and flags. */
function createBastion(): { group: Group; flags: AnimatedFlag[] } {
  const group = new Group();
  group.position.set(0, 0, -4.8);
  const parts = createBastionParts();
  addBastionMeshes(group, parts);
  addBastionFireGlows(group);
  const flags = addBastionFlags(group);
  const shadow = createBlobShadow(7.6, 2.8);
  shadow.position.set(0, 0.012, 0.5);
  group.add(shadow);
  return { group, flags };
}

/** Collects the gate geometry from towers, walls and the gatehouse. */
function createBastionParts(): BastionParts {
  const parts: BastionParts = {
    stone: [],
    stoneLight: [],
    dark: [],
    wood: [],
    iron: [],
    moss: [],
    torch: [],
    crest: [],
    crestCore: [],
  };
  for (const side of [-1, 1]) {
    addTower(parts, side);
    addCurtainWall(parts, side);
    addTorchParts(parts, side);
  }
  addGatehouse(parts);
  return parts;
}

/** Tower with crenellations and two arrow slits, plus the gate pier next to it. */
function addTower(parts: BastionParts, side: number): void {
  pushBox(parts.stone, [1.15, 2.25, 1.15], [side * 1.58, 1.125, 0]);
  for (const offset of [-0.32, 0, 0.32]) {
    pushBox(parts.stone, [0.24, 0.24, 0.3], [side * 1.58 + offset, 2.37, 0.25]);
  }
  for (const height of [1.25, 1.8]) {
    pushBox(parts.dark, [0.12, 0.4, 0.06], [side * 1.58, height, 0.585]);
  }
  pushBox(parts.stone, [0.45, 1.6, 0.85], [side * 0.775, 0.8, 0]);
}

/** Curtain wall segment with crenellations, protruding stones and moss at its foot. */
function addCurtainWall(parts: BastionParts, side: number): void {
  pushBox(parts.stone, [4.8, 1.2, 0.72], [side * 4.55, 0.6, 0]);
  for (let index = 0; index < 6; index += 1) {
    pushBox(parts.stone, [0.28, 0.24, 0.36], [side * (2.65 + index * 0.78), 1.32, 0.16]);
  }
  for (let index = 0; index < 8; index += 1) {
    const width = 0.45 + ((index * 17) % 4) * 0.09;
    pushBox(
      parts.stoneLight,
      [width, 0.22, 0.05],
      [side * (2.4 + index * 0.58), 0.32 + ((index * 13) % 5) * 0.16, 0.37],
    );
  }
  for (let index = 0; index < 7; index += 1) {
    const tuft = new SphereGeometry(0.17, 6, 5);
    tuft.scale(1.5, 0.65, 0.9);
    tuft.translate(side * (2.3 + index * 0.62), 0.07, 0.36 + (index % 2) * 0.06);
    parts.moss.push(tuft);
  }
}

/** Gatehouse: raised stone block, crenellations, arch, crest and the closed wooden gate. */
function addGatehouse(parts: BastionParts): void {
  pushBox(parts.stone, [1.15, 0.34, 0.85], [0, 1.77, 0]);
  for (const offset of [-0.34, 0, 0.34]) {
    pushBox(parts.stone, [0.2, 0.2, 0.34], [offset, 2.02, 0.18]);
  }
  const arch = new TorusGeometry(0.55, 0.1, 8, 18, Math.PI);
  arch.translate(0, 1.05, 0.43);
  parts.stone.push(arch);
  pushBox(parts.stoneLight, [1.5, 0.16, 0.9], [0, 1.68, 0.06]);
  addCrest(parts);
  addGateDoor(parts);
}

/** Brightvale crest on the gatehouse: an orange shield with a white core. */
function addCrest(parts: BastionParts): void {
  const crest = new CircleGeometry(0.22, 18);
  crest.translate(0, 1.78, 0.47);
  parts.crest.push(crest);
  const core = new CircleGeometry(0.11, 12);
  core.translate(0, 1.78, 0.48);
  parts.crestCore.push(core);
}

/** Closed wooden gate: dark inset, planks, braces, iron bands and a ring handle. */
function addGateDoor(parts: BastionParts): void {
  pushBox(parts.dark, [1.16, 1.18, 0.08], [0, 0.59, 0.32]);
  pushBox(parts.wood, [1.06, 1.0, 0.12], [0, 0.52, 0.4]);
  for (const offset of [-0.34, 0, 0.34]) {
    pushBox(parts.dark, [0.035, 1.0, 0.04], [offset, 0.52, 0.47]);
  }
  for (const angle of [0.62, -0.62]) {
    pushBox(parts.dark, [1.2, 0.08, 0.05], [0, 0.52, 0.48], 0, angle);
  }
  pushBox(parts.iron, [1.1, 0.09, 0.05], [0, 0.24, 0.47]);
  pushBox(parts.iron, [1.1, 0.09, 0.05], [0, 0.8, 0.47]);
  const handle = new TorusGeometry(0.1, 0.025, 6, 12);
  handle.translate(0.3, 0.52, 0.5);
  parts.iron.push(handle);
}

/** Torch geometry on the gate piers (rendered together with the other iron parts). */
function addTorchParts(parts: BastionParts, side: number): void {
  pushBox(parts.iron, [0.1, 0.4, 0.1], [side * 0.64, 1.12, 0.55]);
  parts.torch.push(new SphereGeometry(0.14, 10, 8).translate(side * 0.64, 1.38, 0.55));
}

/** Renders the gate geometry with its outlines and material groups. */
function addBastionMeshes(group: Group, parts: BastionParts): void {
  const stoneMesh = new Mesh(merge(parts.stone), createToonMaterial(PALETTE.stone));
  addOutline(stoneMesh);
  group.add(stoneMesh);
  group.add(new Mesh(merge(parts.stoneLight), createToonMaterial(PALETTE.stoneLight)));
  const woodMesh = new Mesh(merge(parts.wood), createToonMaterial(PALETTE.wood));
  addOutline(woodMesh);
  group.add(woodMesh);
  group.add(new Mesh(merge(parts.iron), createToonMaterial(PALETTE.iron)));
  group.add(new Mesh(merge(parts.dark), new MeshBasicMaterial({ color: PALETTE.gloom })));
  group.add(new Mesh(merge(parts.moss), createToonMaterial(PALETTE.leafDark)));
  group.add(new Mesh(merge(parts.crest), createToonMaterial(PALETTE.orange)));
  group.add(new Mesh(merge(parts.crestCore), createToonMaterial(PALETTE.white)));
  group.add(
    new Mesh(
      merge(parts.torch),
      new MeshToonMaterial({ color: PALETTE.glowOrange, emissive: PALETTE.orange }),
    ),
  );
}

/** Additive fire halos and a warm point light in front of the gate. */
function addBastionFireGlows(group: Group): void {
  for (const side of [-1, 1]) {
    const fireGlow = new Sprite(
      new SpriteMaterial({
        map: createGlowTexture('rgba(255, 236, 190, 1)', 'rgba(255, 138, 43, 0.5)'),
        color: PALETTE.orange,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    );
    fireGlow.scale.setScalar(0.45);
    fireGlow.position.set(side * 0.64, 1.4, 0.68);
    group.add(fireGlow);
  }
  const torchLight = new PointLight(PALETTE.orange, 6, 5.5, 2);
  torchLight.position.set(0, 1.5, 1.8);
  group.add(torchLight);
}

/** Flag poles on the towers; the update loop waves the cloth. */
function addBastionFlags(group: Group): AnimatedFlag[] {
  const flags: AnimatedFlag[] = [];
  for (const side of [-1, 1]) {
    const pole = new Mesh(
      new CylinderGeometry(0.035, 0.05, 0.66, 6),
      createToonMaterial(PALETTE.iron),
    );
    pole.position.set(side * 1.58, 2.86, 0);
    group.add(pole);
    const flag = new Mesh(
      new BoxGeometry(0.6, 0.34, 0.05),
      new MeshBasicMaterial({ color: side === -1 ? PALETTE.orange : PALETTE.cyan }),
    );
    flag.position.set(side * 1.58 + 0.33, 3.03, 0);
    group.add(flag);
    flags.push({ object: flag, phase: side === -1 ? 0 : Math.PI });
  }
  return flags;
}

/** Distant Gloom rift: a violet ring around a swirling dark vortex (spec 6.4 look). */
function createPortal(): AnimatedPortal & { group: Group } {
  const group = new Group();
  group.position.set(6.4, 0, -10.6);
  group.rotation.y = -0.24;
  addRiftBase(group);
  const mouth = addRiftMouth(group);
  const motes = addRiftMotes(group);
  addRiftSmoke(group);
  return { group, ...mouth, motes };
}

/** Dark hillock and spiky shards below the rift. */
function addRiftBase(group: Group): void {
  const mound = new Mesh(new SphereGeometry(1, 18, 12), createToonMaterial(PALETTE.gloomPurple));
  mound.position.y = 0.2;
  mound.scale.set(3.2, 0.9, 2.2);
  group.add(mound);

  const shardParts: BufferGeometry[] = [];
  for (const [x, z, height] of [
    [-2.4, 0.5, 0.9],
    [-1.5, 1.3, 0.6],
    [1.7, 1.1, 0.7],
    [2.5, 0.2, 1.0],
  ] as const) {
    const shard = new ConeGeometry(0.3, height, 5);
    shard.translate(x, height * 0.5, z);
    shardParts.push(shard);
  }
  group.add(new Mesh(merge(shardParts), createToonMaterial(PALETTE.gloomPurple)));
}

/** The glowing ring, the swirling vortex disc and its halo. */
function addRiftMouth(group: Group): { ring: Mesh; core: Mesh; glow: Sprite } {
  const ring = new Mesh(
    new TorusGeometry(1.7, 0.24, 12, 44),
    createToonMaterial(0xa64dff, PALETTE.gloomPurple),
  );
  ring.position.y = 2.6;
  group.add(ring);

  const core = new Mesh(
    new CircleGeometry(1.5, 44),
    new MeshBasicMaterial({ map: createRiftTexture(), transparent: true }),
  );
  core.position.set(0, 2.6, 0.02);
  group.add(core);

  const glow = new Sprite(
    new SpriteMaterial({
      map: createGlowTexture('rgba(185, 145, 255, 0.9)', 'rgba(124, 77, 255, 0.5)'),
      color: PALETTE.violet,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    }),
  );
  glow.position.y = 2.6;
  glow.scale.setScalar(6.4);
  group.add(glow);
  return { ring, core, glow };
}

/** Purple gloom smoke wisps rising around the rift base. */
function addRiftSmoke(group: Group): void {
  for (const [x, y, z, scale] of [
    [-1.9, 0.9, 0.4, 1.6],
    [1.8, 1.2, 0.2, 1.9],
    [-0.6, 1.7, -0.3, 1.4],
    [2.6, 0.6, 0.5, 1.2],
  ] as const) {
    const smoke = new Sprite(
      new SpriteMaterial({
        map: createGlowTexture('rgba(120, 90, 170, 0.55)', 'rgba(74, 47, 102, 0.3)'),
        color: PALETTE.gloomPurple,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    smoke.position.set(x, y, z);
    smoke.scale.setScalar(scale);
    group.add(smoke);
  }
}

/** Cyan motes drifting inside the rift (one draw call). */
function addRiftMotes(group: Group): Points {
  const motePositions = new Float32Array(24 * 3);
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    const radius = 0.3 + (index % 6) * 0.19;
    motePositions[index * 3 + 0] = Math.cos(angle) * radius;
    motePositions[index * 3 + 1] = 0.2 + ((index * 0.37) % 1.5);
    motePositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const moteGeometry = new BufferGeometry();
  moteGeometry.setAttribute('position', new Float32BufferAttribute(motePositions, 3));
  const motes = new Points(
    moteGeometry,
    new PointsMaterial({
      color: PALETTE.eyeGlow,
      size: 0.09,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: AdditiveBlending,
      map: createGlowTexture('rgba(255, 255, 255, 1)', 'rgba(60, 242, 255, 0.5)'),
    }),
  );
  motes.position.y = 1.4;
  group.add(motes);
  return motes;
}

/** Swirling dark-violet vortex texture for the Gloom rift. */
function createRiftTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 126);
    gradient.addColorStop(0, '#050309');
    gradient.addColorStop(0.45, '#2b1b3d');
    gradient.addColorStop(0.8, '#4a2f66');
    gradient.addColorStop(1, 'rgba(124, 77, 255, 0.95)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(128, 128, 122, 0, Math.PI * 2);
    context.clip();
    for (let arm = 0; arm < 5; arm += 1) {
      context.beginPath();
      for (let step = 0; step <= 90; step += 1) {
        const angle = step * 0.14 + arm * 1.25;
        const radius = 6 + step * 1.25;
        const x = 128 + Math.cos(angle) * radius;
        const y = 128 + Math.sin(angle) * radius;
        if (step === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.strokeStyle = 'rgba(205, 165, 255, 0.5)';
      context.lineWidth = 3;
      context.stroke();
    }
    context.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Chunky foreground mushrooms with white spots, outlines and blob shadows. */
function createMushrooms(): Group {
  const group = new Group();
  const caps: BufferGeometry[] = [];
  const stems: BufferGeometry[] = [];
  const spots: BufferGeometry[] = [];
  for (const mushroom of MUSHROOMS) {
    const stem = new CylinderGeometry(0.14, 0.19, 0.5, 8);
    stem.translate(mushroom.x, 0.25 * mushroom.scale, mushroom.z);
    stem.scale(mushroom.scale, mushroom.scale, mushroom.scale);
    stems.push(stem);

    const cap = new SphereGeometry(0.42, 14, 10);
    cap.scale(1, 0.62, 1);
    cap.translate(mushroom.x, 0.62 * mushroom.scale, mushroom.z);
    cap.scale(mushroom.scale, mushroom.scale, mushroom.scale);
    caps.push(cap);

    for (const angle of [-0.65, 0.15, 0.95]) {
      const dot = new SphereGeometry(0.085, 8, 6);
      dot.scale(1, 0.42, 1);
      dot.translate(
        mushroom.x + Math.sin(angle) * 0.32 * mushroom.scale,
        0.84 * mushroom.scale,
        mushroom.z + Math.cos(angle) * 0.32 * mushroom.scale,
      );
      spots.push(dot);
    }

    const shadow = createBlobShadow(1.1 * mushroom.scale, 0.85 * mushroom.scale);
    shadow.position.set(mushroom.x, 0.012, mushroom.z);
    group.add(shadow);
  }
  const capMesh = new Mesh(merge(caps), createToonMaterial(PALETTE.mushroomRed));
  addOutline(capMesh);
  group.add(capMesh);
  const stemMesh = new Mesh(merge(stems), createToonMaterial(PALETTE.mushroomCream));
  addOutline(stemMesh);
  group.add(stemMesh);
  group.add(new Mesh(merge(spots), createToonMaterial(PALETTE.white)));
  return group;
}

/** Chunky foreground rocks with outlines. */
function createRocks(): Group {
  const group = new Group();
  const rockParts: BufferGeometry[] = [];
  for (const rock of ROCKS) {
    const geometry = new DodecahedronGeometry(0.5, 0);
    geometry.scale(rock.scale * 1.25, rock.scale * 0.8, rock.scale);
    geometry.rotateY(rock.x);
    geometry.translate(rock.x, rock.scale * 0.32, rock.z);
    rockParts.push(geometry);
    const shadow = createBlobShadow(rock.scale * 2.2, rock.scale * 1.6);
    shadow.position.set(rock.x, 0.012, rock.z);
    group.add(shadow);
  }
  const mesh = new Mesh(merge(rockParts), createToonMaterial(PALETTE.stone));
  addOutline(mesh);
  group.add(mesh);
  return group;
}

/** Small flowers with coloured heads. */
function createFlowers(): Group {
  const group = new Group();
  const stems: BufferGeometry[] = [];
  const lightHeads: BufferGeometry[] = [];
  const darkHeads: BufferGeometry[] = [];
  for (const flower of FLOWERS) {
    const stem = new CylinderGeometry(0.02, 0.025, 0.34, 5);
    stem.translate(flower.x, 0.17, flower.z);
    stems.push(stem);
    const head = new SphereGeometry(0.09, 8, 6);
    head.translate(flower.x, 0.36, flower.z);
    (flower.light ? lightHeads : darkHeads).push(head);
  }
  group.add(new Mesh(merge(stems), createToonMaterial(PALETTE.leafDark)));
  group.add(new Mesh(merge(lightHeads), createToonMaterial(PALETTE.white)));
  group.add(new Mesh(merge(darkHeads), createToonMaterial(PALETTE.orange)));
  return group;
}

/** Tufts of grass scattered along the foreground edges. */
function createGrassTufts(): Group {
  const group = new Group();
  const parts: BufferGeometry[] = [];
  for (const [x = 0, z = 0] of GRASS_TUFTS) {
    for (const offset of [-0.12, 0, 0.12]) {
      const blade = new ConeGeometry(0.06, 0.3, 4);
      blade.translate(x + offset, 0.15, z);
      parts.push(blade);
    }
  }
  group.add(new Mesh(merge(parts), createToonMaterial(PALETTE.leaf)));
  return group;
}

/** Drifting cloud clusters built from merged spheres. */
function createClouds(): { group: Group; clouds: AnimatedCloud[] } {
  const group = new Group();
  const clouds: AnimatedCloud[] = [];
  for (const cloud of CLOUDS) {
    const puffs: BufferGeometry[] = [];
    const offsets: Array<[number, number, number, number]> = [
      [0, 0, 0, 1],
      [-0.85, -0.12, 0.1, 0.72],
      [0.9, -0.16, 0.05, 0.78],
      [0.35, 0.28, 0.1, 0.62],
      [-0.35, 0.22, -0.05, 0.58],
      [1.55, -0.28, 0, 0.5],
    ];
    for (const [x, y, z, scale] of offsets) {
      const puff = new SphereGeometry(0.62, 10, 7);
      puff.scale(scale, scale * 0.72, scale);
      puff.translate(x, y, z);
      puffs.push(puff);
    }
    const mesh = new Mesh(merge(puffs), new MeshBasicMaterial({ color: PALETTE.white, fog: true }));
    mesh.position.set(cloud.x, cloud.y, cloud.z);
    mesh.scale.setScalar(cloud.scale);
    group.add(mesh);
    clouds.push({ object: mesh, startX: cloud.x, speed: cloud.speed });
  }
  return { group, clouds };
}

/** Floating Essence orbs with a glowing core (spec 3.3 / 9.7). */
function createEssenceOrbs(): { group: Group; orbs: AnimatedOrb[] } {
  const group = new Group();
  const orbs: AnimatedOrb[] = [];
  for (const orb of ORBS) {
    const orbGroup = new Group();
    orbGroup.position.set(orb.x, orb.y, orb.z);
    orbGroup.add(
      new Mesh(
        new SphereGeometry(0.12, 14, 10),
        new MeshBasicMaterial({ color: 0x8dffe8, transparent: true, opacity: 0.9 }),
      ),
    );
    orbGroup.add(
      new Mesh(new SphereGeometry(0.06, 10, 8), new MeshBasicMaterial({ color: PALETTE.white })),
    );
    const glow = new Sprite(
      new SpriteMaterial({
        map: createGlowTexture('rgba(210, 255, 245, 1)', 'rgba(59, 240, 200, 0.5)'),
        color: PALETTE.teal,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    );
    glow.scale.setScalar(0.62);
    orbGroup.add(glow);
    group.add(orbGroup);
    orbs.push({ object: orbGroup, baseY: orb.y, phase: orb.phase });
  }
  return { group, orbs };
}

/** Slowly rising dust motes for atmosphere (one draw call). */
function createDustMotes(): Points {
  const count = 70;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3 + 0] = -16 + ((index * 7.31) % 32);
    positions[index * 3 + 1] = 0.4 + ((index * 1.37) % 5.4);
    positions[index * 3 + 2] = 8 - ((index * 4.71) % 26);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      color: PALETTE.white,
      size: 0.07,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: AdditiveBlending,
      map: createGlowTexture('rgba(255, 255, 255, 1)', 'rgba(255, 255, 255, 0.35)'),
    }),
  );
}

/** Moves the clouds across the sky and wraps them off-screen. */
function updateClouds(clouds: AnimatedCloud[], elapsedSeconds: number): void {
  for (const cloud of clouds) {
    const span = 34;
    cloud.object.position.x = ((cloud.startX + 18 + elapsedSeconds * cloud.speed) % span) - 18;
  }
}

/** Waves the tower flags. */
function updateFlags(flags: AnimatedFlag[], elapsedSeconds: number): void {
  for (const flag of flags) {
    const wave = Math.sin(elapsedSeconds * 2.4 + flag.phase);
    flag.object.rotation.y = wave * 0.12;
    flag.object.scale.x = 1 + wave * 0.06;
  }
}

/** Bobs and slowly turns the Essence orbs. */
function updateOrbs(orbs: AnimatedOrb[], elapsedSeconds: number): void {
  for (const orb of orbs) {
    const bob = Math.sin(elapsedSeconds * 1.5 + orb.phase);
    orb.object.position.y = orb.baseY + bob * 0.12;
    orb.object.rotation.y = elapsedSeconds * 0.4 + orb.phase;
  }
}

/** Breathes the Gloom rift and drifts its motes. */
function updatePortals(portals: AnimatedPortal[], elapsedSeconds: number): void {
  for (const portal of portals) {
    const pulse = 1 + Math.sin(elapsedSeconds * 1.3) * 0.03;
    portal.ring.scale.setScalar(pulse);
    portal.ring.rotation.z = elapsedSeconds * 0.08;
    portal.core.rotation.z = elapsedSeconds * 0.55;
    portal.glow.scale.setScalar(6.4 * pulse);
    portal.motes.rotation.y = elapsedSeconds * 0.5;
    portal.motes.position.y = 1.2 + Math.sin(elapsedSeconds * 0.8) * 0.12;
  }
}
