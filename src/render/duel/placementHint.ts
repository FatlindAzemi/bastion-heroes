/**
 * Board highlight while the player holds a card (spec 18.9): for a defender the own
 * columns glow teal and every other tile is dimmed; for a raider all five lanes show
 * arrows that run towards the enemy gate. The viewer's side is always at the bottom
 * (18.1), so the own columns and "forward" are the same in every view. One plane,
 * one shader, one draw call.
 */
import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

import { duelRules, rules } from '../../data';
import type { Side } from '../../sim/duel';
import { AOE_GROUND_Y } from '../vfx/rings';
import { OWN_SIDE_COLOR } from './duelColors';
import { viewColumn } from './duelView';

/** What the player holds: nothing, a defender card or a raider card. */
export type PlacementHintKind = 'defender' | 'raider' | null;

/** Lies on the ground just under the side rings, so units and rings stay on top. */
const HINT_Y = AOE_GROUND_Y - 0.012;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Mode 1: teal own columns with bright tile borders, dark dim elsewhere. Mode 2: lane arrows. */
const FRAGMENT_SHADER = /* glsl */ `
uniform float uMode;
uniform float uTime;
uniform vec2 uOwn;
uniform vec2 uBoard;
uniform vec3 uTeal;
varying vec2 vWorld;

vec4 defenderHint() {
  vec2 cell = fract( vWorld );
  float edge = min( min( cell.x, 1.0 - cell.x ), min( cell.y, 1.0 - cell.y ) );
  float aa = fwidth( edge ) * 1.5;
  float border = 1.0 - smoothstep( 0.035, 0.035 + aa, edge );
  float own = step( uOwn.x, vWorld.x ) * step( vWorld.x, uOwn.y );
  float pulse = 0.5 + 0.5 * sin( uTime * 4.0 );
  vec3 teal = uTeal * ( 1.05 + 0.25 * pulse );
  vec4 ownColor = vec4( mix( teal * 0.8, teal * 1.4, border ), 0.14 + 0.08 * pulse + border * 0.6 );
  vec4 dimColor = vec4( 0.03, 0.02, 0.07, 0.46 );
  return mix( dimColor, ownColor, own );
}

vec4 raiderHint() {
  float laneOffset = abs( fract( vWorld.y ) - 0.5 );
  float u = fract( vWorld.x * 0.5 - uTime * 0.8 ) * 2.0;
  float chevron = abs( u - ( 1.2 - laneOffset * 0.9 ) );
  float aa = fwidth( chevron ) * 1.5;
  float arm = ( 1.0 - smoothstep( 0.09, 0.09 + aa, chevron ) ) * step( laneOffset, 0.3 );
  float fade = smoothstep( 0.2, 1.2, vWorld.x ) * ( 1.0 - smoothstep( uBoard.x - 1.2, uBoard.x - 0.2, vWorld.x ) );
  float strip = ( 1.0 - smoothstep( 0.3, 0.46, laneOffset ) ) * 0.08;
  return vec4( uTeal * 1.3, ( arm * 0.85 + strip ) * fade );
}

void main() {
  vec4 color = uMode < 1.5 ? defenderHint() : raiderHint();
  if ( color.a < 0.01 ) discard;
  gl_FragColor = color;
}
`;

/** The board highlight layer of a Duel scene. */
export interface PlacementHint {
  readonly mesh: Mesh;
  set(kind: PlacementHintKind): void;
  update(sceneSeconds: number): void;
  dispose(): void;
}

/** World x range of the viewer's own columns in the drawn (possibly mirrored) board. */
function ownColumnRange(viewSide: Side): [number, number] {
  const ownColumns =
    viewSide === 'south' ? duelRules.board.southColumns : duelRules.board.northColumns;
  const viewColumns = ownColumns.map((col) => viewColumn(col, viewSide));
  const tile = rules.grid.tileSize;
  return [Math.min(...viewColumns) * tile, (Math.max(...viewColumns) + 1) * tile];
}

/** Creates the hidden highlight plane over the 5 x 9 board for the player of `viewSide`. */
export function createPlacementHint(viewSide: Side): PlacementHint {
  const width = rules.grid.columnCount * rules.grid.tileSize;
  const depth = rules.grid.laneCount * rules.grid.tileSize;
  const [ownStart, ownEnd] = ownColumnRange(viewSide);
  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uMode: { value: 1 },
      uTime: { value: 0 },
      uOwn: { value: [ownStart, ownEnd] },
      uBoard: { value: [width, depth] },
      uTeal: { value: new Color(OWN_SIDE_COLOR) },
    },
  });
  const geometry = new PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(width / 2, HINT_Y, depth / 2);
  mesh.visible = false;
  mesh.renderOrder = 1;
  return {
    mesh,
    set: (kind): void => {
      mesh.visible = kind !== null;
      material.uniforms.uMode!.value = kind === 'raider' ? 2 : 1;
    },
    update: (sceneSeconds): void => {
      material.uniforms.uTime!.value = sceneSeconds;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
    },
  };
}
