/**
 * The World 1 soundtrack (issue #114 §5): menu theme, World 1 calm loop, the
 * big-wave intensity layer that plays on top of it, and the victory/defeat stings.
 *
 * Musical brief: fast driving 16-bit chiptune-orchestral hybrid, 130-150 BPM,
 * heroic and adventurous. Everything is written in A minor on the i-VI-III-VII
 * progression (Am-F-C-G) with a iv-VI-i-V bridge (Dm-F-Am-E); the menu and battle
 * themes share the same motif family so the soundtrack feels like one score.
 *
 * Every loop is 32 whole bars at 144 BPM. At 48 kHz that is exactly 5000 samples
 * per 16th and 2,560,000 samples per loop, so the arrangement is sample-accurate
 * with no rounding drift. The render length is the loop plus a 3 s tail; the tail
 * is folded back onto the start (`foldTail`) so the loop is the steady state of
 * one bar grid period and loops with no click and no reverb cut (see dsp.ts).
 */
import {
  SAMPLE_RATE,
  addMono,
  applyLowpass,
  applyReverb,
  applySidechain,
  fadeOut,
  foldTail,
  mixStereoInto,
  normalizePeak,
  pingPongDelay,
  secondsToSamples,
  softClip,
  stereoBuffer,
  type StereoBuffer,
} from './dsp';
import {
  arpVoice,
  bassVoice,
  boomVoice,
  clapVoice,
  crashVoice,
  hatVoice,
  kickVoice,
  leadDoubleVoice,
  leadVoice,
  padVoice,
  riserVoice,
  shakerVoice,
  snareVoice,
  stabVoice,
  tomVoice,
} from './instruments';
import { chordRoot, chordTones, isChord, note } from './theory';

/** Tempo of the whole soundtrack; 144 BPM keeps every step on a whole sample. */
export const MUSIC_BPM = 144;
/** Length of every loop in bars; four 8-bar sections. */
export const LOOP_BARS = 32;
/** Length of the victory/defeat stings (spec 9.9). */
export const STING_SECONDS = 3;
/** Loop steps per bar (16th notes). */
const STEPS_PER_BAR = 16;
/** Seconds per 16th note; 144 BPM gives exactly 5,000 samples at 48 kHz. */
export const STEP_SECONDS = 60 / MUSIC_BPM / 4;
/** Samples per 16th note. */
export const STEP_SAMPLES = Math.round(STEP_SECONDS * SAMPLE_RATE);
/** Seconds of rendered tail that is folded back onto the loop start. */
const TAIL_SECONDS = 3;

/** One melodic event on the 16th grid, relative to its section start. */
interface StepNote {
  readonly step: number;
  readonly midi: number;
  readonly length: number;
  readonly velocity?: number;
}

/** Compact melody literal: `n(4, 'C5', 2)` is step 4, C5, two 16ths long. */
function n(step: number, name: string, length: number, velocity = 0.88): StepNote {
  return { step, midi: note(name), length, velocity };
}

/** How a section's drums are driven. */
type DrumStyle =
  | 'none'
  | 'groove'
  | 'drive'
  | 'big'
  | 'breakdown'
  | 'build'
  | 'layerLight'
  | 'layerHeavy'
  | 'layerBuild';

/** Bass figure of a section. */
type BassStyle = 'none' | 'eighths' | 'driving' | 'sixteenths' | 'halves' | 'octaveEighths';

/** Arpeggio density of a section. */
type ArpStyle = 'none' | 'eighths' | 'sixteenths' | 'sixteenthsHigh';

/** Chord-stab rhythm of a section. */
type StabStyle = 'none' | 'offbeat' | 'syncopated' | 'chords';

/** Arrangement recipe of one section: 8 bars of one progression and one groove. */
interface SectionStyle {
  readonly drums: DrumStyle;
  readonly bass: BassStyle;
  readonly arp: ArpStyle;
  readonly pad: boolean;
  readonly stabs: StabStyle;
}

/** One 8-bar phrase of a track. */
interface Section {
  readonly bars: number;
  readonly chords: readonly string[];
  readonly style: SectionStyle;
  readonly lead: readonly StepNote[];
  readonly doubleLead: boolean;
}

/** Complete rendered arrangement of one looping track. */
export interface TrackSpec {
  readonly sections: readonly Section[];
  readonly targetPeakDb: number;
  readonly reverb: number;
}

/** Drum voice ids used by the pattern language. */
type DrumVoice =
  'kick' | 'snare' | 'clap' | 'hat' | 'openHat' | 'shaker' | 'tomLow' | 'tomHigh' | 'crash';

/** One drum hit on the 16th grid of a bar. */
interface DrumEvent {
  readonly step: number;
  readonly voice: DrumVoice;
  readonly velocity: number;
}

/* ------------------------------------------------------------------ */
/* Melodies: four 8-bar phrases per track, written on the 16th grid.   */
/* ------------------------------------------------------------------ */

/** Menu main theme, A phrase: the hero motif over Am-F-C-G, twice varied. */
const MENU_A: readonly StepNote[] = [
  n(0, 'A4', 4),
  n(4, 'C5', 4),
  n(8, 'E5', 4),
  n(12, 'D5', 2),
  n(14, 'C5', 2),
  n(16, 'F5', 4),
  n(20, 'E5', 2),
  n(22, 'D5', 2),
  n(24, 'C5', 8),
  n(32, 'E5', 4),
  n(36, 'G5', 4),
  n(40, 'A5', 6),
  n(46, 'G5', 2),
  n(48, 'F5', 4),
  n(52, 'E5', 4),
  n(56, 'D5', 4),
  n(60, 'B4', 4),
  n(64, 'A4', 4),
  n(68, 'C5', 4),
  n(72, 'E5', 6),
  n(78, 'D5', 2),
  n(80, 'F5', 4),
  n(84, 'A5', 4),
  n(88, 'G5', 4),
  n(92, 'E5', 4),
  n(96, 'G5', 4),
  n(100, 'E5', 4),
  n(104, 'C5', 4),
  n(108, 'D5', 4),
  n(112, 'E5', 4),
  n(116, 'D5', 4),
  n(120, 'B4', 6),
];

/** Menu theme, B phrase: the climbing answer over F-G-Am-Am-F-G-C-E. */
const MENU_B: readonly StepNote[] = [
  n(0, 'C5', 4),
  n(4, 'D5', 2),
  n(6, 'C5', 2),
  n(8, 'A4', 4),
  n(12, 'F5', 4),
  n(16, 'D5', 4),
  n(20, 'E5', 4),
  n(24, 'G5', 6),
  n(30, 'F5', 2),
  n(32, 'E5', 4),
  n(36, 'A5', 6),
  n(42, 'G5', 2),
  n(44, 'E5', 4),
  n(48, 'A5', 4),
  n(52, 'C6', 4),
  n(56, 'B5', 6),
  n(62, 'A5', 2),
  n(64, 'A5', 4),
  n(68, 'G5', 2),
  n(70, 'F5', 2),
  n(72, 'E5', 4),
  n(76, 'C5', 4),
  n(80, 'D5', 4),
  n(84, 'G5', 4),
  n(88, 'B5', 6),
  n(94, 'A5', 2),
  n(96, 'G5', 4),
  n(100, 'E5', 4),
  n(104, 'C6', 6),
  n(110, 'B5', 2),
  n(112, 'G#5', 4),
  n(116, 'B5', 4),
  n(120, 'E6', 8),
];

/** Menu theme, C phrase: the bridge over Dm-F-Am-E-Dm-F-C-E that lifts back home. */
const MENU_C: readonly StepNote[] = [
  n(0, 'D5', 4),
  n(4, 'F5', 2),
  n(6, 'E5', 2),
  n(8, 'D5', 4),
  n(12, 'A4', 4),
  n(16, 'C5', 4),
  n(20, 'D5', 4),
  n(24, 'F5', 6),
  n(30, 'E5', 2),
  n(32, 'E5', 4),
  n(36, 'A5', 4),
  n(40, 'C5', 4),
  n(44, 'B4', 4),
  n(48, 'B4', 4),
  n(52, 'G#4', 4),
  n(56, 'E5', 6),
  n(62, 'B4', 2),
  n(64, 'F5', 4),
  n(68, 'A5', 4),
  n(72, 'D5', 4),
  n(76, 'E5', 4),
  n(80, 'C5', 4),
  n(84, 'E5', 4),
  n(88, 'G5', 6),
  n(94, 'F5', 2),
  n(96, 'E5', 4),
  n(100, 'G5', 4),
  n(104, 'C6', 6),
  n(110, 'B5', 2),
  n(112, 'G#5', 4),
  n(116, 'E5', 4),
  n(120, 'B4', 6),
];

/** World 1 calm theme, A phrase: same motif family, a third higher and bouncier. */
const CALM_A: readonly StepNote[] = [
  n(0, 'C5', 4),
  n(4, 'E5', 4),
  n(8, 'A5', 4),
  n(12, 'G5', 2),
  n(14, 'E5', 2),
  n(16, 'A5', 4),
  n(20, 'G5', 2),
  n(22, 'F5', 2),
  n(24, 'E5', 8),
  n(32, 'G5', 4),
  n(36, 'E5', 4),
  n(40, 'C5', 6),
  n(46, 'D5', 2),
  n(48, 'E5', 4),
  n(52, 'D5', 4),
  n(56, 'B4', 6),
  n(62, 'D5', 2),
  n(64, 'A4', 4),
  n(68, 'C5', 4),
  n(72, 'E5', 4),
  n(76, 'A5', 4),
  n(80, 'G5', 4),
  n(84, 'F5', 4),
  n(88, 'E5', 4),
  n(92, 'C5', 4),
  n(96, 'D5', 4),
  n(100, 'E5', 4),
  n(104, 'G5', 6),
  n(110, 'E5', 2),
  n(112, 'D5', 4),
  n(116, 'B4', 4),
  n(120, 'G4', 6),
];

/** World 1 calm theme, B phrase: the battle answer over F-G-Am-Am-F-G-C-E. */
const CALM_B: readonly StepNote[] = [
  n(0, 'F5', 4),
  n(4, 'E5', 2),
  n(6, 'D5', 2),
  n(8, 'C5', 4),
  n(12, 'A4', 4),
  n(16, 'B4', 4),
  n(20, 'D5', 4),
  n(24, 'G5', 6),
  n(30, 'F5', 2),
  n(32, 'E5', 4),
  n(36, 'C5', 4),
  n(40, 'A4', 6),
  n(46, 'C5', 2),
  n(48, 'A5', 6),
  n(54, 'G5', 2),
  n(56, 'E5', 4),
  n(60, 'C5', 4),
  n(64, 'A5', 4),
  n(68, 'G5', 4),
  n(72, 'F5', 4),
  n(76, 'E5', 4),
  n(80, 'D5', 4),
  n(84, 'E5', 4),
  n(88, 'G5', 6),
  n(94, 'B5', 2),
  n(96, 'C5', 4),
  n(100, 'E5', 4),
  n(104, 'G5', 4),
  n(108, 'A5', 4),
  n(112, 'G#5', 4),
  n(116, 'B5', 4),
  n(120, 'E6', 6),
];

/** World 1 calm theme, C phrase: the rising battle bridge over Dm-F-Am-E. */
const CALM_C: readonly StepNote[] = [
  n(0, 'D5', 6),
  n(6, 'E5', 2),
  n(8, 'F5', 4),
  n(12, 'A5', 4),
  n(16, 'G5', 4),
  n(20, 'F5', 4),
  n(24, 'E5', 6),
  n(30, 'D5', 2),
  n(32, 'C5', 4),
  n(36, 'E5', 4),
  n(40, 'A4', 6),
  n(46, 'B4', 2),
  n(48, 'B4', 4),
  n(52, 'E5', 4),
  n(56, 'G#5', 6),
  n(62, 'B5', 2),
  n(64, 'A5', 4),
  n(68, 'G5', 4),
  n(72, 'F5', 4),
  n(76, 'E5', 4),
  n(80, 'D5', 4),
  n(84, 'E5', 4),
  n(88, 'F5', 4),
  n(92, 'G5', 4),
  n(96, 'E5', 4),
  n(100, 'G5', 4),
  n(104, 'C6', 4),
  n(108, 'B5', 4),
  n(112, 'B5', 4),
  n(116, 'G#5', 4),
  n(120, 'E5', 6),
];

/* ------------------------------------------------------------------ */
/* Arrangements: four 8-bar sections per loop.                        */
/* ------------------------------------------------------------------ */

/** Chord progression i-VI-III-VII (Am-F-C-G), played twice per phrase. */
const HOME_CHORDS: readonly string[] = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'];
/** Chord progression VI-VII-i-i / VI-VII-III-V, the heroic lift of the B phrase. */
const LIFT_CHORDS: readonly string[] = ['F', 'G', 'Am', 'Am', 'F', 'G', 'C', 'E'];
/** Chord progression iv-VI-i-V / iv-VI-III-V, the bridge that sets up the loop. */
const BRIDGE_CHORDS: readonly string[] = ['Dm', 'F', 'Am', 'E', 'Dm', 'F', 'C', 'E'];

/** Groove of the menu: stately but driving, bright arpeggios and a wide pad. */
const MENU_SECTIONS: readonly Section[] = [
  {
    bars: 8,
    chords: HOME_CHORDS,
    style: { drums: 'groove', bass: 'eighths', arp: 'eighths', pad: true, stabs: 'offbeat' },
    lead: MENU_A,
    doubleLead: false,
  },
  {
    bars: 8,
    chords: LIFT_CHORDS,
    style: { drums: 'drive', bass: 'driving', arp: 'sixteenths', pad: false, stabs: 'syncopated' },
    lead: MENU_B,
    doubleLead: true,
  },
  {
    bars: 8,
    chords: HOME_CHORDS,
    style: { drums: 'big', bass: 'driving', arp: 'eighths', pad: true, stabs: 'chords' },
    lead: MENU_A,
    doubleLead: true,
  },
  {
    bars: 8,
    chords: BRIDGE_CHORDS,
    style: { drums: 'build', bass: 'halves', arp: 'sixteenthsHigh', pad: true, stabs: 'none' },
    lead: MENU_C,
    doubleLead: false,
  },
];

/** Groove of the World 1 level: battle-ready from the first bar. */
const CALM_SECTIONS: readonly Section[] = [
  {
    bars: 8,
    chords: HOME_CHORDS,
    style: { drums: 'drive', bass: 'driving', arp: 'sixteenths', pad: true, stabs: 'offbeat' },
    lead: CALM_A,
    doubleLead: false,
  },
  {
    bars: 8,
    chords: LIFT_CHORDS,
    style: {
      drums: 'big',
      bass: 'driving',
      arp: 'sixteenthsHigh',
      pad: false,
      stabs: 'syncopated',
    },
    lead: CALM_B,
    doubleLead: true,
  },
  {
    bars: 8,
    chords: HOME_CHORDS,
    style: { drums: 'big', bass: 'driving', arp: 'sixteenths', pad: true, stabs: 'chords' },
    lead: CALM_A,
    doubleLead: true,
  },
  {
    bars: 8,
    chords: BRIDGE_CHORDS,
    style: { drums: 'build', bass: 'halves', arp: 'sixteenthsHigh', pad: true, stabs: 'none' },
    lead: CALM_C,
    doubleLead: false,
  },
];

/**
 * The big-wave layer: no lead melody (it plays on top of the calm loop) but a
 * complete percussion, octave-bass and arpeggio arrangement in the same key,
 * tempo and bar grid, so the two tracks stay locked when crossfaded in.
 */
const BIG_WAVE_SECTIONS: readonly Section[] = [
  {
    bars: 8,
    chords: HOME_CHORDS,
    style: {
      drums: 'layerLight',
      bass: 'octaveEighths',
      arp: 'eighths',
      pad: false,
      stabs: 'chords',
    },
    lead: [],
    doubleLead: false,
  },
  {
    bars: 8,
    chords: LIFT_CHORDS,
    style: {
      drums: 'layerHeavy',
      bass: 'sixteenths',
      arp: 'sixteenthsHigh',
      pad: false,
      stabs: 'syncopated',
    },
    lead: [],
    doubleLead: false,
  },
  {
    bars: 8,
    chords: HOME_CHORDS,
    style: {
      drums: 'layerHeavy',
      bass: 'octaveEighths',
      arp: 'sixteenthsHigh',
      pad: false,
      stabs: 'chords',
    },
    lead: [],
    doubleLead: false,
  },
  {
    bars: 8,
    chords: BRIDGE_CHORDS,
    style: {
      drums: 'layerBuild',
      bass: 'driving',
      arp: 'sixteenthsHigh',
      pad: false,
      stabs: 'syncopated',
    },
    lead: [],
    doubleLead: false,
  },
];

/** The render plans: menu and calm are full mixes, the big wave is a quieter layer. */
const TRACKS: Readonly<Record<'menu' | 'world1_calm' | 'world1_big_wave', TrackSpec>> = {
  menu: { sections: MENU_SECTIONS, targetPeakDb: -2.5, reverb: 0.16 },
  world1_calm: { sections: CALM_SECTIONS, targetPeakDb: -2.5, reverb: 0.14 },
  world1_big_wave: { sections: BIG_WAVE_SECTIONS, targetPeakDb: -7, reverb: 0.08 },
};

/** True when a chord symbol is one this soundtrack can play. */
function assertValidTrack(key: string, spec: TrackSpec): void {
  const bars = spec.sections.reduce((sum, section) => sum + section.bars, 0);
  if (bars !== LOOP_BARS) {
    throw new Error(`${key}: loop must be ${LOOP_BARS} bars, got ${bars}`);
  }
  for (const section of spec.sections) {
    if (section.chords.length !== section.bars) {
      throw new Error(
        `${key}: section has ${section.bars} bars but ${section.chords.length} chords`,
      );
    }
    for (const chord of section.chords) {
      if (!isChord(chord)) {
        throw new Error(`${key}: unknown chord ${chord}`);
      }
    }
    for (const melodyNote of section.lead) {
      if (melodyNote.step < 0 || melodyNote.step >= section.bars * STEPS_PER_BAR) {
        throw new Error(`${key}: lead step ${melodyNote.step} outside its section`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Accompaniment patterns.                                            */
/* ------------------------------------------------------------------ */

/** Snare roll / tom fill over the last steps of a phrase. */
function addFill(events: DrumEvent[], fromStep: number, bar: number): void {
  for (let step = fromStep; step < STEPS_PER_BAR; step += 1) {
    const progress = (step - fromStep) / Math.max(1, STEPS_PER_BAR - fromStep);
    events.push({ step, voice: 'snare', velocity: 0.35 + 0.5 * progress });
  }
  events.push({ step: 14, voice: 'tomHigh', velocity: 0.7 });
  events.push({ step: 15, voice: 'tomLow', velocity: 0.8 });
  if (bar % 2 === 0) {
    events.push({ step: fromStep, voice: 'crash', velocity: 0.45 });
  }
}

/** Every-eight hatt pattern; `sixteenths` switches to the 16th-note drive. */
function addHats(events: DrumEvent[], sixteenths: boolean): void {
  for (let step = 0; step < STEPS_PER_BAR; step += sixteenths ? 1 : 2) {
    const accent = step % 4 === 0 ? 0.85 : step % 2 === 0 ? 0.55 : 0.32;
    events.push({ step, voice: 'hat', velocity: accent });
  }
}

/** 16-bit level groove: walking kick, snare backbeat, offbeat stabs. */
function patternGroove(bar: number, lastBar: boolean): DrumEvent[] {
  const events: DrumEvent[] = [
    { step: 0, voice: 'kick', velocity: 1 },
    { step: 6, voice: 'kick', velocity: 0.62 },
    { step: 8, voice: 'kick', velocity: 0.9 },
    { step: 4, voice: 'snare', velocity: 0.9 },
    { step: 12, voice: 'snare', velocity: 0.92 },
    { step: 14, voice: 'openHat', velocity: 0.7 },
  ];
  addHats(events, false);
  if (bar % 2 === 1) {
    events.push({ step: 15, voice: 'hat', velocity: 0.45 });
  }
  if (lastBar || bar % 4 === 3) {
    addFill(events, 12, bar);
  }
  return events;
}

/** Running battle groove: syncopated kick and full 16th hats. */
function patternDrive(bar: number, lastBar: boolean): DrumEvent[] {
  const events: DrumEvent[] = [
    { step: 0, voice: 'kick', velocity: 1 },
    { step: 3, voice: 'kick', velocity: 0.72 },
    { step: 8, voice: 'kick', velocity: 0.95 },
    { step: 11, voice: 'kick', velocity: 0.8 },
    { step: 4, voice: 'snare', velocity: 0.92 },
    { step: 12, voice: 'snare', velocity: 0.95 },
    { step: 6, voice: 'openHat', velocity: 0.62 },
    { step: 14, voice: 'openHat', velocity: 0.72 },
  ];
  addHats(events, true);
  if (bar % 2 === 1) {
    events.push({ step: 15, voice: 'kick', velocity: 0.5 });
  }
  if (lastBar || bar % 4 === 3) {
    addFill(events, 12, bar);
  }
  return events;
}

/** Biggest backline groove: four-on-the-floor with claps and tom accents. */
function patternBig(bar: number, lastBar: boolean): DrumEvent[] {
  const events: DrumEvent[] = [
    { step: 0, voice: 'kick', velocity: 1 },
    { step: 4, voice: 'kick', velocity: 0.9 },
    { step: 8, voice: 'kick', velocity: 0.95 },
    { step: 12, voice: 'kick', velocity: 0.9 },
    { step: 4, voice: 'snare', velocity: 1 },
    { step: 12, voice: 'snare', velocity: 1 },
    { step: 4, voice: 'clap', velocity: 0.7 },
    { step: 12, voice: 'clap', velocity: 0.7 },
    { step: 14, voice: 'openHat', velocity: 0.8 },
  ];
  addHats(events, true);
  if (bar % 2 === 1) {
    events.push({ step: 15, voice: 'tomLow', velocity: 0.55 });
  }
  if (lastBar || bar % 4 === 3) {
    addFill(events, 12, bar);
  }
  return events;
}

/** Breakdown: sparse kick and shaker first, snare roll into the next section. */
function patternBreakdown(bar: number, lastBar: boolean): DrumEvent[] {
  const events: DrumEvent[] = [
    { step: 0, voice: 'kick', velocity: 0.9 },
    { step: 8, voice: 'kick', velocity: 0.8 },
    { step: 14, voice: 'openHat', velocity: 0.5 },
  ];
  for (let step = 0; step < STEPS_PER_BAR; step += 2) {
    events.push({ step, voice: 'shaker', velocity: step % 4 === 0 ? 0.5 : 0.32 });
  }
  if (lastBar) {
    addFill(events, 8, bar);
  }
  return events;
}

/** Build-up: half groove for four bars, then the full drive for the last four. */
function patternBuild(bar: number, lastBar: boolean): DrumEvent[] {
  if (bar < 4) {
    const events = patternBreakdown(bar, false);
    events.push({ step: 4, voice: 'hat', velocity: 0.7 });
    events.push({ step: 12, voice: 'hat', velocity: 0.7 });
    return events;
  }
  const events = patternDrive(bar, lastBar);
  events.push({ step: 0, voice: 'crash', velocity: 0.55 });
  return events;
}

/** Big-wave layer, light half: extra percussion bed over the calm groove. */
function patternLayerLight(bar: number, lastBar: boolean): DrumEvent[] {
  const events: DrumEvent[] = [
    { step: 0, voice: 'kick', velocity: 0.85 },
    { step: 8, voice: 'kick', velocity: 0.8 },
    { step: 6, voice: 'tomHigh', velocity: 0.5 },
    { step: 14, voice: 'tomLow', velocity: 0.55 },
    { step: 14, voice: 'openHat', velocity: 0.7 },
  ];
  for (let step = 0; step < STEPS_PER_BAR; step += 2) {
    events.push({ step, voice: 'shaker', velocity: step % 4 === 0 ? 0.62 : 0.42 });
  }
  addHats(events, false);
  if (lastBar) {
    addFill(events, 12, bar);
  }
  return events;
}

/** Big-wave layer, heavy half: double kick, claps and 16th shaker drive. */
function patternLayerHeavy(bar: number, lastBar: boolean): DrumEvent[] {
  const events: DrumEvent[] = [
    { step: 0, voice: 'kick', velocity: 1 },
    { step: 3, voice: 'kick', velocity: 0.8 },
    { step: 8, voice: 'kick', velocity: 0.95 },
    { step: 11, voice: 'kick', velocity: 0.85 },
    { step: 4, voice: 'snare', velocity: 0.95 },
    { step: 12, voice: 'snare', velocity: 1 },
    { step: 12, voice: 'clap', velocity: 0.75 },
    { step: 6, voice: 'openHat', velocity: 0.7 },
    { step: 14, voice: 'openHat', velocity: 0.8 },
  ];
  addHats(events, true);
  for (let step = 0; step < STEPS_PER_BAR; step += 2) {
    events.push({ step, voice: 'shaker', velocity: 0.42 });
  }
  if (lastBar || bar % 4 === 3) {
    addFill(events, 12, bar);
  }
  return events;
}

/** Big-wave build: layered rolls that peak at the section end. */
function patternLayerBuild(bar: number, lastBar: boolean): DrumEvent[] {
  const events = bar < 4 ? patternLayerLight(bar, false) : patternLayerHeavy(bar, lastBar);
  events.push({ step: 0, voice: 'crash', velocity: bar < 4 ? 0.45 : 0.6 });
  if (bar >= 4) {
    events.push({ step: 10, voice: 'tomHigh', velocity: 0.5 });
    events.push({ step: 15, voice: 'tomLow', velocity: 0.6 });
  }
  return events;
}

/** Dispatches one bar of the requested drum style. */
function drumPattern(style: DrumStyle, bar: number, lastBar: boolean): DrumEvent[] {
  if (style === 'groove') {
    return patternGroove(bar, lastBar);
  }
  if (style === 'drive') {
    return patternDrive(bar, lastBar);
  }
  if (style === 'big') {
    return patternBig(bar, lastBar);
  }
  if (style === 'breakdown') {
    return patternBreakdown(bar, lastBar);
  }
  if (style === 'build') {
    return patternBuild(bar, lastBar);
  }
  if (style === 'layerLight') {
    return patternLayerLight(bar, lastBar);
  }
  if (style === 'layerHeavy') {
    return patternLayerHeavy(bar, lastBar);
  }
  if (style === 'layerBuild') {
    return patternLayerBuild(bar, lastBar);
  }
  return [];
}

/** Pan position of each drum voice in the stereo field. */
const DRUM_PAN: Readonly<Record<DrumVoice, number>> = {
  kick: 0,
  snare: 0.02,
  clap: 0.08,
  hat: 0.26,
  openHat: -0.2,
  shaker: -0.36,
  tomLow: -0.3,
  tomHigh: 0.34,
  crash: 0.16,
};

/** Mixing gain of each drum voice. */
const DRUM_GAIN: Readonly<Record<DrumVoice, number>> = {
  kick: 1.05,
  snare: 0.8,
  clap: 0.55,
  hat: 0.5,
  openHat: 0.42,
  shaker: 0.34,
  tomLow: 0.75,
  tomHigh: 0.7,
  crash: 0.62,
};

/** Renders one drum hit into a mono voice. */
function drumVoice(voice: DrumVoice, variation: number): Float32Array {
  if (voice === 'kick') {
    return kickVoice({ variation });
  }
  if (voice === 'snare') {
    return snareVoice({ variation });
  }
  if (voice === 'clap') {
    return clapVoice({ variation });
  }
  if (voice === 'hat') {
    return hatVoice(false, { variation });
  }
  if (voice === 'openHat') {
    return hatVoice(true, { variation });
  }
  if (voice === 'shaker') {
    return shakerVoice({ variation });
  }
  if (voice === 'tomLow') {
    return tomVoice(note('E3'), { variation });
  }
  if (voice === 'tomHigh') {
    return tomVoice(note('B3'), { variation });
  }
  return crashVoice({ variation });
}

/** Writes the drum pattern of one bar and records its kick times for sidechaining. */
function addDrumBar(
  drums: StereoBuffer,
  kicks: number[],
  style: DrumStyle,
  bar: number,
  lastBar: boolean,
  globalBar: number,
): void {
  const events = drumPattern(style, bar, lastBar);
  const crashesEverySection = style === 'drive' || style === 'big' || style === 'build';
  const layerCrash = style === 'layerHeavy' || style === 'layerBuild';
  if ((crashesEverySection || layerCrash) && globalBar % 8 === 0) {
    events.unshift({ step: 0, voice: 'crash', velocity: 0.75 });
  }
  for (const event of events) {
    const start = (globalBar * STEPS_PER_BAR + event.step) * STEP_SAMPLES;
    const variation = globalBar * STEPS_PER_BAR + event.step;
    const velocity = event.velocity;
    addMono(
      drums,
      drumVoice(event.voice, variation),
      start,
      DRUM_PAN[event.voice],
      DRUM_GAIN[event.voice] * velocity,
    );
    if (event.voice === 'kick') {
      kicks.push(start);
    }
  }
}

/** Chord stab rhythm of a section, expressed as [step, lengthInSteps, velocity]. */
function stabRhythm(style: StabStyle): readonly (readonly [number, number, number])[] {
  if (style === 'offbeat') {
    return [
      [2, 2, 0.75],
      [6, 2, 0.6],
      [10, 2, 0.72],
      [14, 2, 0.65],
    ];
  }
  if (style === 'syncopated') {
    return [
      [3, 1.5, 0.8],
      [6, 1.5, 0.62],
      [11, 1.5, 0.75],
      [14, 1.5, 0.7],
    ];
  }
  if (style === 'chords') {
    return [
      [0, 3, 0.9],
      [8, 3, 0.8],
    ];
  }
  return [];
}

/** Writes the chord stabs of one bar (heroic brass/string hits). */
function addStabBar(
  stabs: StereoBuffer,
  style: StabStyle,
  chord: string,
  startSample: number,
): void {
  const tones = chordTones(chord, 4).slice(0, 3);
  const pans = [0.3, -0.28, 0.05];
  for (const [step, length, velocity] of stabRhythm(style)) {
    const seconds = length * STEP_SECONDS + 0.06;
    for (let index = 0; index < tones.length; index += 1) {
      addMono(
        stabs,
        stabVoice(tones[index] ?? 60, seconds, velocity),
        startSample + step * STEP_SAMPLES,
        pans[index] ?? 0,
        0.8,
      );
    }
  }
}

/** Writes the bass figure of one bar. */
function addBassBar(
  bass: StereoBuffer,
  style: BassStyle,
  chord: string,
  startSample: number,
): void {
  if (style === 'none') {
    return;
  }
  const octave = style === 'octaveEighths' ? 3 : 2;
  const root = chordRoot(chord, octave);
  const figures: Readonly<Record<BassStyle, readonly (readonly [number, number, number])[]>> = {
    none: [],
    eighths: [
      [0, 0, 1],
      [2, 0, 0.7],
      [4, 0, 0.85],
      [6, 7, 0.6],
      [8, 0, 0.95],
      [10, 0, 0.7],
      [12, 7, 0.8],
      [14, 12, 0.6],
    ],
    driving: [
      [0, 0, 1],
      [3, 0, 0.62],
      [4, 7, 0.78],
      [6, 0, 0.66],
      [8, 0, 0.95],
      [11, 12, 0.66],
      [12, 7, 0.8],
      [14, 0, 0.6],
    ],
    sixteenths: Array.from({ length: 16 }, (_, step) => {
      const offset = step % 4 === 2 ? 12 : step % 4 === 0 ? 0 : 7;
      const velocity = step % 4 === 0 ? 0.9 : step % 2 === 0 ? 0.55 : 0.4;
      return [step, offset, velocity] as const;
    }),
    halves: [
      [0, 0, 1],
      [8, 0, 0.85],
    ],
    octaveEighths: [
      [0, 0, 0.95],
      [2, 12, 0.55],
      [4, 0, 0.8],
      [6, 12, 0.55],
      [8, 0, 0.9],
      [10, 12, 0.55],
      [12, 0, 0.8],
      [14, 12, 0.55],
    ],
  };
  for (const [step, offset, velocity] of figures[style]) {
    const seconds = (style === 'halves' ? 8 : 1.9) * STEP_SECONDS;
    addMono(
      bass,
      bassVoice(root + offset, seconds, velocity),
      startSample + step * STEP_SAMPLES,
      0,
      1,
    );
  }
}

/** Arpeggio note order used by the 16th patterns. */
const ARP_ORDER: readonly number[] = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];

/** Writes the arpeggio figure of one bar. */
function addArpBar(arp: StereoBuffer, style: ArpStyle, chord: string, startSample: number): void {
  if (style === 'none') {
    return;
  }
  const octave = style === 'sixteenthsHigh' ? 5 : 4;
  const tones = chordTones(chord, octave);
  const stepSize = style === 'eighths' ? 2 : 1;
  const seconds = stepSize * STEP_SECONDS * 0.92;
  for (let step = 0; step < STEPS_PER_BAR; step += stepSize) {
    const toneIndex = ARP_ORDER[step % ARP_ORDER.length] ?? 0;
    const midi = tones[toneIndex % tones.length] ?? 72;
    const pan = step % 4 === 0 ? -0.45 : 0.45;
    addMono(arp, arpVoice(midi, seconds, 0.9), startSample + step * STEP_SAMPLES, pan, 1);
  }
}

/** Writes the sustained string/saw pad of one bar. */
function addPadBar(pad: StereoBuffer, chord: string, startSample: number): void {
  const tones = chordTones(chord, 3);
  const pans = [-0.55, 0.55, -0.22, 0.22];
  const seconds = STEPS_PER_BAR * STEP_SECONDS + 0.42;
  for (let index = 0; index < tones.length; index += 1) {
    addMono(pad, padVoice(tones[index] ?? 57, seconds, 1), startSample, pans[index] ?? 0, 1);
  }
}

/** Writes one section's lead melody and optional octave double. */
function addLeadSection(lead: StereoBuffer, section: Section, sectionStartStep: number): void {
  for (const event of section.lead) {
    const start = (sectionStartStep + event.step) * STEP_SAMPLES;
    const seconds = event.length * STEP_SECONDS + 0.07;
    const velocity = event.velocity ?? 0.88;
    addMono(lead, leadVoice(event.midi, seconds, velocity), start, -0.05, 1);
    if (section.doubleLead) {
      addMono(lead, leadDoubleVoice(event.midi + 12, seconds, velocity), start, 0.14, 0.75);
    }
  }
}

/** Riser that leads into the loop downbeat at the end of a build section. */
function addBuildRiser(drums: StereoBuffer, section: Section, sectionStartStep: number): void {
  const riserSteps = 16;
  const start = (sectionStartStep + section.bars * STEPS_PER_BAR - riserSteps) * STEP_SAMPLES;
  addMono(drums, riserVoice(1.65, 4211 + sectionStartStep), start, 0, 0.45);
}

/** Renders all six buses of one track, section by section. */
interface Buses {
  readonly lead: StereoBuffer;
  readonly arp: StereoBuffer;
  readonly pad: StereoBuffer;
  readonly bass: StereoBuffer;
  readonly drums: StereoBuffer;
  readonly stabs: StereoBuffer;
  readonly kicks: number[];
}

/** Writes every bar of every section into the buses. */
function arrange(spec: TrackSpec, buses: Buses): void {
  let sectionStartStep = 0;
  for (const section of spec.sections) {
    for (let bar = 0; bar < section.bars; bar += 1) {
      const globalBar = sectionStartStep / STEPS_PER_BAR + bar;
      const chord = section.chords[bar] ?? 'Am';
      const startSample = (sectionStartStep + bar * STEPS_PER_BAR) * STEP_SAMPLES;
      const lastBar = bar === section.bars - 1;
      addDrumBar(buses.drums, buses.kicks, section.style.drums, bar, lastBar, globalBar);
      addBassBar(buses.bass, section.style.bass, chord, startSample);
      addArpBar(buses.arp, section.style.arp, chord, startSample);
      addStabBar(buses.stabs, section.style.stabs, chord, startSample);
      if (section.style.pad) {
        addPadBar(buses.pad, chord, startSample);
      }
    }
    addLeadSection(buses.lead, section, sectionStartStep);
    if (section.style.drums === 'build' || section.style.drums === 'layerBuild') {
      addBuildRiser(buses.drums, section, sectionStartStep);
    }
    sectionStartStep += section.bars * STEPS_PER_BAR;
  }
}

/** Applies delay, reverb and sidechain compression before the buses are summed. */
function processBuses(spec: TrackSpec, buses: Buses): void {
  const dottedEighth = STEP_SECONDS * 1.5;
  pingPongDelay(buses.lead, dottedEighth, 0.28, 0.16);
  pingPongDelay(buses.arp, STEP_SECONDS * 2, 0.24, 0.2);
  applyReverb(buses.pad, spec.reverb);
  applyReverb(buses.stabs, spec.reverb * 0.6);
  applySidechain(buses.bass, buses.kicks, 0.32, 0.12);
  applySidechain(buses.pad, buses.kicks, 0.22, 0.14);
  // Band-limit the percussion like a 16-bit console would: hats and crashes are
  // synthesised from full-band noise, and the top octave only eats bitrate.
  for (const channel of [buses.drums.left, buses.drums.right]) {
    applyLowpass(channel, 15_500, 0.7);
    applyLowpass(channel, 15_500, 0.7);
  }
  softClip(buses.drums.left, 1.05);
  softClip(buses.drums.right, 1.05);
}

/** Bus balance of the final mix: melody forward, drums punchy, pad supporting. */
const BUS_GAINS = {
  lead: 0.95,
  arp: 0.5,
  pad: 0.6,
  bass: 0.95,
  drums: 1,
  stabs: 0.72,
} as const;

/** Mixes the six buses into one stereo buffer. */
function mixBuses(buses: Buses, totalSamples: number): StereoBuffer {
  const mix = stereoBuffer(totalSamples);
  mixStereoInto(mix, buses.lead, BUS_GAINS.lead);
  mixStereoInto(mix, buses.arp, BUS_GAINS.arp);
  mixStereoInto(mix, buses.pad, BUS_GAINS.pad);
  mixStereoInto(mix, buses.bass, BUS_GAINS.bass);
  mixStereoInto(mix, buses.drums, BUS_GAINS.drums);
  mixStereoInto(mix, buses.stabs, BUS_GAINS.stabs);
  return mix;
}

/** Result of rendering one music asset. */
export interface RenderedMusic {
  readonly audio: StereoBuffer;
  readonly seconds: number;
  readonly bpm: number;
  readonly bars: number;
  readonly loop: boolean;
}

/** Renders one looping track from its plan; the tail is folded back for a seamless loop. */
function renderLoop(key: keyof typeof TRACKS): RenderedMusic {
  const spec = TRACKS[key];
  assertValidTrack(key, spec);
  const totalSteps = spec.sections.reduce((sum, section) => sum + section.bars, 0) * STEPS_PER_BAR;
  const loopSamples = totalSteps * STEP_SAMPLES;
  const totalSamples = loopSamples + secondsToSamples(TAIL_SECONDS);
  const buses: Buses = {
    lead: stereoBuffer(totalSamples),
    arp: stereoBuffer(totalSamples),
    pad: stereoBuffer(totalSamples),
    bass: stereoBuffer(totalSamples),
    drums: stereoBuffer(totalSamples),
    stabs: stereoBuffer(totalSamples),
    kicks: [],
  };
  arrange(spec, buses);
  processBuses(spec, buses);
  const mix = mixBuses(buses, totalSamples);
  foldTail(mix, loopSamples);
  // Only the loop length is committed: the folded tail lives in the seam, not in the file.
  const audio: StereoBuffer = {
    left: mix.left.subarray(0, loopSamples),
    right: mix.right.subarray(0, loopSamples),
  };
  normalizePeak(audio, spec.targetPeakDb);
  return {
    audio,
    seconds: loopSamples / SAMPLE_RATE,
    bpm: MUSIC_BPM,
    bars: LOOP_BARS,
    loop: true,
  };
}

/** Schedule helper for the stings: adds one lead tone at `seconds`. */
function stingLead(bus: StereoBuffer, at: number, name: string, seconds: number, gain = 1): void {
  addMono(bus, leadVoice(note(name), seconds, 0.95), secondsToSamples(at), -0.05, gain);
}

/** Schedule helper for the stings: adds one brass chord at `seconds`. */
function stingChord(
  bus: StereoBuffer,
  at: number,
  names: readonly string[],
  seconds: number,
): void {
  const pans = [0.28, -0.3, 0.1, 0.42];
  for (let index = 0; index < names.length; index += 1) {
    addMono(
      bus,
      stabVoice(note(names[index] ?? 'A4'), seconds, 0.95),
      secondsToSamples(at),
      pans[index] ?? 0,
      0.85,
    );
  }
}

/** Schedule helper for the stings: adds one bass tone at `seconds`. */
function stingBass(bus: StereoBuffer, at: number, name: string, seconds: number): void {
  addMono(bus, bassVoice(note(name), seconds, 0.9), secondsToSamples(at), 0, 0.9);
}

/** Victory sting: heroic A-major fanfare that resolves and rings out in 3 s. */
function renderVictory(): StereoBuffer {
  const bus = stereoBuffer(secondsToSamples(STING_SECONDS));
  addMono(bus, crashVoice({ variation: 7 }), 0, 0.2, 0.7);
  addMono(bus, boomVoice(0.8, 17), 0, 0, 0.5);
  const run = ['A4', 'C#5', 'E5', 'A5', 'C#6', 'E6'];
  for (let index = 0; index < run.length; index += 1) {
    stingLead(bus, index * 0.105, run[index] ?? 'A4', 0.22, 0.95);
  }
  stingChord(bus, 0.62, ['A4', 'C#5', 'E5', 'A5'], 0.52);
  stingBass(bus, 0.62, 'A2', 0.5);
  addMono(bus, crashVoice({ variation: 9 }), secondsToSamples(0.62), 0.1, 0.6);
  stingLead(bus, 0.62, 'A5', 0.2);
  stingLead(bus, 0.83, 'B5', 0.2);
  stingLead(bus, 1.04, 'C#6', 0.42);
  stingChord(bus, 1.25, ['D4', 'F#4', 'A4', 'D5'], 0.38);
  stingBass(bus, 1.25, 'D3', 0.38);
  stingChord(bus, 1.66, ['E4', 'G#4', 'B4', 'E5'], 0.38);
  stingBass(bus, 1.66, 'E3', 0.38);
  stingChord(bus, 2.08, ['A4', 'C#5', 'E5', 'A5'], 0.9);
  stingBass(bus, 2.08, 'A2', 0.9);
  addMono(bus, crashVoice({ variation: 11 }), secondsToSamples(2.08), -0.12, 0.7);
  addMono(bus, boomVoice(0.7, 23), secondsToSamples(2.08), 0, 0.45);
  stingLead(bus, 2.08, 'E6', 0.75);
  fadeOut(bus, 0.3);
  normalizePeak(bus, -2.5);
  return bus;
}

/** Defeat sting: the same motif falling into a low A-minor grave, in 3 s. */
function renderDefeat(): StereoBuffer {
  const bus = stereoBuffer(secondsToSamples(STING_SECONDS));
  addMono(bus, boomVoice(1, 31), 0, 0, 0.6);
  stingChord(bus, 0, ['A3', 'C4', 'E4', 'A4'], 1.5);
  stingBass(bus, 0, 'A2', 1.4);
  const fall = ['A4', 'G4', 'F4', 'E4', 'D4', 'C4'];
  for (let index = 0; index < fall.length; index += 1) {
    stingLead(bus, 0.1 + index * 0.34, fall[index] ?? 'A4', 0.4, 0.85);
  }
  stingChord(bus, 1.1, ['F3', 'A3', 'C4', 'F4'], 0.9);
  stingBass(bus, 1.1, 'F2', 0.9);
  stingChord(bus, 2.0, ['E3', 'G#3', 'B3', 'E4'], 0.8);
  stingBass(bus, 2.0, 'E2', 0.8);
  addMono(bus, boomVoice(0.8, 47), secondsToSamples(2.0), 0, 0.4);
  stingLead(bus, 2.4, 'A3', 0.45, 0.8);
  fadeOut(bus, 0.45);
  normalizePeak(bus, -2.5);
  return bus;
}

/** Renders any music id: the three loops or the two stings. */
export function renderMusic(
  id: 'menu' | 'world1_calm' | 'world1_big_wave' | 'victory' | 'defeat',
): RenderedMusic {
  if (id === 'victory') {
    return {
      audio: renderVictory(),
      seconds: STING_SECONDS,
      bpm: MUSIC_BPM,
      bars: 0,
      loop: false,
    };
  }
  if (id === 'defeat') {
    return {
      audio: renderDefeat(),
      seconds: STING_SECONDS,
      bpm: MUSIC_BPM,
      bars: 0,
      loop: false,
    };
  }
  return renderLoop(id);
}

/** Exported for the verification pass: expected loop length in seconds. */
export const LOOP_SECONDS = (LOOP_BARS * STEPS_PER_BAR * STEP_SAMPLES) / SAMPLE_RATE;
