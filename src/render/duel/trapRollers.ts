/**
 * Both players' Last Stand Traps in the Duel (spec 18.7): one wooden roller per lane
 * in front of each bastion. An unused trap is an intact roller, a firing trap rolls
 * along its lane with the sim `rollerX`, and a used trap is shown as a broken roller,
 * so both players can read which lanes are open. Every roller and roller piece is
 * one instance of a single instanced mesh (one draw call).
 */
import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Vector3,
} from 'three';

import { duelRules, rules } from '../../data';
import type { DuelState, Side } from '../../sim/duel';
import type { TrapState } from '../../sim/types';
import { getToonGradientMap } from '../toonMaterial';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import { viewLane, viewX } from './duelView';

const SIDES: readonly Side[] = ['south', 'north'];
/** Two instances per broken roller, both sides, every lane. */
const MAX_INSTANCES = SIDES.length * rules.grid.laneCount * 2;
const ROLLER_RADIUS = 0.22;
const ROLLER_LENGTH = 0.86;
/** Rest offsets from the drawn base line: in front of the near wall, on the far wall edge. */
const NEAR_REST_INSET = 0.16;
const FAR_REST_OUTSET = 0.12;
const INTACT_COLOR = 0xc0773a;
const BROKEN_COLOR = 0x4a3428;

/** One roller piece: offset across the lane, yaw, tilt and length scale. */
interface Piece {
  readonly dz: number;
  readonly dx: number;
  readonly yaw: number;
  readonly tilt: number;
  readonly length: number;
}

/** The two splintered halves of a used trap. */
const BROKEN_PIECES: readonly Piece[] = [
  { dz: -0.2, dx: 0.02, yaw: 0.45, tilt: 0.12, length: 0.46 },
  { dz: 0.22, dx: -0.06, yaw: -0.6, tilt: -0.2, length: 0.4 },
];

/** The rollers of both sides. */
export interface TrapRollers {
  readonly mesh: InstancedMesh;
  /** Places every roller from the latest Duel state for the player of `viewSide`. */
  update(state: Readonly<DuelState>, viewSide: Side): void;
  dispose(): void;
}

/** Writes instances of one roller or roller piece. */
interface InstanceWriter {
  write(x: number, z: number, piece: Piece, roll: number, color: Color): void;
}

/**
 * View x of a side's resting roller. The near roller lies just in front of the near
 * wall (its parapet would hide it otherwise), the far roller on the far wall's inner
 * edge, so both players read the open lanes of both bastions (spec 18.7).
 */
function restX(side: Side, viewSide: Side): number {
  const baseLine =
    side === 'south' ? duelRules.board.southBaseLineX : duelRules.board.northBaseLineX;
  const viewBaseLine = viewX(baseLine, viewSide);
  const near = side === viewSide;
  return simXToWorldX(near ? viewBaseLine + NEAR_REST_INSET : viewBaseLine + FAR_REST_OUTSET);
}

/** Writes the instances of one lane's trap. */
function writeTrap(
  writer: InstanceWriter,
  trap: TrapState,
  place: { readonly restX: number; readonly z: number },
  viewSide: Side,
  colors: { readonly intact: Color; readonly broken: Color },
): void {
  const whole: Piece = { dz: 0, dx: 0, yaw: 0, tilt: 0, length: 1 };
  if (trap.rollerX !== null) {
    const x = simXToWorldX(viewX(trap.rollerX, viewSide));
    writer.write(x, place.z, whole, (x - place.restX) / ROLLER_RADIUS, colors.intact);
  } else if (trap.used) {
    for (const piece of BROKEN_PIECES) {
      writer.write(place.restX, place.z, piece, 0, colors.broken);
    }
  } else {
    writer.write(place.restX, place.z, whole, 0, colors.intact);
  }
}

/** Creates the instance writer: lays each cylinder across its lane and rolls it. */
function createWriter(mesh: InstancedMesh, counter: { count: number }): InstanceWriter {
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const roll = new Quaternion();
  const across = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0));
  const scale = new Vector3();
  const position = new Vector3();
  const euler = new Euler();
  return {
    write: (x, z, piece, rollAngle, color): void => {
      roll.setFromAxisAngle(new Vector3(0, 0, 1), -rollAngle);
      rotation
        .setFromEuler(euler.set(piece.tilt, piece.yaw, 0))
        .multiply(roll)
        .multiply(across);
      position.set(x + piece.dx, ROLLER_RADIUS + 0.2, z + piece.dz);
      matrix.compose(position, rotation, scale.set(1, piece.length, 1));
      mesh.setMatrixAt(counter.count, matrix);
      mesh.setColorAt(counter.count, color);
      counter.count += 1;
    },
  };
}

/** Creates the trap rollers of both sides. */
export function createTrapRollers(): TrapRollers {
  const geometry = new CylinderGeometry(ROLLER_RADIUS, ROLLER_RADIUS, ROLLER_LENGTH, 10);
  const material = new MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradientMap() });
  const mesh = new InstancedMesh(geometry, material, MAX_INSTANCES);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const counter = { count: 0 };
  const writer = createWriter(mesh, counter);
  const colors = { intact: new Color(INTACT_COLOR), broken: new Color(BROKEN_COLOR) };
  return {
    mesh,
    update: (state, viewSide): void => {
      counter.count = 0;
      for (const side of SIDES) {
        const x = restX(side, viewSide);
        state.sides[side].traps.forEach((trap, lane) => {
          const place = { restX: x, z: laneToWorldZ(viewLane(lane, viewSide)) };
          writeTrap(writer, trap, place, viewSide, colors);
        });
      }
      mesh.count = counter.count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
