/**
 * Tiny music-theory helper for the World 1 soundtrack (issue #114 §5).
 *
 * The soundtrack is written in A minor with the heroic i-VI-III-VII progression
 * (Am-F-C-G) plus a iv-VI-i-V lift (Dm-F-Am-E) for the bridge. Chord symbols are
 * resolved to MIDI note numbers so the arrangement code never hard-codes pitches.
 */

/** Semitone offsets of the natural note letters inside one octave. */
const NOTE_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** One chord: pitch class of the root plus the third and fifth intervals. */
interface ChordDefinition {
  readonly root: number;
  readonly third: number;
  readonly fifth: number;
}

/** Chords used by the soundtrack, spelled as triads. */
export const CHORDS: Readonly<Record<string, ChordDefinition>> = {
  Am: { root: 9, third: 3, fifth: 7 },
  C: { root: 0, third: 4, fifth: 7 },
  Dm: { root: 2, third: 3, fifth: 7 },
  E: { root: 4, third: 4, fifth: 7 },
  F: { root: 5, third: 4, fifth: 7 },
  G: { root: 7, third: 4, fifth: 7 },
};

/** True when `symbol` is a chord the soundtrack knows. */
export function isChord(symbol: string): boolean {
  return CHORDS[symbol] !== undefined;
}

/** Parses a note name such as `A4`, `C#5` or `Bb3` into a MIDI note number. */
export function note(name: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (match === null) {
    throw new Error(`invalid note name: ${name}`);
  }
  const letter = match[1] ?? 'C';
  const accidental = match[2] ?? '';
  const octave = Number.parseInt(match[3] ?? '4', 10);
  const semitone = NOTE_SEMITONES[letter];
  if (semitone === undefined) {
    throw new Error(`invalid note letter: ${letter}`);
  }
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (octave + 1) * 12 + semitone + offset;
}

/** MIDI note number of a chord's root in the given octave (A2 = 45, A3 = 57). */
export function chordRoot(symbol: string, octave: number): number {
  const chord = CHORDS[symbol];
  if (chord === undefined) {
    throw new Error(`unknown chord: ${symbol}`);
  }
  return (octave + 1) * 12 + chord.root;
}

/** MIDI notes of a chord in one octave: root, third, fifth, then the octave. */
export function chordTones(symbol: string, octave: number): readonly number[] {
  const chord = CHORDS[symbol];
  if (chord === undefined) {
    throw new Error(`unknown chord: ${symbol}`);
  }
  const root = chordRoot(symbol, octave);
  return [root, root + chord.third, root + chord.fifth, root + 12];
}

/** Transposes one or more MIDI notes by `semitones`. */
export function transpose(notes: readonly number[], semitones: number): readonly number[] {
  return notes.map((midi) => midi + semitones);
}
