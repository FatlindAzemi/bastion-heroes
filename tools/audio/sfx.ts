/**
 * The 36 retro-arcade SFX of the game (issue #114 §5, spec 9.9).
 *
 * Style target: arcade punch with modern low end. Every sound is built from the
 * same deterministic synth primitives as the soundtrack (see instruments.ts): a
 * bright chiptune transient for the retro read, plus a sung sub thump, noise
 * crack or metallic ring for the modern punch. Nothing is sampled and nothing is
 * random at runtime: noise comes from a seeded mulberry32 stream, so rebuilding
 * the tool always writes byte-identical WAV masters.
 *
 * Each id in `SFX_RECIPES` maps to one short recipe; the renderer finishes with a
 * peak normalisation so the mixing gains in src/platform/audioManifest.ts stay
 * meaningful. The exception to the 2 s one-shot budget is the chest open and the
 * level win/lose fanfares (issue #114 §5); every file stays far below the 50 KB
 * spec 12.11 budget.
 */
import {
  SAMPLE_RATE,
  Biquad,
  addMono,
  addMonoSweep,
  fadeOut,
  mulberry32,
  normalizePeak,
  renderTone,
  secondsToSamples,
  stereoBuffer,
  whiteNoise,
  type StereoBuffer,
} from './dsp';
import {
  bloopVoice,
  boomVoice,
  chimeVoice,
  clickVoice,
  crashVoice,
  hornVoice,
  leadVoice,
  noiseBurst,
  pingVoice,
  pitchDropVoice,
  zapVoice,
} from './instruments';
import { note } from './theory';
import type { SfxId } from '../../src/platform/audioManifest';

/** Stable seed for one SFX id; keeps every noise stream reproducible. */
function seedOf(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Returns a silent stereo buffer of `seconds` length. */
function empty(seconds: number): StereoBuffer {
  return stereoBuffer(secondsToSamples(seconds));
}

/** Adds one mono voice at `at` seconds. */
function put(bus: StereoBuffer, voice: Float32Array, at: number, pan = 0, gain = 1): void {
  addMono(bus, voice, secondsToSamples(at), pan, gain);
}

/** Adds one mono voice with a pan sweep, used for whooshes. */
function putSweep(
  bus: StereoBuffer,
  voice: Float32Array,
  at: number,
  fromPan: number,
  toPan: number,
  gain = 1,
): void {
  addMonoSweep(bus, voice, secondsToSamples(at), fromPan, toPan, gain);
}

/** Normalises a finished one-shot and returns it, ready for the WAV writer. */
function finish(bus: StereoBuffer, peakDb = -3): StereoBuffer {
  normalizePeak(bus, peakDb);
  return bus;
}

/** Band-passed noise whose center sweeps exponentially from `fromHz` to `toHz`. */
function sweepingNoise(
  seconds: number,
  fromHz: number,
  toHz: number,
  q: number,
  ampTau: number,
  seed: number,
): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  const random = mulberry32(seed);
  const filter = new Biquad();
  for (let index = 0; index < length; index += 1) {
    if (index % 32 === 0) {
      const progress = index / length;
      filter.setBandpass(fromHz * (toHz / fromHz) ** progress, q);
    }
    const time = index / SAMPLE_RATE;
    const fade = Math.min(1, index / (0.002 * SAMPLE_RATE));
    samples[index] = filter.process(whiteNoise(random)) * Math.exp(-time / ampTau) * fade;
  }
  return samples;
}

/** Renders a pitched waveform that glides from `fromHz` to `toHz`. */
function glide(
  fromHz: number,
  toHz: number,
  seconds: number,
  wave: 'pulse' | 'saw' | 'sine' | 'triangle',
  gain = 1,
): Float32Array {
  return renderTone({
    wave,
    frequency: fromHz,
    seconds,
    gain: gain * 0.45,
    attack: 0.003,
    decay: 0.12,
    sustain: 0.45,
    release: 0.06,
    duty: 0.25,
    sweepToFrequency: toHz,
    sweepSeconds: seconds * 0.85,
    sweepExponent: 0.7,
    cutoffFromHz: 8000,
    cutoffToHz: 2400,
  });
}

/** Adds a chime/bell note to the bus. */
function bell(
  bus: StereoBuffer,
  name: string,
  at: number,
  seconds: number,
  gain = 1,
  pan = 0,
): void {
  put(bus, chimeVoice(note(name), seconds, gain), at, pan, 1);
}

/** Adds a run of chime notes, alternating the stereo position. */
function bellRun(
  bus: StereoBuffer,
  names: readonly string[],
  at: number,
  spacing: number,
  seconds: number,
  gain = 1,
  spread = 0.4,
): void {
  for (let index = 0; index < names.length; index += 1) {
    const pan = index % 2 === 0 ? -spread : spread;
    bell(bus, names[index] ?? 'A4', at + index * spacing, seconds, gain, pan);
  }
}

/** Adds a low thud/impact at `at` seconds. */
function thud(bus: StereoBuffer, at: number, gain = 1): void {
  put(bus, pitchDropVoice(190, 55, 0.22, 0.07, 0.035), at, 0, gain);
}

/** Adds a deep boom at `at` seconds. */
function boom(bus: StereoBuffer, at: number, gain = 1): void {
  put(bus, boomVoice(0.7, seedOf('boom')), at, 0, gain);
}

/** Adds a bright noise crack at `at` seconds. */
function crack(bus: StereoBuffer, at: number, gain = 1): void {
  put(bus, noiseBurst(0.12, 'highpass', 2600, 0.6, 0.035, seedOf('crack')), at, 0.06, gain);
}

/** Rising metallic ping at `at` seconds. */
function ping(bus: StereoBuffer, at: number, frequencyHz: number, seconds: number, gain = 1): void {
  put(bus, pingVoice(frequencyHz, seconds, gain), at, 0.15, 1);
}

/* ------------------------------------------------------------------ */
/* UI, card and loot sounds.                                          */
/* ------------------------------------------------------------------ */

/** Short clicky tap for buttons, the quietest interaction sound. */
function renderButtonTap(): StereoBuffer {
  const bus = empty(0.09);
  put(bus, clickVoice(2400, 0.035, seedOf('tap')), 0, 0, 0.9);
  put(bus, clickVoice(1200, 0.03, seedOf('tap2')), 0.012, -0.1, 0.35);
  return finish(bus);
}

/** Card select: a two-step arcade blip. */
function renderCardSelect(): StereoBuffer {
  const bus = empty(0.12);
  put(bus, zapVoice(1250, 1750, 0.08, 0.8), 0, -0.15, 0.7);
  put(bus, clickVoice(2600, 0.02, seedOf('card_select')), 0, 0.2, 0.5);
  return finish(bus);
}

/** Card place: wooden thud plus a mechanical click. */
function renderCardPlace(): StereoBuffer {
  const bus = empty(0.22);
  thud(bus, 0, 1);
  put(bus, clickVoice(2100, 0.04, seedOf('card_place')), 0, 0.2, 0.7);
  put(bus, noiseBurst(0.06, 'lowpass', 900, 0.8, 0.025, seedOf('card_place2')), 0.01, -0.15, 0.5);
  return finish(bus);
}

/** Card merge: two pops that fuse into a bright chime chord. */
function renderCardMerge(): StereoBuffer {
  const bus = empty(0.5);
  put(bus, zapVoice(520, 760, 0.1, 0.8), 0, -0.25, 0.8);
  put(bus, zapVoice(640, 920, 0.1, 0.8), 0.09, 0.25, 0.8);
  bellRun(bus, ['C6', 'E6', 'G6'], 0.19, 0.035, 0.4, 0.9, 0.5);
  thud(bus, 0.2, 0.45);
  put(bus, noiseBurst(0.15, 'highpass', 5000, 0.6, 0.05, seedOf('merge')), 0.18, 0, 0.25);
  return finish(bus);
}

/** Shovel: gritty scrape and a soft dirt thud. */
function renderShovel(): StereoBuffer {
  const bus = empty(0.32);
  putSweep(bus, sweepingNoise(0.24, 3200, 500, 1.4, 0.09, seedOf('shovel')), 0, -0.45, 0.35, 0.9);
  put(bus, noiseBurst(0.1, 'lowpass', 700, 0.9, 0.05, seedOf('dirt')), 0.17, 0, 0.7);
  thud(bus, 0.17, 0.5);
  return finish(bus);
}

/** Orb drop: a soft falling pop. */
function renderOrbDrop(): StereoBuffer {
  const bus = empty(0.2);
  put(bus, bloopVoice(760, 320, 0.16), 0, 0, 0.9);
  put(bus, clickVoice(1600, 0.02, seedOf('orb_drop')), 0, -0.1, 0.35);
  return finish(bus);
}

/** Orb collect: glittering XP sparkle with a soft sub under it. */
function renderOrbCollect(): StereoBuffer {
  const bus = empty(0.4);
  bellRun(bus, ['E6', 'G6', 'B6', 'E7'], 0, 0.03, 0.35, 0.8, 0.55);
  put(bus, bloopVoice(900, 1400, 0.12), 0, 0.3, 0.25);
  thud(bus, 0.02, 0.3);
  return finish(bus);
}

/** Glittering loot chime used by the upgrade fanfare. */
function renderUpgrade(): StereoBuffer {
  const bus = empty(0.55);
  bellRun(bus, ['C5', 'E5', 'G5', 'C6'], 0, 0.055, 0.5, 0.9, 0.45);
  put(bus, chimeVoice(note('G5'), 0.5, 0.8), 0.24, 0, 0.5);
  put(bus, zapVoice(600, 1300, 0.22, 0.7), 0.2, 0, 0.5);
  thud(bus, 0.42, 0.6);
  put(bus, noiseBurst(0.2, 'highpass', 4000, 0.6, 0.06, seedOf('upgrade')), 0.35, 0, 0.25);
  return finish(bus);
}

/* ------------------------------------------------------------------ */
/* Attacks, hits and combos.                                          */
/* ------------------------------------------------------------------ */

/** Straight attack: a clean blade slice. */
function renderAttackStraight(): StereoBuffer {
  const bus = empty(0.24);
  putSweep(bus, sweepingNoise(0.16, 7500, 1600, 1.6, 0.05, seedOf('straight')), 0, -0.5, 0.5, 0.9);
  put(bus, zapVoice(1400, 420, 0.12, 0.6), 0.01, 0, 0.6);
  return finish(bus);
}

/** Lob attack: a rising whoosh with a soft payload thump. */
function renderAttackLob(): StereoBuffer {
  const bus = empty(0.36);
  putSweep(bus, sweepingNoise(0.3, 400, 2800, 1.2, 0.16, seedOf('lob')), 0, -0.35, 0.45, 0.85);
  put(bus, bloopVoice(280, 620, 0.25), 0.01, 0.2, 0.35);
  thud(bus, 0.24, 0.55);
  return finish(bus);
}

/** Splash attack: water burst, falling bloop and spray. */
function renderAttackSplash(): StereoBuffer {
  const bus = empty(0.4);
  put(bus, noiseBurst(0.3, 'lowpass', 1300, 0.7, 0.09, seedOf('splash')), 0, 0, 0.85);
  put(bus, bloopVoice(560, 180, 0.3), 0.02, -0.2, 0.6);
  putSweep(bus, sweepingNoise(0.2, 2600, 9000, 1.4, 0.07, seedOf('spray')), 0.05, -0.3, 0.5, 0.5);
  return finish(bus);
}

/** Beam attack: a laser that bends down with a ringing tail. */
function renderAttackBeam(): StereoBuffer {
  const bus = empty(0.42);
  put(bus, glide(1800, 180, 0.34, 'pulse', 1), 0, 0, 0.8);
  ping(bus, 0.02, 1400, 0.3, 0.35);
  put(bus, noiseBurst(0.25, 'highpass', 3500, 0.6, 0.08, seedOf('beam')), 0, 0, 0.3);
  return finish(bus);
}

/** Diagonal attack: a double cross-slash. */
function renderAttackDiagonal(): StereoBuffer {
  const bus = empty(0.28);
  putSweep(bus, sweepingNoise(0.13, 6800, 1800, 1.8, 0.04, seedOf('diag1')), 0, -0.5, 0.4, 0.8);
  putSweep(bus, sweepingNoise(0.14, 5000, 1200, 1.8, 0.045, seedOf('diag2')), 0.09, 0.4, -0.5, 0.8);
  put(bus, zapVoice(900, 260, 0.14, 0.5), 0.09, 0, 0.5);
  return finish(bus);
}

/** Pierce hit: short metallic tick with a high ring. */
function renderHitPierce(): StereoBuffer {
  const bus = empty(0.2);
  put(bus, noiseBurst(0.05, 'bandpass', 3800, 1.1, 0.015, seedOf('pierce')), 0, 0, 0.8);
  ping(bus, 0.005, 2900, 0.16, 0.6);
  thud(bus, 0, 0.4);
  return finish(bus);
}

/** Blast hit: modern punch — sub boom, noise crack and a short metal ring. */
function renderHitBlast(): StereoBuffer {
  const bus = empty(0.42);
  boom(bus, 0, 0.9);
  crack(bus, 0, 1);
  put(bus, noiseBurst(0.28, 'lowpass', 500, 0.8, 0.09, seedOf('blast')), 0, 0, 0.7);
  ping(bus, 0.01, 620, 0.25, 0.3);
  return finish(bus);
}

/** Arcane hit: magical pitch drop with a shimmer. */
function renderHitArcane(): StereoBuffer {
  const bus = empty(0.36);
  put(bus, glide(1000, 220, 0.28, 'triangle', 0.9), 0, 0, 0.75);
  bellRun(bus, ['A6', 'E7'], 0.02, 0.05, 0.3, 0.4, 0.6);
  putSweep(bus, sweepNoise(0.24, 5500, 1200, 1.5, seedOf('arcane')), 0.01, -0.4, 0.4, 0.5);
  thud(bus, 0, 0.35);
  return finish(bus);
}

/** Helper for `sweepingNoise` at a neutral gain (used by the shimmer layers). */
function sweepNoise(
  seconds: number,
  fromHz: number,
  toHz: number,
  q: number,
  seed: number,
): Float32Array {
  return sweepingNoise(seconds, fromHz, toHz, q, seconds * 0.55, seed);
}

/* ------------------------------------------------------------------ */
/* Combos, enemies and defender deaths.                               */
/* ------------------------------------------------------------------ */

/** Steam combo: a hissing pressure release with a soft thump. */
function renderComboSteam(): StereoBuffer {
  const bus = empty(0.6);
  put(bus, noiseBurst(0.5, 'highpass', 3200, 0.5, 0.22, seedOf('steam')), 0, 0.1, 0.8);
  putSweep(bus, sweepingNoise(0.45, 900, 3600, 1, 0.3, seedOf('steam2')), 0, -0.4, 0.4, 0.5);
  thud(bus, 0, 0.55);
  return finish(bus);
}

/** Shatter combo: glass break with a deterministic spray of high pings. */
function renderComboShatter(): StereoBuffer {
  const bus = empty(0.55);
  put(bus, noiseBurst(0.35, 'highpass', 2600, 0.5, 0.12, seedOf('shatter')), 0, 0, 0.85);
  const random = mulberry32(seedOf('shards'));
  for (let shard = 0; shard < 6; shard += 1) {
    const at = 0.01 + random() * 0.22;
    const hz = 2200 + random() * 4200;
    ping(bus, at, hz, 0.16 + random() * 0.16, 0.35);
  }
  boom(bus, 0, 0.5);
  return finish(bus);
}

/** Toxic combo: bubbly descending blobs over a low hiss. */
function renderComboToxic(): StereoBuffer {
  const bus = empty(0.6);
  const random = mulberry32(seedOf('toxic'));
  for (let blob = 0; blob < 5; blob += 1) {
    const at = blob * 0.09 + random() * 0.02;
    const from = 380 + random() * 320;
    put(bus, bloopVoice(from, from * 0.45, 0.22), at, (random() - 0.5) * 0.6, 0.55);
  }
  put(bus, noiseBurst(0.5, 'lowpass', 900, 0.8, 0.22, seedOf('toxic_hiss')), 0, 0, 0.35);
  return finish(bus);
}

/** Chain combo: four rising zap notes that echo into each other. */
function renderComboChain(): StereoBuffer {
  const bus = empty(0.6);
  const chain = ['C5', 'E5', 'G5', 'C6'];
  for (let index = 0; index < chain.length; index += 1) {
    const frequency = 220 * 2 ** ((note(chain[index] ?? 'C5') - note('A3')) / 12);
    put(
      bus,
      zapVoice(frequency, frequency * 1.5, 0.12, 0.7),
      index * 0.07,
      index % 2 === 0 ? -0.3 : 0.3,
      0.7,
    );
  }
  ping(bus, 0.3, 2400, 0.3, 0.35);
  return finish(bus);
}

/** Enemy groan: a slow, detuned low groan that bends downwards. */
function renderEnemyGroan(): StereoBuffer {
  const bus = empty(0.62);
  put(
    bus,
    renderTone({
      wave: 'saw',
      frequency: 190,
      seconds: 0.55,
      gain: 0.5,
      attack: 0.03,
      decay: 0.2,
      sustain: 0.6,
      release: 0.15,
      detuneCents: 14,
      detuneGain: 0.8,
      vibratoRateHz: 6.5,
      vibratoDepthCents: 55,
      vibratoDelaySeconds: 0.02,
      sweepToFrequency: 120,
      sweepSeconds: 0.5,
    }),
    0,
    -0.05,
    1,
  );
  put(bus, noiseBurst(0.4, 'lowpass', 420, 0.8, 0.14, seedOf('groan')), 0.02, 0, 0.35);
  return finish(bus);
}

/** Enemy eat: three crunchy bites. */
function renderEnemyEat(): StereoBuffer {
  const bus = empty(0.38);
  for (let bite = 0; bite < 3; bite += 1) {
    put(
      bus,
      noiseBurst(0.09, 'lowpass', 1000, 0.9, 0.03, seedOf('bite') + bite * 13),
      bite * 0.09,
      0,
      0.8,
    );
    thud(bus, bite * 0.09, 0.35);
  }
  return finish(bus);
}

/** Enemy death: pitch collapse into a low noise thump. */
function renderEnemyDeath(): StereoBuffer {
  const bus = empty(0.66);
  put(bus, glide(720, 90, 0.5, 'pulse', 0.9), 0, 0, 0.7);
  put(bus, noiseBurst(0.5, 'lowpass', 1400, 0.7, 0.18, seedOf('enemy_death')), 0.06, 0, 0.6);
  boom(bus, 0.16, 0.6);
  return finish(bus);
}

/** Defender death: metallic armour collapse with a low body hit. */
function renderDefenderDeath(): StereoBuffer {
  const bus = empty(0.8);
  ping(bus, 0, 1500, 0.55, 0.5);
  put(bus, crashVoice({ variation: 3 }), 0, -0.15, 0.35);
  put(bus, glide(520, 110, 0.55, 'saw', 0.8), 0, 0, 0.5);
  boom(bus, 0.1, 0.75);
  return finish(bus);
}

/** Trap: a mechanical snap and a springy twang. */
function renderTrap(): StereoBuffer {
  const bus = empty(0.4);
  put(bus, noiseBurst(0.06, 'highpass', 3000, 0.6, 0.012, seedOf('trap')), 0, 0, 0.9);
  put(bus, pingVoice(680, 0.3, 0.7), 0.01, 0.15, 1);
  put(bus, noiseBurst(0.12, 'bandpass', 1400, 1.2, 0.03, seedOf('trap2')), 0.03, -0.2, 0.5);
  return finish(bus);
}

/* ------------------------------------------------------------------ */
/* Card flips, chest, horn, roar and fanfares.                        */
/* ------------------------------------------------------------------ */

/** Whooshing card flip that rings out into the rarity chime. */
function renderCardFlip(rarity: number): StereoBuffer {
  const names = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
  const duration = 0.26 + rarity * 0.06;
  const bus = empty(duration + 0.3);
  putSweep(
    bus,
    sweepingNoise(duration * 0.7, 700, 4200, 1.1, duration * 0.42, seedOf(`flip${String(rarity)}`)),
    0,
    -0.75,
    0.75,
    0.7,
  );
  const chimeCount = Math.min(names.length, 2 + rarity);
  for (let index = 0; index < chimeCount; index += 1) {
    bell(
      bus,
      names[index] ?? 'C5',
      duration * 0.45 + index * 0.045,
      0.35,
      0.55,
      index % 2 === 0 ? -0.35 : 0.35,
    );
  }
  if (rarity >= 3) {
    ping(bus, duration * 0.45, 2600 + rarity * 260, 0.35, 0.3);
  }
  if (rarity >= 4) {
    thud(bus, duration * 0.4, 0.45);
  }
  return finish(bus);
}

/** Chest shake: a rattle of wooden knocks and beads. */
function renderChestShake(): StereoBuffer {
  const bus = empty(0.9);
  const random = mulberry32(seedOf('chest_shake'));
  for (let knock = 0; knock < 6; knock += 1) {
    const at = knock * 0.11 + random() * 0.04;
    put(
      bus,
      noiseBurst(0.05, 'bandpass', 900 + random() * 800, 1.3, 0.015, seedOf('shake') + knock),
      at,
      (random() - 0.5) * 0.5,
      0.75,
    );
  }
  for (let bead = 0; bead < 8; bead += 1) {
    put(
      bus,
      clickVoice(2600 + random() * 1800, 0.02, seedOf('bead') + bead),
      0.1 + random() * 0.65,
      (random() - 0.5) * 0.8,
      0.3,
    );
  }
  return finish(bus);
}

/** Chest open: rattle, clash and a bright C-major fanfare inside the 2 s budget. */
function renderChestOpen(): StereoBuffer {
  const bus = empty(1.9);
  put(bus, noiseBurst(0.3, 'bandpass', 1600, 0.9, 0.09, seedOf('chest_click')), 0, 0, 0.8);
  put(bus, glide(500, 1300, 0.3, 'pulse', 0.7), 0.05, 0, 0.6);
  put(bus, crashVoice({ variation: 5 }), 0.32, 0.15, 0.55);
  boom(bus, 0.32, 0.6);
  bellRun(bus, ['C5', 'E5', 'G5', 'C6', 'E6'], 0.4, 0.055, 0.9, 0.85, 0.5);
  put(bus, chimeVoice(note('C6'), 1.3, 0.8), 0.7, 0, 0.45);
  put(bus, chimeVoice(note('G5'), 1.2, 0.8), 0.85, -0.2, 0.4);
  put(bus, noiseBurst(0.9, 'highpass', 5200, 0.6, 0.35, seedOf('chest_sparkle')), 0.5, 0.3, 0.25);
  fadeOut(bus, 0.2);
  return finish(bus);
}

/** Wave horn: the two-call battle signal. */
function renderWaveHorn(): StereoBuffer {
  const bus = empty(1.25);
  put(bus, hornVoice(0.55, 1), 0, 0, 0.9);
  put(bus, hornVoice(0.65, 0.95), 0.56, 0, 0.85);
  put(bus, crashVoice({ variation: 1 }), 0.55, 0.2, 0.3);
  put(bus, hornVoice(0.3, 0.5), 1.02, 0, 0.4);
  return finish(bus);
}

/** Boss roar: low detuned growl with an amplitude wobble and a boom. */
function renderBossRoar(): StereoBuffer {
  const seconds = 1.45;
  const bus = empty(seconds);
  const length = secondsToSamples(seconds);
  const growl = new Float32Array(length);
  const random = mulberry32(seedOf('roar_noise'));
  const filter = new Biquad();
  filter.setLowpass(900, 1.1);
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = time / seconds;
    const frequency = 105 * (0.5 + 0.5 * Math.exp(-time * 1.2));
    const vibrato = 1 + 0.12 * Math.sin(2 * Math.PI * 7.5 * time);
    const tone =
      Math.sin(2 * Math.PI * frequency * vibrato * time) * 0.6 +
      Math.sin(2 * Math.PI * frequency * 1.5 * vibrato * time) * 0.3;
    const wobble = 0.65 + 0.35 * Math.sin(2 * Math.PI * 12 * time);
    const noise = filter.process(whiteNoise(random)) * 0.4;
    const fade = Math.min(1, time / 0.05) * Math.min(1, (seconds - time) / 0.25);
    growl[index] = (tone * wobble + noise) * fade * (1 - 0.3 * progress);
  }
  put(bus, growl, 0, 0, 0.9);
  boom(bus, 0, 0.8);
  return finish(bus);
}

/** Level win fanfare: bright 16th run that lands on a ringing A-major chord. */
function renderLevelWin(): StereoBuffer {
  const bus = empty(1.9);
  const run = ['A4', 'C#5', 'E5', 'A5', 'C#6', 'E6'];
  for (let index = 0; index < run.length; index += 1) {
    put(
      bus,
      leadVoice(note(run[index] ?? 'A4'), 0.2, 0.9),
      index * 0.07,
      index % 2 === 0 ? -0.2 : 0.2,
      0.8,
    );
  }
  put(bus, crashVoice({ variation: 2 }), 0.42, 0.1, 0.55);
  boom(bus, 0.42, 0.5);
  bellRun(bus, ['A5', 'C#6', 'E6', 'A6'], 0.44, 0.05, 0.9, 0.7, 0.45);
  put(bus, chimeVoice(note('A5'), 1.2, 0.8), 0.85, 0, 0.5);
  fadeOut(bus, 0.25);
  return finish(bus);
}

/** Level lose: the same hero motif collapsing down into a low A. */
function renderLevelLose(): StereoBuffer {
  const bus = empty(1.9);
  const fall = ['A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3'];
  for (let index = 0; index < fall.length; index += 1) {
    const midi = note(fall[index] ?? 'A4');
    put(
      bus,
      renderTone({
        wave: 'triangle',
        frequency: 440 * 2 ** ((midi - 69) / 12),
        seconds: 0.22,
        gain: 0.5,
        attack: 0.01,
        decay: 0.08,
        sustain: 0.5,
        release: 0.1,
        vibratoRateHz: 5,
        vibratoDepthCents: 25,
      }),
      index * 0.16,
      0,
      0.8,
    );
  }
  put(
    bus,
    renderTone({
      wave: 'saw',
      frequency: 110,
      seconds: 1.2,
      gain: 0.3,
      attack: 0.1,
      decay: 0.3,
      sustain: 0.6,
      release: 0.4,
      detuneCents: 10,
      detuneGain: 0.9,
      cutoffFromHz: 900,
      cutoffToHz: 400,
    }),
    0.2,
    -0.1,
    1,
  );
  boom(bus, 1.15, 0.5);
  fadeOut(bus, 0.3);
  return finish(bus);
}

/* ------------------------------------------------------------------ */
/* Recipe table.                                                      */
/* ------------------------------------------------------------------ */

/** One renderer per documented SFX id; the Record forces complete coverage. */
export const SFX_RECIPES: Readonly<Record<SfxId, () => StereoBuffer>> = {
  card_select: renderCardSelect,
  card_place: renderCardPlace,
  card_merge: renderCardMerge,
  shovel: renderShovel,
  orb_drop: renderOrbDrop,
  orb_collect: renderOrbCollect,
  attack_straight: renderAttackStraight,
  attack_lob: renderAttackLob,
  attack_splash: renderAttackSplash,
  attack_beam: renderAttackBeam,
  attack_diagonal: renderAttackDiagonal,
  hit_pierce: renderHitPierce,
  hit_blast: renderHitBlast,
  hit_arcane: renderHitArcane,
  combo_steam: renderComboSteam,
  combo_shatter: renderComboShatter,
  combo_toxic: renderComboToxic,
  combo_chain: renderComboChain,
  enemy_groan: renderEnemyGroan,
  enemy_eat: renderEnemyEat,
  enemy_death: renderEnemyDeath,
  defender_death: renderDefenderDeath,
  trap: renderTrap,
  wave_horn: renderWaveHorn,
  boss_roar: renderBossRoar,
  button_tap: renderButtonTap,
  chest_shake: renderChestShake,
  chest_open: renderChestOpen,
  card_flip_common: () => renderCardFlip(0),
  card_flip_rare: () => renderCardFlip(1),
  card_flip_epic: () => renderCardFlip(2),
  card_flip_legendary: () => renderCardFlip(3),
  card_flip_mythic: () => renderCardFlip(4),
  upgrade: renderUpgrade,
  level_win: renderLevelWin,
  level_lose: renderLevelLose,
};

/** Result of rendering one SFX. */
export interface RenderedSfx {
  readonly audio: StereoBuffer;
  readonly seconds: number;
}

/** Renders one SFX by id. */
export function renderSfx(id: SfxId): RenderedSfx {
  const audio = SFX_RECIPES[id]();
  return { audio, seconds: audio.left.length / SAMPLE_RATE };
}
