/**
 * Debug-only helper for the spec 9.6 animation screenshots: `?debuganim=<kind>:<progress>`
 * freezes every procedural animation of one kind at a fixed 0..1 progress so a Playwright
 * still shows an exact moment (falling spawn, mid-merge, shrinking death). It only affects
 * the code animations, never the simulation or the Blender clip playback, and is ignored
 * when malformed (like the other additive debug URL helpers of issue #66).
 */

/** The procedural animations a screenshot can freeze (spec 9.6). */
export type ProceduralAnimationKind = 'spawn' | 'hit' | 'death' | 'merge';

/** A frozen animation moment: which animation and its 0..1 progress. */
export interface DebugAnimationHold {
  readonly kind: ProceduralAnimationKind;
  readonly progress: number;
}

const HOLDABLE_KINDS: ReadonlySet<string> = new Set(['spawn', 'hit', 'death', 'merge']);

/** Parses `?debuganim=spawn:0.6`; returns null when the value is missing or malformed. */
export function readDebugAnimationHold(search: string): DebugAnimationHold | null {
  const raw = new URLSearchParams(search).get('debuganim');
  if (raw === null) {
    return null;
  }
  const separator = raw.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const kind = raw.slice(0, separator);
  const progress = Number(raw.slice(separator + 1));
  if (!HOLDABLE_KINDS.has(kind) || !Number.isFinite(progress) || progress < 0 || progress > 1) {
    return null;
  }
  return { kind: kind as ProceduralAnimationKind, progress };
}
