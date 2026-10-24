import type { DefenderDef } from '../../data';
import { ticksFromSeconds } from '../time';
import type { DefenderState, FirePatchSpec } from '../types';

/** Numeric parameters of one ★3 bonus, keyed by the names the handler reads (spec 5.2). */
export type Star3Params = Readonly<Record<string, number>>;

/** The bolt burst of the Sparkbolt Gremlin ★3 bonus (spec 5.2: 2 bolts, 0.15 s apart). */
export interface Star3BoltBurst {
  /** Bolts per attack, at least 2. */
  boltCount: number;
  /** Ticks between two bolts of one attack. */
  gapTicks: number;
}

/**
 * One ★3 bonus handler (spec 3.6, 5.2). A behaviour asks for the values it needs
 * through the `star3…` accessors below; the handler that applies is chosen by
 * `DefenderDef.star3Bonus` and reads its numbers from `DefenderDef.star3Params`,
 * so a ★3 bonus is pure data (no defender ids in the sim).
 */
interface Star3BonusHandler {
  /** Producer: Essence value of one orb (Glowshroom Monk). */
  readonly producerOrbEssence?: (params: Star3Params, baseEssence: number) => number;
  /** Straight: bolts per attack and the gap between them (Sparkbolt Gremlin). */
  readonly boltBurst?: (params: Star3Params) => Star3BoltBurst | null;
  /** Wall: ratio of the melee damage taken that is reflected (Iron Granny). */
  readonly reflectMeleeRatio?: (params: Star3Params) => number;
  /** Splash: impact radius in tiles (Boomcap Brewer). */
  readonly splashRadius?: (params: Star3Params, baseRadius: number | null) => number | null;
  /** statusOnHit: duration in seconds (Snowpup Yeti). */
  readonly statusDurationS?: (params: Star3Params, baseDurationS: number) => number;
  /** Straight: extra enemies the projectile passes through (Rune Archer). */
  readonly extraHits?: (params: Star3Params) => number;
  /** Lob: Burn patch left at the impact point (Pyro Fox). */
  readonly firePatch?: (params: Star3Params) => FirePatchSpec | null;
  /** Beam and other ranged patterns: range in tiles (Frost Witch). */
  readonly range?: (params: Star3Params, baseRange: number | undefined) => number | undefined;
}

/** Reads a strictly positive parameter; a missing or invalid value falls back to the base data. */
function positiveParam(params: Star3Params, key: string): number | undefined {
  const value = params[key];
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Reads a non-negative parameter; a missing or invalid value falls back to the base data. */
function nonNegativeParam(params: Star3Params, key: string): number | undefined {
  const value = params[key];
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * The implemented ★3 bonuses, keyed by the `star3Bonus` ids of spec 5.2 (M1 and
 * the M2 defenders whose data lands in #46). An unknown id simply gets no bonus.
 */
const handlers: Readonly<Record<string, Star3BonusHandler>> = {
  producer_orb_value_up: {
    producerOrbEssence: (params, baseEssence) => positiveParam(params, 'orbEssence') ?? baseEssence,
  },
  double_bolt: {
    boltBurst: (params) => {
      const boltCount = positiveParam(params, 'boltCount');
      const gapSeconds = positiveParam(params, 'boltGapSeconds');
      if (boltCount === undefined || gapSeconds === undefined) {
        return null;
      }
      return { boltCount: Math.round(boltCount), gapTicks: ticksFromSeconds(gapSeconds) };
    },
  },
  reflect_melee: {
    reflectMeleeRatio: (params) => positiveParam(params, 'reflectRatio') ?? 0,
  },
  splash_radius_up: {
    splashRadius: (params, baseRadius) => positiveParam(params, 'splashRadius') ?? baseRadius,
  },
  slow_duration_up: {
    statusDurationS: (params, baseDurationS) =>
      positiveParam(params, 'slowDurationS') ?? baseDurationS,
  },
  piercing_arrow: {
    extraHits: (params) => Math.round(nonNegativeParam(params, 'extraHits') ?? 0),
  },
  fire_patch: {
    firePatch: (params) => {
      const radiusTiles = positiveParam(params, 'firePatchRadiusTiles');
      const durationS = positiveParam(params, 'firePatchDurationS');
      if (radiusTiles === undefined || durationS === undefined) {
        return null;
      }
      return { radiusTiles, durationTicks: ticksFromSeconds(durationS) };
    },
  },
  range_up: {
    range: (params, baseRange) => positiveParam(params, 'range') ?? baseRange,
  },
};

/** The handler of a defender's ★3 bonus; null below ★3 and for unimplemented bonus ids (spec 3.6, 5.2). */
function star3HandlerOf(
  defender: DefenderState,
  defenderDef: DefenderDef,
): Star3BonusHandler | null {
  if (defender.stars !== 3) {
    return null;
  }
  return handlers[defenderDef.star3Bonus] ?? null;
}

/** The `star3Params` of a definition; an absent record means "use the base values". */
function paramsOf(defenderDef: DefenderDef): Star3Params {
  return defenderDef.star3Params ?? {};
}

/** ★3 producer_orb_value_up: Essence value of one orb (spec 5.2). */
export function star3OrbEssence(
  defender: DefenderState,
  defenderDef: DefenderDef,
): number | undefined {
  const baseEssence = defenderDef.orbEssence;
  if (baseEssence === undefined) {
    return undefined;
  }
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.producerOrbEssence?.(paramsOf(defenderDef), baseEssence) ?? baseEssence;
}

/** ★3 double_bolt: the bolt burst of one attack, or null (spec 5.2). */
export function star3BoltBurst(
  defender: DefenderState,
  defenderDef: DefenderDef,
): Star3BoltBurst | null {
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.boltBurst?.(paramsOf(defenderDef)) ?? null;
}

/** ★3 reflect_melee: ratio of the melee damage taken that is reflected; 0 when absent (spec 5.2). */
export function star3MeleeReflectRatio(defender: DefenderState, defenderDef: DefenderDef): number {
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.reflectMeleeRatio?.(paramsOf(defenderDef)) ?? 0;
}

/** ★3 splash_radius_up: effective splash radius in tiles (spec 5.2). */
export function star3SplashRadius(
  defender: DefenderState,
  defenderDef: DefenderDef,
): number | null {
  const baseRadius = defenderDef.splashRadius ?? null;
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.splashRadius?.(paramsOf(defenderDef), baseRadius) ?? baseRadius;
}

/** ★3 slow_duration_up: duration in seconds of the `statusOnHit` of one attack (spec 5.2). */
export function star3StatusDurationS(
  defender: DefenderState,
  defenderDef: DefenderDef,
  baseDurationS: number,
): number {
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.statusDurationS?.(paramsOf(defenderDef), baseDurationS) ?? baseDurationS;
}

/** ★3 piercing_arrow: extra enemies a straight projectile passes through; 0 when absent (spec 5.2). */
export function star3ExtraHits(defender: DefenderState, defenderDef: DefenderDef): number {
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.extraHits?.(paramsOf(defenderDef)) ?? 0;
}

/** ★3 fire_patch: the Burn patch left at a lob impact point, or null (spec 5.2). */
export function star3FirePatch(
  defender: DefenderState,
  defenderDef: DefenderDef,
): FirePatchSpec | null {
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.firePatch?.(paramsOf(defenderDef)) ?? null;
}

/** ★3 range_up: effective range in tiles; undefined keeps "whole lane ahead" (spec 5.2). */
export function star3RangeTiles(
  defender: DefenderState,
  defenderDef: DefenderDef,
): number | undefined {
  const handler = star3HandlerOf(defender, defenderDef);
  return handler?.range?.(paramsOf(defenderDef), defenderDef.range) ?? defenderDef.range;
}
