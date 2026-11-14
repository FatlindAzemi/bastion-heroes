/**
 * Gate-hit and trap VFX of the Duel (spec 18.7, 9.7; issue #129). They are built
 * only from the existing 9.7 ids and batches (impact flash, `aoe_ring`,
 * `aoe_shockwave`, `hit_blast`, `trap_roll`, `glow_rise`), so they add no draw calls.
 * Colours follow the side rings of 18.1: an effect takes the colour of the side that
 * caused it, teal when it is the viewer's and red when it is the opponent's.
 */
import { duelRules } from '../../data';
import type { DuelEvent, DuelState, Side } from '../../sim/duel';
import type { ParticleBursts } from '../particles';
import { AOE_GROUND_Y } from '../vfx/rings';
import { SHAKE_AMPLITUDE } from '../vfx/juice';
import type { VfxLayer } from '../vfx/index';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import { ENEMY_SIDE_COLOR, FLASH_WHITE, OWN_SIDE_COLOR, STONE_DEBRIS_COLOR } from './duelColors';
import type { BoardEnd } from './duelEnvironment';
import { viewLane, viewX } from './duelView';

/** Seconds between two dust puffs of a rolling trap (as in the campaign trap, 9.7). */
const ROLLER_DUST_INTERVAL_S = 0.09;
/** Sizes of the gate-hit blast: wider than a unit hit, it is the biggest event of a match. */
const GATE_GROUND_RADIUS = 2.4;
const GATE_SHOCKWAVE_RADIUS = 1.7;
const GATE_FLASH_SCALE = 3.2;
/** Sizes of the trap fire, matching the campaign trap ring (vfx/index.ts). */
const TRAP_GROUND_RADIUS = 2.8;
const TRAP_SHOCKWAVE_RADIUS = 1.8;
const TRAP_FLASH_SCALE = 2.4;

/** What the Duel effects drive. */
export interface DuelEffectsOptions {
  readonly viewSide: Side;
  readonly particles: ParticleBursts;
  readonly vfx: VfxLayer;
  /** Requests the spec 9.7 screen shake. */
  readonly shake: (amplitude: number) => void;
  /** Flashes the struck bastion. */
  readonly flashBastion: (end: BoardEnd, color: number) => void;
}

/** The Duel's gate and trap effects. */
export interface DuelEffects {
  handleEvents(events: readonly DuelEvent[]): void;
  /** Emits the dust trail of every rolling trap; once per drawn frame. */
  update(state: Readonly<DuelState>, deltaSeconds: number): void;
}

/** The other side. */
function opponentOf(side: Side): Side {
  return side === 'south' ? 'north' : 'south';
}

/** View x of a side's base line (spec 18.1). */
function baseLineViewX(side: Side, viewSide: Side): number {
  const baseLine =
    side === 'south' ? duelRules.board.southBaseLineX : duelRules.board.northBaseLineX;
  return simXToWorldX(viewX(baseLine, viewSide));
}

/** Creates the gate-hit and trap effects. */
export function createDuelEffects(options: DuelEffectsOptions): DuelEffects {
  const { viewSide, particles } = options;
  const { aoeRings, impactFlash } = options.vfx.effects;
  const dustTimers = new Map<string, number>();
  let elapsedSeconds = 0;
  const colorOf = (side: Side): number => (side === viewSide ? OWN_SIDE_COLOR : ENEMY_SIDE_COLOR);
  const endOf = (side: Side): BoardEnd => (side === viewSide ? 'near' : 'far');

  /** A raider of `raiderSide` broke through in `lane` and hit the opponent's gate (18.7). */
  function gateHit(raiderSide: Side, lane: number): void {
    const gateSide = opponentOf(raiderSide);
    const color = colorOf(raiderSide);
    const x = baseLineViewX(gateSide, viewSide);
    const z = laneToWorldZ(viewLane(lane, viewSide));
    impactFlash.spawn(x, 0.9, z, color, GATE_FLASH_SCALE);
    impactFlash.spawn(x, 0.6, z, FLASH_WHITE, GATE_FLASH_SCALE * 0.6);
    aoeRings.spawnGround(x, AOE_GROUND_Y, z, GATE_GROUND_RADIUS, color);
    aoeRings.spawnShockwave(x, 0.8, z, GATE_SHOCKWAVE_RADIUS, FLASH_WHITE);
    aoeRings.spawnShockwave(x, 0.55, z, GATE_SHOCKWAVE_RADIUS * 1.5, color);
    particles.burst('hit_blast', x, 0.8, z, undefined, 2);
    particles.burst('hit_blast', x, 0.6, z, STONE_DEBRIS_COLOR, 1.5);
    particles.sparkle(x, 0.9, z, color, 16);
    options.flashBastion(endOf(gateSide), color);
  }

  /** The trap of `owner` in `lane` fires and starts rolling (18.7, 9.7). */
  function trapFired(owner: Side, lane: number): void {
    const color = colorOf(owner);
    const x = baseLineViewX(owner, viewSide);
    const z = laneToWorldZ(viewLane(lane, viewSide));
    impactFlash.spawn(x, 0.5, z, color, TRAP_FLASH_SCALE);
    aoeRings.spawnGround(x, AOE_GROUND_Y, z, TRAP_GROUND_RADIUS, color);
    aoeRings.spawnShockwave(x, 0.5, z, TRAP_SHOCKWAVE_RADIUS, color);
    aoeRings.spawnShockwave(x, 0.4, z, TRAP_SHOCKWAVE_RADIUS * 1.4, FLASH_WHITE);
    particles.burst('trap_roll', x, 0.15, z, undefined, 1.5);
    particles.sparkle(x, 0.3, z, color, 12);
    // Spec 9.7: trap firing shakes the screen.
    options.shake(SHAKE_AMPLITUDE);
  }

  /** One dust puff and a side-coloured spark behind every rolling roller. */
  function rollerDust(state: Readonly<DuelState>, side: Side): void {
    state.sides[side].traps.forEach((trap, lane) => {
      const key = `${side}:${lane}`;
      if (trap.rollerX === null || elapsedSeconds < (dustTimers.get(key) ?? 0)) {
        return;
      }
      dustTimers.set(key, elapsedSeconds + ROLLER_DUST_INTERVAL_S);
      const x = simXToWorldX(viewX(trap.rollerX, viewSide));
      const z = laneToWorldZ(viewLane(lane, viewSide));
      particles.burst('trap_roll', x, 0.25, z);
      particles.sparkle(x, 0.35, z, colorOf(side), 2);
    });
  }

  return {
    handleEvents: (events): void => {
      for (const event of events) {
        if (event.type === 'raiderReachedBase') {
          gateHit(event.side, event.lane);
        } else if (event.type === 'trapFired') {
          trapFired(event.side, event.lane);
        }
      }
    },
    update: (state, deltaSeconds): void => {
      elapsedSeconds += deltaSeconds;
      rollerDust(state, 'south');
      rollerDust(state, 'north');
    },
  };
}
