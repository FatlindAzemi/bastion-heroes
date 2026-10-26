/**
 * The spec 9.7 VFX layer (issue #75) in the 2.5D relaunch look (issue #114 §3):
 * one orchestrator that turns simulation events into the eighteen VFX ids, the 9.7
 * juice rules (bouncing damage numbers, screen shake requests, health bars, combo
 * popups) and the slow-motion hint. The relaunch adds the target progress rings
 * over defenders, flat neon AOE ground rings and energy shockwaves for blast hits,
 * trap fire and Ogre/boss smashes, additive hit flashes and rising glow embers.
 * Every id still lives in its own module (`<id>.ts`); this file owns the per-frame
 * state and is driven only by render-side code, never by the simulation.
 */

import { Group, type Camera } from 'three';

import { enemyById, rules } from '../../data';
import type { DamageType } from '../../sim/combat/damage';
import type { SimEvent, SimState } from '../../sim/types';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import { createChainArcs, type ChainArcs } from './chainArcs';
import { createDamageNumbers, type DamageNumbers } from './damageNumbers';
import type { DebugVfx } from './debugVfx';
import { readDebugJuice, type DebugJuiceMode } from './debugJuice';
import { createHealthBars, type HealthBars } from './healthBars';
import { createImpactFlash, type ImpactFlash } from './impactFlash';
import {
  AOE_COLORS,
  damageMultiplierFor,
  damageNumberColor,
  DAMAGE_TYPE_COLORS,
  SHAKE_AMPLITUDE,
  SHAKE_HIT_THRESHOLD,
} from './juice';
import { createOrbGlow, type OrbGlow } from './orbGlow';
import { createComboPopups, type ComboPopups } from './popups';
import { AOE_GROUND_Y, createAoeRings, type AoeRings } from './rings';
import { createStatusMeshes, type StatusMeshes } from './statusMeshes';
import { createTargetRings, type TargetRings } from './targetRings';
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

/** World radius of the blast-hit ground ring and its energy shockwave. */
const BLAST_GROUND_RADIUS = 1.4;
const BLAST_SHOCKWAVE_RADIUS = 1.0;
/** World radius of the Ogre and boss smash rings (the bosses are bigger). */
const OGRE_SMASH_RADIUS = 2.8;
const BOSS_SMASH_RADIUS = 3.4;
/** World radius of the trap-fire emerald shockwave at the base side. */
const TRAP_RING_RADIUS = 2.8;
/** Emission interval of the rising glow sparkles of a burning/poisoned enemy. */
const SPARKLE_INTERVAL_S = 0.4;
/** Dust emission interval while a trap log rolls down its lane (sim `rollerX`). */
const TRAP_DUST_INTERVAL_S = 0.09;
/** Additive sparkle colour per continuous status (spec 9.4 palette). */
const STATUS_SPARKLE_COLORS: Readonly<Record<'slow' | 'freeze' | 'burn' | 'poison', number>> = {
  slow: 0x3fa9f5,
  freeze: 0x9be7ff,
  burn: 0xff8a2b,
  poison: 0x7cff6b,
};

/** Additive sparkle colour per combo popup (spec 4.6 palette). */
const COMBO_SPARKLE_COLORS: Readonly<Record<ComboRequest['combo'], number>> = {
  steam: 0xf4fbff,
  shatter: 0x9be7ff,
  toxic: 0x7cff6b,
  chain: 0x3cf2ff,
};

/** A queued hit: resolved when the sim state is available in `update`. */
interface HitRequest {
  targetId: number;
  amount: number;
  damageType: DamageType;
  crit: boolean;
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
const HIT_IDS: Readonly<Record<DamageType, VfxId>> = {
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
const COMBO_IDS: Readonly<Record<ComboRequest['combo'], VfxId>> = {
  steam: 'combo_steam',
  shatter: 'combo_shatter',
  toxic: 'combo_toxic',
  chain: 'combo_chain',
};

/** Debug showcase mode read from `?debugjuice=` in browser builds (never in tests). */
function readDebugJuiceMode(): DebugJuiceMode | null {
  return typeof window === 'undefined' ? null : readDebugJuice(window.location.search);
}

/** Creates the complete VFX layer: all subsystem meshes live under its group. */
export function createVfxLayer(options: VfxOptions): VfxLayer {
  const object = new Group();
  object.name = 'vfx';
  const damageNumbers: DamageNumbers = createDamageNumbers(object);
  const popups: ComboPopups = createComboPopups(object);
  const healthBars: HealthBars = createHealthBars(object);
  const statusMeshes: StatusMeshes = createStatusMeshes(object);
  const aoeRings: AoeRings = createAoeRings(object);
  const targetRings: TargetRings = createTargetRings(object);
  const impactFlash: ImpactFlash = createImpactFlash(object);
  const chainArcs: ChainArcs = createChainArcs(object);
  const trapLogs: TrapLogs = createTrapLogs(object);
  const orbGlow: OrbGlow = createOrbGlow(object);
  void loadParticleSheet().then((texture) => {
    if (texture !== null) {
      options.particles.setTexture(texture);
      orbGlow.setTexture(texture);
      impactFlash.setTexture(texture);
    }
  });

  const hits: HitRequest[] = [];
  const statuses: StatusRequest[] = [];
  const combos: ComboRequest[] = [];
  const attackSources: number[] = [];
  const statusTimers = new Map<number, number>();
  const trapDustTimers = new Map<number, number>();
  const elapsed = { seconds: 0 };
  const debugJuice = readDebugJuiceMode();
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

  /** Spec 4.1 effectiveness multiplier of one hit (1 for defender targets). */
  function hitMultiplier(state: Readonly<SimState>, request: HitRequest): number {
    const enemy = state.enemies.find((unit) => unit.id === request.targetId);
    if (enemy === undefined) {
      return 1;
    }
    const armor = enemyById[enemy.enemyId]?.armor ?? 'light';
    return damageMultiplierFor(request.damageType, armor);
  }

  /** Spawns the flat ground ring plus the energy shockwave of a blast hit. */
  function spawnBlastImpact(x: number, y: number, z: number, amount: number, crit: boolean): void {
    const power = Math.min(1, amount / SHAKE_HIT_THRESHOLD);
    const growth = 0.8 + power * 0.45;
    aoeRings.spawnGround(x, AOE_GROUND_Y, z, BLAST_GROUND_RADIUS * growth, AOE_COLORS.blast);
    aoeRings.spawnShockwave(x, y - 0.35, z, BLAST_SHOCKWAVE_RADIUS * growth, AOE_COLORS.blast);
    if (crit) {
      aoeRings.spawnShockwave(
        x,
        y - 0.35,
        z,
        BLAST_SHOCKWAVE_RADIUS * growth * 1.3,
        AOE_COLORS.white,
      );
    }
  }

  /** Spawns the gold/violet ground ring and shockwave of an Ogre or boss smash. */
  function spawnSmashImpact(x: number, z: number, color: number, radius: number): void {
    aoeRings.spawnGround(x, AOE_GROUND_Y, z, radius, color);
    aoeRings.spawnShockwave(x, 0.7, z, radius * 0.7, color);
    options.onShake(SHAKE_AMPLITUDE);
  }

  /** Resolves one queued hit: number, flash, particles, blast AOE and shake. */
  function spawnHit(state: Readonly<SimState>, request: HitRequest): void {
    const position = unitPosition(state, request.targetId);
    if (position === null) {
      return;
    }
    const multiplier = hitMultiplier(state, request);
    const typeColor = DAMAGE_TYPE_COLORS[request.damageType];
    healthBars.markDamaged(request.targetId);
    damageNumbers.spawn(position.x, position.y + 0.25, position.z, {
      amount: request.amount,
      damageType: request.damageType,
      multiplier,
      crit: request.crit,
    });
    options.particles.burst(
      HIT_IDS[request.damageType],
      position.x,
      position.y,
      position.z,
      undefined,
      request.crit ? 1.5 : 1,
    );
    options.particles.sparkle(
      position.x,
      position.y,
      position.z,
      damageNumberColor(request.damageType, multiplier),
      request.crit ? 10 : 5,
    );
    impactFlash.spawn(position.x, position.y, position.z, typeColor, request.crit ? 1.5 : 1);
    if (request.damageType === 'blast') {
      spawnBlastImpact(position.x, position.y, position.z, request.amount, request.crit);
    }
    if (request.amount >= SHAKE_HIT_THRESHOLD) {
      options.onShake(SHAKE_AMPLITUDE);
    }
  }

  /** Spawns one combo's particles, popup and (for chain) lightning arcs. */
  function spawnCombo(combo: ComboRequest, state: Readonly<SimState> | null): void {
    const x = simXToWorldX(combo.x);
    const z = laneToWorldZ(combo.lane);
    options.particles.burst(COMBO_IDS[combo.combo], x, 1.0, z);
    options.particles.sparkle(x, 1.0, z, COMBO_SPARKLE_COLORS[combo.combo], 6);
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

  /** Fires the trap: rolling log, emerald lane ring and the 9.7 shake. */
  function spawnTrapFire(lane: number): void {
    const z = laneToWorldZ(lane);
    trapLogs.spawn(lane);
    options.particles.burst('trap_roll', -0.4, 0.15, z);
    aoeRings.spawnGround(
      simXToWorldX(rules.trap.trapStartX),
      AOE_GROUND_Y,
      z,
      TRAP_RING_RADIUS,
      AOE_COLORS.emerald,
    );
    aoeRings.spawnShockwave(simXToWorldX(rules.trap.trapStartX), 0.5, z, 1.8, AOE_COLORS.emerald);
    options.onShake(SHAKE_AMPLITUDE);
  }

  /** Fires one VFX id for the debug screenshot helper. */
  function spawnDebug(id: VfxId): void {
    const x = 5;
    const z = laneToWorldZ(2);
    if (id === 'win_confetti') {
      for (const spot of CONFETTI_SPOTS) {
        options.particles.burstAt('win_confetti', spot, 2.6, 2.5, 3);
      }
    } else if (id === 'trap_roll') {
      trapLogs.spawn(2);
    } else if (id === 'hit_pierce' || id === 'hit_blast' || id === 'hit_arcane') {
      spawnDebugHit(id.slice(4) as DamageType);
    } else if (
      id === 'combo_steam' ||
      id === 'combo_shatter' ||
      id === 'combo_toxic' ||
      id === 'combo_chain'
    ) {
      spawnCombo({ combo: id.slice(6) as ComboRequest['combo'], x: 5, lane: 2 }, null);
    } else {
      options.particles.burst(id, x, 1.2, z);
    }
  }

  /** One debug hit: number, flash, particles and (for blast) the AOE rings. */
  function spawnDebugHit(damageType: DamageType): void {
    const x = 5;
    const y = 1.4;
    const z = laneToWorldZ(2);
    const multiplier = damageType === 'pierce' ? 1.25 : 1;
    damageNumbers.spawn(x, y, z, {
      amount: damageType === 'arcane' ? 250 : 120,
      damageType,
      multiplier,
      crit: damageType === 'arcane',
    });
    options.particles.burst(HIT_IDS[damageType], x, y - 0.4, z);
    options.particles.sparkle(x, y - 0.4, z, DAMAGE_TYPE_COLORS[damageType], 8);
    impactFlash.spawn(x, y - 0.4, z, DAMAGE_TYPE_COLORS[damageType], 1.2);
    if (damageType === 'blast') {
      spawnBlastImpact(x, y - 0.4, z, 120, false);
    }
  }

  /** Shows the damage-type palette plus a crit for `?debugjuice=numbers`. */
  function spawnDebugNumbers(): void {
    const spots: readonly {
      lane: number;
      x: number;
      damageType: DamageType;
      crit: boolean;
    }[] = [
      { lane: 0, x: 3.2, damageType: 'pierce', crit: false },
      { lane: 2, x: 4.6, damageType: 'blast', crit: false },
      { lane: 4, x: 5.8, damageType: 'arcane', crit: true },
    ];
    for (const spot of spots) {
      damageNumbers.spawn(simXToWorldX(spot.x), 1.2, laneToWorldZ(spot.lane), {
        amount: spot.crit ? 250 : 120,
        damageType: spot.damageType,
        multiplier: spot.crit ? 1.25 : 1,
        crit: spot.crit,
      });
    }
  }

  /** Shows the emerald/gold/violet AOE palette for `?debugjuice=rings`. */
  function spawnDebugRings(): void {
    aoeRings.spawnGround(2.0, AOE_GROUND_Y, laneToWorldZ(0), 1.5, AOE_COLORS.emerald);
    aoeRings.spawnGround(4.5, AOE_GROUND_Y, laneToWorldZ(1), 1.7, AOE_COLORS.gold);
    aoeRings.spawnGround(6.5, AOE_GROUND_Y, laneToWorldZ(2), 1.9, AOE_COLORS.violet);
    aoeRings.spawnShockwave(2.0, 0.85, laneToWorldZ(0), 1.1, AOE_COLORS.emerald);
    aoeRings.spawnShockwave(4.5, 0.85, laneToWorldZ(1), 1.3, AOE_COLORS.gold);
    aoeRings.spawnShockwave(6.5, 0.85, laneToWorldZ(2), 1.5, AOE_COLORS.violet);
  }

  /** Shows the white/coloured impact flashes for `?debugjuice=flash`. */
  function spawnDebugFlashes(): void {
    for (let lane = 0; lane < rules.grid.laneCount; lane += 1) {
      impactFlash.spawn(
        simXToWorldX(4.5),
        1.2,
        laneToWorldZ(lane),
        DAMAGE_TYPE_COLORS[(['pierce', 'blast', 'arcane'] as const)[lane % 3] ?? 'pierce'],
        1.3,
      );
    }
  }

  /** Applies the debug screenshot helper: loops one VFX id, the juice showcase or shake. */
  function debugTick(): void {
    const debug = options.debugVfx;
    if (elapsed.seconds < nextDebugAt) {
      return;
    }
    nextDebugAt = elapsed.seconds + DEBUG_VFX_INTERVAL_S;
    if (debug !== undefined && debug !== null) {
      if (debug.shake) {
        options.onShake(SHAKE_AMPLITUDE);
        spawnDebug('hit_blast');
        return;
      }
      if (debug.id !== null) {
        spawnDebug(debug.id);
        return;
      }
    }
    if (debugJuice === 'numbers') {
      spawnDebugNumbers();
    } else if (debugJuice === 'rings') {
      spawnDebugRings();
    } else if (debugJuice === 'flash') {
      spawnDebugFlashes();
    }
  }

  /** Emits the dust trail of every rolling trap log from the sim `rollerX` (3.9). */
  function updateTrapDust(state: Readonly<SimState>): void {
    for (let lane = 0; lane < state.traps.length; lane += 1) {
      const rollerX = state.traps[lane]?.rollerX;
      if (rollerX === null || rollerX === undefined) {
        continue;
      }
      const nextAt = trapDustTimers.get(lane) ?? 0;
      if (elapsed.seconds < nextAt) {
        continue;
      }
      trapDustTimers.set(lane, elapsed.seconds + TRAP_DUST_INTERVAL_S);
      const x = simXToWorldX(rollerX);
      const z = laneToWorldZ(lane);
      options.particles.burst('trap_roll', x, 0.12, z);
      options.particles.sparkle(x, 0.2, z, AOE_COLORS.emerald, 1);
    }
  }

  /** Continuous status sparkles, flames and bubbles plus the Essence orb trail. */
  function updateContinuousEffects(state: Readonly<SimState>): void {
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
        statusTimers.set(enemy.id, elapsed.seconds + SPARKLE_INTERVAL_S);
        options.particles.burst(STATUS_IDS[status.kind], position.x, position.y - 0.25, position.z);
        options.particles.sparkle(
          position.x,
          position.y - 0.3,
          position.z,
          STATUS_SPARKLE_COLORS[status.kind],
          2,
        );
      }
    }
    for (const orb of state.orbs) {
      const nextAt = statusTimers.get(-orb.id - 1) ?? 0;
      if (elapsed.seconds < nextAt) {
        continue;
      }
      statusTimers.set(-orb.id - 1, elapsed.seconds + 0.4);
      const x = simXToWorldX(orb.x);
      const z = laneToWorldZ(orb.lane);
      options.particles.burst('essence_orb', x, ORB_HEIGHT, z);
      options.particles.sparkle(x, ORB_HEIGHT - 0.1, z, 0x3bf0c8, 2);
    }
  }

  /** Resolves the queued attack events: Ogre and boss smashes get their AOE rings. */
  function updateAttacks(state: Readonly<SimState>): void {
    for (const sourceId of attackSources) {
      const enemy = state.enemies.find((unit) => unit.id === sourceId);
      if (enemy === undefined) {
        continue;
      }
      const definition = enemyById[enemy.enemyId];
      const x = simXToWorldX(enemy.x);
      const z = laneToWorldZ(enemy.lane);
      if (definition?.isBoss === true) {
        spawnSmashImpact(x, z, AOE_COLORS.violet, BOSS_SMASH_RADIUS);
      } else if (enemy.enemyId === 'gloom_ogre') {
        spawnSmashImpact(x, z, AOE_COLORS.gold, OGRE_SMASH_RADIUS);
      }
    }
    attackSources.length = 0;
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
            spawnTrapFire(event.lane);
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
        spawnHit(state, request);
      }
      hits.length = 0;

      for (const request of statuses) {
        if (request.status === 'stun' || request.status === 'wet') {
          continue;
        }
        const position = unitPosition(state, request.targetId);
        if (position === null) {
          continue;
        }
        options.particles.burst(
          STATUS_IDS[request.status],
          position.x,
          position.y - 0.2,
          position.z,
        );
        options.particles.sparkle(
          position.x,
          position.y - 0.25,
          position.z,
          STATUS_SPARKLE_COLORS[request.status],
          2,
        );
      }
      statuses.length = 0;

      for (const request of combos) {
        spawnCombo(request, state);
      }
      combos.length = 0;

      updateAttacks(state);
      updateTrapDust(state);
      updateContinuousEffects(state);

      damageNumbers.update(deltaSeconds);
      popups.update(deltaSeconds);
      healthBars.update(state, camera);
      statusMeshes.update(state);
      targetRings.update(state);
      aoeRings.update(deltaSeconds, camera);
      impactFlash.update(deltaSeconds);
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
      targetRings.dispose();
      aoeRings.dispose();
      impactFlash.dispose();
      chainArcs.dispose();
      trapLogs.dispose();
      orbGlow.dispose();
      object.clear();
    },
  };
}
