/**
 * Instrument voices of the chiptune-orchestral hybrid (issue #114 §5).
 *
 * Two families are layered on purpose: GBA/SNES-style pulse, triangle and noise
 * voices carry the melody and the chiptune character, while modern kick/snare/hat
 * samples (synthesised here, no samples are loaded) and a saturated sub bass give
 * the "punchy modern drums and bass" half of the brief.
 */
import {
  SAMPLE_RATE,
  Biquad,
  applyHighpass,
  applyLowpass,
  midiToHz,
  mulberry32,
  renderTone,
  secondsToSamples,
  whiteNoise,
  type Tone,
} from './dsp';

/** Optional shaping shared by the drum voices: seed for noise variation and level. */
export interface DrumHit {
  readonly velocity?: number;
  readonly variation?: number;
}

/** Derives a deterministic noise seed for one drum hit. */
function hitSeed(variation: number): number {
  return (0x9e3779b9 ^ Math.imul(variation + 1, 0x85ebca6b)) >>> 0;
}

/** Adds two mono buffers of equal length into a fresh buffer. */
function addSamples(first: Float32Array, second: Float32Array): Float32Array {
  const length = Math.max(first.length, second.length);
  const result = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    result[index] = (first[index] ?? 0) + (second[index] ?? 0);
  }
  return result;
}

/** Clamps every sample through tanh saturation, in place. */
function saturate(samples: Float32Array, drive: number): Float32Array {
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.tanh((samples[index] ?? 0) * drive);
  }
  return samples;
}

/** Renders a sine with an exponential pitch glide from `fromHz` down to `toHz`. */
export function pitchDropVoice(
  fromHz: number,
  toHz: number,
  seconds: number,
  ampTau: number,
  pitchTau = 0.03,
): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const frequency = toHz + (fromHz - toHz) * Math.exp(-time / pitchTau);
    phase = (phase + Math.min(0.45, frequency / SAMPLE_RATE)) % 1;
    const fade = Math.min(1, time / 0.001);
    samples[index] = Math.sin(2 * Math.PI * phase) * Math.exp(-time / ampTau) * fade;
  }
  return samples;
}

/** Renders one filtered noise burst with an exponential decay. */
export function noiseBurst(
  seconds: number,
  shape: 'lowpass' | 'highpass' | 'bandpass',
  frequencyHz: number,
  q: number,
  ampTau: number,
  seed: number,
): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  const random = mulberry32(seed);
  const attack = Math.max(1, Math.round(0.0015 * SAMPLE_RATE));
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const fade = Math.min(1, index / attack);
    samples[index] = whiteNoise(random) * Math.exp(-time / ampTau) * fade;
  }
  if (shape === 'lowpass') {
    applyLowpass(samples, frequencyHz, q);
  } else if (shape === 'highpass') {
    applyHighpass(samples, frequencyHz, q);
  } else {
    const filter = new Biquad();
    filter.setBandpass(frequencyHz, q);
    for (let index = 0; index < length; index += 1) {
      samples[index] = filter.process(samples[index] ?? 0);
    }
  }
  return samples;
}

/** Adds `voice` into `target` at `offsetSeconds`; safe when the target is shorter. */
function addInto(target: Float32Array, voice: Float32Array, offsetSeconds: number, gain = 1): void {
  const start = Math.max(0, secondsToSamples(offsetSeconds));
  for (let index = 0; index < voice.length; index += 1) {
    const position = start + index;
    if (position >= target.length) {
      break;
    }
    target[position] = (target[position] ?? 0) + (voice[index] ?? 0) * gain;
  }
}

/** Pulse lead: 25 % pulse plus a detuned 12.5 % pulse and delayed vibrato. */
export function leadVoice(midi: number, seconds: number, gain = 1): Float32Array {
  const tone: Tone = {
    wave: 'pulse',
    frequency: midiToHz(midi),
    seconds,
    gain: 0.42 * gain,
    attack: 0.008,
    decay: 0.07,
    sustain: 0.66,
    release: 0.09,
    duty: 0.25,
    detuneCents: 6,
    detuneGain: 0.5,
    vibratoRateHz: 5.4,
    vibratoDepthCents: 12,
    vibratoDelaySeconds: 0.09,
    cutoffFromHz: 7200,
    cutoffToHz: 5200,
    cutoffQ: 0.8,
  };
  return renderTone(tone);
}

/** Soft octave double used under the lead in the brighter sections. */
export function leadDoubleVoice(midi: number, seconds: number, gain = 1): Float32Array {
  return renderTone({
    wave: 'pulse',
    frequency: midiToHz(midi),
    seconds,
    gain: 0.16 * gain,
    attack: 0.01,
    decay: 0.08,
    sustain: 0.6,
    release: 0.1,
    duty: 0.125,
    detuneCents: 10,
    detuneGain: 0.4,
    cutoffFromHz: 6000,
    cutoffToHz: 4000,
  });
}

/** NES triangle bass with a sine sub underneath (the modern low-end half). */
export function bassVoice(midi: number, seconds: number, gain = 1): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  const triangle = renderTone({
    wave: 'triangle',
    frequency: midiToHz(midi),
    seconds,
    gain: 0.5 * gain,
    attack: 0.004,
    decay: 0.05,
    sustain: 0.85,
    release: 0.04,
    cutoffFromHz: 1800,
    cutoffToHz: 1400,
    cutoffQ: 0.7,
  });
  const sub = renderTone({
    wave: 'sine',
    frequency: midiToHz(midi - 12),
    seconds,
    gain: 0.34 * gain,
    attack: 0.006,
    decay: 0.06,
    sustain: 0.9,
    release: 0.05,
  });
  for (let index = 0; index < length; index += 1) {
    samples[index] = (triangle[index] ?? 0) + (sub[index] ?? 0);
  }
  return samples;
}

/** Detuned saw pad: the "orchestral strings" bed of the hybrid. */
export function padVoice(midi: number, seconds: number, gain = 1): Float32Array {
  return renderTone({
    wave: 'saw',
    frequency: midiToHz(midi),
    seconds,
    gain: 0.17 * gain,
    attack: 0.14,
    decay: 0.25,
    sustain: 0.82,
    release: 0.4,
    detuneCents: 9,
    detuneGain: 0.8,
    cutoffFromHz: 2600,
    cutoffToHz: 1900,
    cutoffQ: 0.9,
  });
}

/** Short 12.5 % pulse arpeggio pluck with a brittle chiptune attack. */
export function arpVoice(midi: number, seconds: number, gain = 1): Float32Array {
  return renderTone({
    wave: 'pulse',
    frequency: midiToHz(midi),
    seconds,
    gain: 0.17 * gain,
    attack: 0.002,
    decay: 0.05,
    sustain: 0.16,
    release: 0.03,
    duty: 0.125,
    cutoffFromHz: 9000,
    cutoffToHz: 5000,
    cutoffQ: 0.6,
  });
}

/** Brass/string chord stab: fast saw attack with a falling filter. */
export function stabVoice(midi: number, seconds: number, gain = 1): Float32Array {
  const brass = renderTone({
    wave: 'saw',
    frequency: midiToHz(midi),
    seconds,
    gain: 0.13 * gain,
    attack: 0.004,
    decay: 0.12,
    sustain: 0.5,
    release: 0.08,
    detuneCents: 8,
    detuneGain: 0.7,
    cutoffFromHz: 5200,
    cutoffToHz: 1400,
    cutoffQ: 1.1,
  });
  const pulseLayer = renderTone({
    wave: 'pulse',
    frequency: midiToHz(midi),
    seconds,
    gain: 0.07 * gain,
    attack: 0.003,
    decay: 0.1,
    sustain: 0.4,
    release: 0.06,
    duty: 0.5,
  });
  return addSamples(brass, pulseLayer);
}

/** Inharmonic additive bell used for loot chimes and the card-flip sparkles. */
export function chimeVoice(midi: number, seconds: number, gain = 1): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  const frequency = midiToHz(midi);
  const partials = [1, 2.01, 3.02, 4.16, 5.43, 6.79];
  const levels = [1, 0.55, 0.32, 0.2, 0.12, 0.07];
  const decays = [0.55, 0.4, 0.3, 0.24, 0.18, 0.14];
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    let value = 0;
    for (let partial = 0; partial < partials.length; partial += 1) {
      const partialFrequency = frequency * (partials[partial] ?? 1);
      if (partialFrequency > SAMPLE_RATE * 0.45) {
        continue;
      }
      value +=
        Math.sin(2 * Math.PI * partialFrequency * time) *
        (levels[partial] ?? 0) *
        Math.exp(-time / (decays[partial] ?? 0.2));
    }
    // A short noise transient makes the chime read as a sampled 16-bit SFX.
    samples[index] = value * Math.min(1, time / 0.002) * 0.3 * gain;
  }
  return samples;
}

/** Punchy modern kick: pitch-swept body, a 4 ms click and light saturation. */
export function kickVoice(hit: DrumHit = {}): Float32Array {
  const velocity = hit.velocity ?? 1;
  const body = pitchDropVoice(165, 46, 0.34, 0.105, 0.035);
  const click = noiseBurst(0.02, 'highpass', 2400, 0.7, 0.004, hitSeed(hit.variation ?? 0));
  const samples = addSamples(body, click);
  saturate(samples, 1.5);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (samples[index] ?? 0) * 0.9 * velocity;
  }
  return samples;
}

/** Snare: 180 Hz body plus a band-passed noise crack. */
export function snareVoice(hit: DrumHit = {}): Float32Array {
  const velocity = hit.velocity ?? 1;
  const body = pitchDropVoice(240, 175, 0.16, 0.045, 0.02);
  const crack = noiseBurst(0.18, 'bandpass', 2400, 0.7, 0.075, hitSeed(hit.variation ?? 0));
  applyHighpass(crack, 700);
  const samples = addSamples(body, crack);
  saturate(samples, 1.25);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (samples[index] ?? 0) * 0.8 * velocity;
  }
  return samples;
}

/** Layered clap for the biggest accents (three short noise bursts 8 ms apart). */
export function clapVoice(hit: DrumHit = {}): Float32Array {
  const samples = new Float32Array(secondsToSamples(0.26));
  const seed = hitSeed(hit.variation ?? 0);
  for (let burst = 0; burst < 3; burst += 1) {
    const layer = noiseBurst(0.12, 'bandpass', 1600, 0.9, 0.035, seed + burst * 37);
    addInto(samples, layer, burst * 0.007, 0.7);
  }
  applyHighpass(samples, 500);
  return samples;
}

/** Closed/open hi-hat: bright band-passed noise with a chip-style fast decay. */
export function hatVoice(open = false, hit: DrumHit = {}): Float32Array {
  const seconds = open ? 0.3 : 0.06;
  const samples = noiseBurst(
    seconds,
    'highpass',
    7600,
    0.6,
    open ? 0.12 : 0.022,
    hitSeed((hit.variation ?? 0) + (open ? 977 : 0)),
  );
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (samples[index] ?? 0) * 0.5 * (hit.velocity ?? 1);
  }
  return samples;
}

/** Tambourine/shaker layer for the big-wave percussion stack. */
export function shakerVoice(hit: DrumHit = {}): Float32Array {
  const samples = noiseBurst(0.09, 'bandpass', 6200, 1.4, 0.04, hitSeed(hit.variation ?? 0));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (samples[index] ?? 0) * 0.45 * (hit.velocity ?? 1);
  }
  return samples;
}

/** Tom fill: pitched drop with a short noise skin. */
export function tomVoice(midi: number, hit: DrumHit = {}): Float32Array {
  const frequency = midiToHz(midi);
  const body = pitchDropVoice(frequency * 1.5, frequency, 0.28, 0.11, 0.05);
  const skin = noiseBurst(0.1, 'bandpass', frequency * 2, 0.8, 0.03, hitSeed(hit.variation ?? 0));
  const samples = addSamples(body, skin);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (samples[index] ?? 0) * 0.7 * (hit.velocity ?? 1);
  }
  return samples;
}

/** Crash cymbal: bright noise wash plus metallic partials for the 16-bit shimmer. */
export function crashVoice(hit: DrumHit = {}): Float32Array {
  const samples = noiseBurst(1.2, 'highpass', 3800, 0.6, 0.42, hitSeed(hit.variation ?? 0));
  const length = samples.length;
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const ring =
      Math.sin(2 * Math.PI * 3180 * time) * 0.08 +
      Math.sin(2 * Math.PI * 4730 * time) * 0.05 +
      Math.sin(2 * Math.PI * 6570 * time) * 0.03;
    samples[index] = ((samples[index] ?? 0) * 0.75 + ring) * Math.exp(-time / 0.6);
  }
  for (let index = 0; index < length; index += 1) {
    samples[index] = (samples[index] ?? 0) * 0.6 * (hit.velocity ?? 1);
  }
  return samples;
}

/** Rising noise riser that leads into the loop downbeat or a big wave. */
export function riserVoice(seconds: number, seed = 0): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  const random = mulberry32(seed);
  const filter = new Biquad();
  for (let index = 0; index < length; index += 1) {
    const progress = index / length;
    if (index % 32 === 0) {
      filter.setBandpass(300 + 5200 * progress ** 2, 1.6);
    }
    const noise = whiteNoise(random);
    const tone = Math.sin(2 * Math.PI * (220 + 660 * progress) * (index / SAMPLE_RATE));
    samples[index] = filter.process(noise) * progress ** 2 * 0.8 + tone * progress ** 3 * 0.1;
  }
  return samples;
}

/** Deep cinematic boom for boss/defeat moments: 90 Hz drop plus low noise. */
export function boomVoice(seconds = 0.9, seed = 0): Float32Array {
  const samples = pitchDropVoice(95, 33, seconds, 0.42, 0.35);
  const rumble = noiseBurst(seconds, 'lowpass', 180, 0.8, 0.35, seed);
  const mixed = addSamples(samples, rumble);
  return saturate(mixed, 1.4);
}

/** Short wooden/metal click used by UI taps and card placement. */
export function clickVoice(frequencyHz = 1800, seconds = 0.045, seed = 0): Float32Array {
  const samples = noiseBurst(seconds, 'bandpass', frequencyHz, 1.2, 0.012, seed);
  const length = samples.length;
  const tick = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    tick[index] = Math.sin(2 * Math.PI * frequencyHz * time) * Math.exp(-time / 0.008);
  }
  return addSamples(samples, tick);
}

/** Soft attack "pew" used by several attack SFX. */
export function zapVoice(fromHz: number, toHz: number, seconds: number, gain = 1): Float32Array {
  const tone = renderTone({
    wave: 'pulse',
    frequency: fromHz,
    seconds,
    gain: 0.4 * gain,
    attack: 0.003,
    decay: 0.08,
    sustain: 0.4,
    release: 0.05,
    duty: 0.25,
    sweepToFrequency: toHz,
    sweepSeconds: seconds * 0.9,
    sweepExponent: 0.7,
    cutoffFromHz: 7000,
    cutoffToHz: 2200,
  });
  return tone;
}

/** Watery descending bloop used by splash/toxic sounds. */
export function bloopVoice(fromHz: number, toHz: number, seconds: number): Float32Array {
  return pitchDropVoice(fromHz, toHz, seconds, seconds * 0.5, seconds * 0.45);
}

/** Short metallic ring: inharmonic sine partials with a fast decay. */
export function pingVoice(frequencyHz: number, seconds: number, gain = 1): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  const ratios = [1, 1.58, 2.31, 3.02];
  const levels = [1, 0.5, 0.28, 0.14];
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    let value = 0;
    for (let partial = 0; partial < ratios.length; partial += 1) {
      value +=
        Math.sin(2 * Math.PI * frequencyHz * (ratios[partial] ?? 1) * time) *
        (levels[partial] ?? 0) *
        Math.exp(-time / (0.25 / (partial + 1)));
    }
    samples[index] = value * 0.3 * gain;
  }
  return samples;
}

/** Deterministic two-tone horn used for the wave warning and boss entry. */
export function hornVoice(seconds: number, gain = 1): Float32Array {
  const length = Math.max(1, secondsToSamples(seconds));
  const samples = new Float32Array(length);
  const base = midiToHz(45);
  const fifth = midiToHz(52);
  let phase = 0;
  let phaseFifth = 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const attack = Math.min(1, time / 0.05);
    const release = Math.min(1, (seconds - time) / 0.18);
    const vibrato = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * time);
    phase = (phase + (base * vibrato) / SAMPLE_RATE) % 1;
    phaseFifth = (phaseFifth + (fifth * vibrato) / SAMPLE_RATE) % 1;
    const brass =
      (2 * phase - 1) * 0.5 +
      Math.sin(2 * Math.PI * phaseFifth) * 0.35 +
      Math.sin(2 * Math.PI * phase * 2) * 0.15;
    samples[index] = brass * attack * release * gain * 0.4;
  }
  applyLowpass(samples, 2200, 0.8);
  return saturate(samples, 1.2);
}
