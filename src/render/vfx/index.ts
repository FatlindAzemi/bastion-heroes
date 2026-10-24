/**
 * The spec 9.7 VFX layer (issue #75): one orchestrator that turns simulation
 * events into the eighteen VFX ids, the 9.7 juice rules (damage numbers, screen
 * shake requests, health bars, combo popups) and the slow-motion hint. Every id
 * lives in its own module (`<id>.ts`); this file owns the per-frame state and is
 * driven only by render-side code, never by the simulation.
 */

import { Group, type Camera } from 'three';

import { enemyById, rules } from '../../data';
import type { SimEvent, SimState } from '../../sim/types';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import { createChainArcs, type ChainArcs } from './chainArcs';
import { createDamageNumbers, type DamageNumbers } from './damageNumbers';
import type { DebugVfx } from './debugVfx';
import { createHealthBars, type HealthBars } from './healthBars';
import {
  damageColorFor,
  damageMultiplierFor,
  DAMAGE_COLOR_EFFECTIVE,
  SHAKE_AMPLITUDE,
  SHAKE_HIT_THRESHOLD,
} from './juice';
import { createOrbGlow, type OrbGlow } from './orbGlow';
import { createComboPopups, type ComboPopups } from './popups';
import { createBlastRings, type BlastRings } from './rings';
import { createStatusMeshes, type StatusMeshes } from './statusMeshes';
import { createTrapLogs, type TrapLogs } from './trapLogs';
import { loadParticleSheet } from './texture';
import type { VfxId } from './types';
import { enemyHoverHeight, unitHeadHeight } from './unitHeights';

/** Essence orb hover height: the renderer's spec 9.4 orb height (0.5 tile). */
const ORB_HEIGHT = 0.5 * rules.grid.tileSize;
/** Debug VFX loop period for screenshot runs (issue #66/#74 style helper). */
const DEBUG_VFX_INTERVAL_S = 0.5;
/** Board bounds used by the full-screen confetti (spec 9.1 playfield). */
const CONFETTI_SPOTS = [-2, -0.5, 1, 2.5, 4, 5.5, 7, 8.5, 10, 11.5] as const;

/** A queued hit: resolved when the sim state is available in `update`. */
interface HitRequest {
  targetId: number;
  amount: number;
  damageType: 'pierce' | 'blast' | 'arcane';
}

/** A queued status VFX request. */
interface StatusRequest {
  targetId: number;
  status: 'slow' | 'freeze' | 'burn' | 'poison' | 'stun' | 'wet';
}

/** A queued combo popup request. */
interface ComboRequest {
  combo: 'steam' | 'shatter' | 'toxic' | 'chain';
  x: number;
  lane: number;
}

/** Options of the VFX layer: the shared particle system and the shake callback. */
export interface VfxOptions {
  readonly particles: import('../particles').ParticleBursts;
  /** Requests the spec 9.7 screen shake from the level scene. */
  readonly onShake: (amplitude: number) => void;
  readonly debugVfx?: DebugVfx | null;
}

/** The VFX layer surface the level scene drives. */
export interface VfxLayer {
  readonly object: Group;
  handleEvents(events: readonly SimEvent[]): void;
  /** Resolves queued events and advances every effect; called once per drawn frame. */
  update(state: Readonly<SimState>, deltaSeconds: number, camera: Camera): void;
  dispose(): void;
}

/** Particle id per hit damage type (spec 9.7 hit table). */
const HIT_IDS: Readonly<Record<'pierce' | 'blast' | 'arcane', VfxId>> = {
  pierce: 'hit_pierce',
  blast: 'hit_blast',
  arcane: 'hit_arcane',
};

/** Particle id per status (spec 9.7 status table). */
const STATUS_IDS: Readonly<Record<'slow' | 'freeze' | 'burn' | 'poison', VfxId>> = {
  slow: 'status_slow',
  freeze: 'status_freeze',
  burn: 'status_burn',
  poison: 'status_poison',
};

/** Combo particle id per combo. */
const COMBO_IDS: Readonly<Record<'steam' | 'shatter' | 'toxic' | 'chain', VfxId>> = {
  steam: 'combo_steam',
  shatter: 'combo_shatter',
  toxic: 'combo_toxic',
  chain: 'combo_chain',
};

/** Creates the complete VFX layer: all subsystem meshes live under its group. */
export function createVfxLayer(options: VfxOptions): VfxLayer {
  const object = new Group();
  object.name = 'vfx';
  const damageNumbers: DamageNumbers = createDamageNumbers(object);
  const popups: ComboPopups = createComboPopups(object);
  const healthBars: HealthBars = createHealthBars(object);
  const statusMeshes: StatusMeshes = createStatusMeshes(object);
  const rings: BlastRings = createBlastRings(object);
  const chainArcs: ChainArcs = createChainArcs(object);
  const trapLogs: TrapLogs = createTrapLogs(object);
  const orbGlow: OrbGlow = createOrbGlow(object);
  void loadParticleSheet().then((texture) => {
    if (texture !== null) {
      options.particles.setTexture(texture);
      orbGlow.setTexture(texture);
    }
  });

  const hits: HitRequest[] = [];
  const statuses: StatusRequest[] = [];
  const combos: ComboRequest[] = [];
  const attackSources: number[] = [];
  const statusTimers = new Map<number, number>();
  const elapsed = { seconds: 0 };
  let nextDebugAt = 0;
  let disposed = false;

  /** Position of one unit (defender or enemy) and its head height. */
  function unitPosition(
    state: Readonly<SimState>,
    id: number,
  ): { x: number; y: number; z: number } | null {
    const defender = state.defenders.find((unit) => unit.id === id);
    if (defender !== undefined) {
      return {
        x: simXToWorldX(defender.col + 0.5),
        y: unitHeadHeight('defender', defender.defenderId),
        z: laneToWorldZ(defender.lane),
      };
    }
    const enemy = state.enemies.find((unit) => unit.id === id);
    if (enemy !== undefined) {
      const hover = enemyHoverHeight(enemy.enemyId);
      return {
        x: simXToWorldX(enemy.x),
        y: unitHeadHeight('enemy', enemy.enemyId) + hover,
        z: laneToWorldZ(enemy.lane),
      };
    }
    return null;
  }

  /** Damage-number colour of one hit: 4.1 armor table for enemies, neutral for defenders. */
  function hitColor(state: Readonly<SimState>, request: HitRequest): number {
    const enemy = state.enemies.find((unit) => unit.id === request.targetId);
    if (enemy === undefined) {
      return 0xffffff;
    }
    const armor = enemyById[enemy.enemyId]?.armor ?? 'light';
    return damageColorFor(damageMultiplierFor(request.damageType, armor));
  }

  /** Spawns the immediate particles of a VFX id at a world position. */
  function spawnParticles(id: VfxId, x: number, y: number, z: number): void {
    options.particles.burst(id, x, y, z);
    if (id === 'hit_blast') {
      rings.spawn(x, y - 0.2, z);
    }
  }

  /** Spawns one combo's particles, popup and (for chain) lightning arcs. */
  function spawnCombo(combo: ComboRequest, state: Readonly<SimState> | null): void {
    const x = simXToWorldX(combo.x);
    const z = laneToWorldZ(combo.lane);
    options.particles.burst(COMBO_IDS[combo.combo], x, 1.0, z);
    popups.spawn(combo.combo, x, 2.05, z);
    if (combo.combo === 'chain' && state !== null) {
      const targets: [number, number, number][] = [];
      for (const enemy of state.enemies) {
        if (targets.length >= 2) {
          break;
        }
        targets.push([
          simXToWorldX(enemy.x),
          0.8 + enemyHoverHeight(enemy.enemyId),
          laneToWorldZ(enemy.lane),
        ]);
      }
      chainArcs.spawn([x, 1.0, z], targets);
    }
  }

  /** Fires one VFX id for the debug screenshot helper. */
  function spawnDebug(id: VfxId): void {
    const x = 5;
    const z = laneToWorldZ(2);
    spawnParticles(id, x, 1.2, z);
    if (id === 'win_confetti') {
      for (const spot of CONFETTI_SPOTS) {
        options.particles.burstAt('win_confetti', spot, 2.6, 2.5, 3);
      }
    } else if (id === 'trap_roll') {
      trapLogs.spawn(2);
    } else if (
      id === 'combo_steam' ||
      id === 'combo_shatter' ||
      id === 'combo_toxic' ||
      id === 'combo_chain'
    ) {
      spawnCombo({ combo: id.slice(6) as ComboRequest['combo'], x: 5, lane: 2 }, null);
    } else if (id === 'hit_pierce' || id === 'hit_blast' || id === 'hit_arcane') {
      damageNumbers.spawn(x, 1.4, z, 250, DAMAGE_COLOR_EFFECTIVE);
    }
  }

  /** Applies the debug screenshot helper: loops one VFX id or the shake. */
  function debugTick(): void {
    const debug = options.debugVfx;
    if (debug === undefined || debug === null || elapsed.seconds < nextDebugAt) {
      return;
    }
    nextDebugAt = elapsed.seconds + DEBUG_VFX_INTERVAL_S;
    if (debug.shake) {
      options.onShake(SHAKE_AMPLITUDE);
      spawnParticles('hit_blast', 5, 1.2, laneToWorldZ(2));
    } else if (debug.id !== null) {
      spawnDebug(debug.id);
    }
  }

  return {
    object,
    handleEvents: (events): void => {
      for (const event of events) {
        switch (event.type) {
          case 'hit':
            hits.push(event);
            break;
          case 'statusApplied':
            statuses.push(event);
            break;
          case 'combo':
            combos.push(event);
            break;
          case 'trapFired':
            trapLogs.spawn(event.lane);
            options.particles.burst('trap_roll', -0.4, 0.15, laneToWorldZ(event.lane));
            options.onShake(SHAKE_AMPLITUDE);
            break;
          case 'attack':
            attackSources.push(event.sourceId);
            break;
          case 'levelWon':
            for (const spot of CONFETTI_SPOTS) {
              options.particles.burstAt('win_confetti', spot, 2.6, 2.5, 3);
            }
            break;
          default:
            break;
        }
      }
    },
    update: (state, deltaSeconds, camera): void => {
      elapsed.seconds += deltaSeconds;
      debugTick();

      for (const request of hits) {
        const position = unitPosition(state, request.targetId);
        if (position === null) {
          continue;
        }
        healthBars.markDamaged(request.targetId);
        damageNumbers.spawn(
          position.x,
          position.y + 0.25,
          position.z,
          request.amount,
          hitColor(state, request),
        );
        spawnParticles(HIT_IDS[request.damageType], position.x, position.y, position.z);
        if (request.amount >= SHAKE_HIT_THRESHOLD) {
          options.onShake(SHAKE_AMPLITUDE);
        }
      }
      hits.length = 0;

      for (const request of statuses) {
        const position = unitPosition(state, request.targetId);
        if (position === null || request.status === 'stun' || request.status === 'wet') {
          continue;
        }
        spawnParticles(STATUS_IDS[request.status], position.x, position.y - 0.2, position.z);
      }
      statuses.length = 0;

      for (const request of combos) {
        spawnCombo(request, state);
      }
      combos.length = 0;

      for (const sourceId of attackSources) {
        const enemy = state.enemies.find((unit) => unit.id === sourceId);
        if (enemy === undefined) {
          continue;
        }
        const definition = enemyById[enemy.enemyId];
        if (definition?.isBoss === true || enemy.enemyId === 'gloom_ogre') {
          options.onShake(SHAKE_AMPLITUDE);
        }
      }
      attackSources.length = 0;

      // Continuous status sparkles/flames/bubbles: one emission per status per 0.4 s.
      for (const enemy of state.enemies) {
        const position = unitPosition(state, enemy.id);
        if (position === null) {
          continue;
        }
        for (const status of enemy.statuses) {
          if (status.kind !== 'slow' && status.kind !== 'burn' && status.kind !== 'poison') {
            continue;
          }
          const nextAt = statusTimers.get(enemy.id) ?? 0;
          if (elapsed.seconds < nextAt) {
            continue;
          }
          statusTimers.set(enemy.id, elapsed.seconds + 0.4);
          spawnParticles(STATUS_IDS[status.kind], position.x, position.y - 0.25, position.z);
        }
      }
      // Essence orb sparkle trail (spec 9.7): a small star every 0.5 s per orb.
      for (const orb of state.orbs) {
        const nextAt = statusTimers.get(-orb.id - 1) ?? 0;
        if (elapsed.seconds < nextAt) {
          continue;
        }
        statusTimers.set(-orb.id - 1, elapsed.seconds + 0.5);
        options.particles.burst(
          'essence_orb',
          simXToWorldX(orb.x),
          ORB_HEIGHT,
          laneToWorldZ(orb.lane),
        );
      }

      damageNumbers.update(deltaSeconds);
      popups.update(deltaSeconds);
      healthBars.update(state, camera);
      statusMeshes.update(state);
      rings.update(deltaSeconds);
      chainArcs.update(deltaSeconds);
      trapLogs.update(deltaSeconds);
      orbGlow.update(state.orbs, ORB_HEIGHT, elapsed.seconds);
    },
    dispose: (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      damageNumbers.dispose();
      popups.dispose();
      healthBars.dispose();
      statusMeshes.dispose();
      rings.dispose();
      chainArcs.dispose();
      trapLogs.dispose();
      orbGlow.dispose();
      object.clear();
    },
  };
}
