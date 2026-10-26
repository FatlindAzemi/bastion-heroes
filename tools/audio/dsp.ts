/**
 * Deterministic DSP core of the procedural audio tool (issue #114 §5).
 *
 * Every signal is Float32 at 48 kHz. Oscillators are polyBLEP band limited so the
 * pulse and saw voices stay clean at the 64-96 kbps the game ships. The module has
 * no dependency beyond plain typed-array maths, which keeps the render byte-exact
 * and fast enough to rebuild the whole soundtrack in a few seconds.
 */

/** Render sample rate. 48 kHz matches FFmpeg's native Vorbis encoder and AAC. */
export const SAMPLE_RATE = 48_000;
/** Full circle in radians. */
export const TWO_PI = Math.PI * 2;

/** A stereo buffer; `left` and `right` always share the same length. */
export interface StereoBuffer {
  readonly left: Float32Array;
  readonly right: Float32Array;
}

/** Returns a silent stereo buffer of `lengthSamples` samples. */
export function stereoBuffer(lengthSamples: number): StereoBuffer {
  return {
    left: new Float32Array(lengthSamples),
    right: new Float32Array(lengthSamples),
  };
}

/** Equal-tempered MIDI note number -> frequency in Hz (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Clamps `value` to the inclusive range `min..max`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Decibels to linear gain. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** Linear gain to decibels, floored at -180 dB instead of -Infinity. */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-9));
}

/** Seconds to whole samples at `SAMPLE_RATE`. */
export function secondsToSamples(seconds: number): number {
  return Math.round(seconds * SAMPLE_RATE);
}

/** FNV-1a 32-bit hash: seeds one deterministic PRNG per sound effect id. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, deterministic PRNG returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic white noise in -1..1. */
export function whiteNoise(random: () => number): number {
  return random() * 2 - 1;
}

/** One cycle of a sine oscillator at phase 0..1. */
export function sine(phase: number): number {
  return Math.sin(TWO_PI * phase);
}

/** PolyBLEP residual that rounds the jump of a discontinuous waveform. */
function polyBlep(phase: number, increment: number): number {
  if (phase < increment) {
    const position = phase / increment - 1;
    return position * position;
  }
  if (phase > 1 - increment) {
    const position = (phase - 1) / increment + 1;
    return position * position;
  }
  return 0;
}

/** Duty-cycled pulse wave with a polyBLEP-smoothed rising and falling edge. */
export function pulse(phase: number, increment: number, duty: number): number {
  const naive = phase < duty ? 1 : -1;
  return naive + polyBlep(phase, increment) - polyBlep((phase - duty + 1) % 1, increment);
}

/** Saw wave with a polyBLEP-smoothed reset edge. */
export function saw(phase: number, increment: number): number {
  return 2 * phase - 1 - polyBlep(phase, increment);
}

/** Triangle wave (no polyBLEP needed at this harmonic content). */
export function triangle(phase: number): number {
  return 4 * Math.abs(phase - 0.5) - 1;
}

/** Samples of the attack/decay/sustain/release envelope at `time`. */
export function adsr(
  time: number,
  length: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): number {
  if (time < 0 || time > length) {
    return 0;
  }
  if (time < attack) {
    return time / attack;
  }
  if (time < attack + decay) {
    return 1 - ((1 - sustain) * (time - attack)) / decay;
  }
  const releaseStart = Math.max(attack + decay, length - release);
  if (time < releaseStart) {
    return sustain;
  }
  return Math.max(0, sustain * (1 - (time - releaseStart) / release));
}

/** Exponential decay envelope with `tau` seconds as the 1/e time constant. */
export function decayEnvelope(time: number, tau: number): number {
  return time < 0 ? 0 : Math.exp(-time / tau);
}

/** RBJ-cookbook biquad filter with a tiny state; used for tone shaping and sweeps. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  /** Re-tunes the filter as a low-pass with the given cutoff and resonance. */
  setLowpass(frequencyHz: number, q = 0.7): void {
    this.set('lowpass', frequencyHz, q);
  }

  /** Re-tunes the filter as a high-pass with the given cutoff and resonance. */
  setHighpass(frequencyHz: number, q = 0.7): void {
    this.set('highpass', frequencyHz, q);
  }

  /** Re-tunes the filter as a band-pass with the given center and resonance. */
  setBandpass(frequencyHz: number, q = 1): void {
    this.set('bandpass', frequencyHz, q);
  }

  /** Sets the coefficients for one of the three filter shapes. */
  private set(shape: 'lowpass' | 'highpass' | 'bandpass', frequencyHz: number, q: number): void {
    const safeFrequency = clamp(frequencyHz, 10, SAMPLE_RATE * 0.45);
    const omega = (TWO_PI * safeFrequency) / SAMPLE_RATE;
    const cosine = Math.cos(omega);
    const alpha = Math.sin(omega) / (2 * Math.max(0.1, q));
    const a0 = 1 + alpha;
    if (shape === 'lowpass') {
      this.b0 = (1 - cosine) / 2 / a0;
      this.b1 = (1 - cosine) / a0;
      this.b2 = this.b0;
    } else if (shape === 'highpass') {
      this.b0 = (1 + cosine) / 2 / a0;
      this.b1 = -(1 + cosine) / a0;
      this.b2 = this.b0;
    } else {
      this.b0 = alpha / a0;
      this.b1 = 0;
      this.b2 = -alpha / a0;
    }
    this.a1 = (-2 * cosine) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  /** Filters one sample (transposed direct form II). */
  process(input: number): number {
    const output =
      this.b0 * input +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

/** Renders one oscillator voice: pitch envelope, vibrato, ADSR and optional low-pass. */
export type Waveform = 'pulse' | 'saw' | 'triangle' | 'sine';

/** Description of one melodic tone to render. */
export interface Tone {
  readonly wave: Waveform;
  readonly frequency: number;
  readonly seconds: number;
  readonly gain?: number;
  readonly attack?: number;
  readonly decay?: number;
  readonly sustain?: number;
  readonly release?: number;
  readonly duty?: number;
  readonly detuneCents?: number;
  readonly detuneGain?: number;
  readonly vibratoRateHz?: number;
  readonly vibratoDepthCents?: number;
  readonly vibratoDelaySeconds?: number;
  readonly sweepToFrequency?: number;
  readonly sweepSeconds?: number;
  readonly sweepExponent?: number;
  readonly cutoffFromHz?: number;
  readonly cutoffToHz?: number;
  readonly cutoffQ?: number;
  readonly phase?: number;
}

/** Samples one oscillator cycle of the given shape. */
function sampleOscillator(wave: Waveform, phase: number, increment: number, duty: number): number {
  if (wave === 'pulse') {
    return pulse(phase, increment, duty);
  }
  if (wave === 'saw') {
    return saw(phase, increment);
  }
  if (wave === 'triangle') {
    return triangle(phase);
  }
  return sine(phase);
}

/** Frequency of a tone at `time`, including the optional exponential pitch sweep. */
function sweptFrequency(tone: Tone, time: number): number {
  if (tone.sweepToFrequency === undefined) {
    return tone.frequency;
  }
  const duration = Math.max(1e-4, tone.sweepSeconds ?? tone.seconds);
  const progress = Math.min(1, time / duration);
  const curve = progress ** (tone.sweepExponent ?? 1);
  return tone.frequency * (tone.sweepToFrequency / tone.frequency) ** curve;
}

/** Vibrato multiplier at `time` (depth fades in after the configured delay). */
function vibratoFactor(tone: Tone, time: number): number {
  if (tone.vibratoDepthCents === undefined || tone.vibratoDepthCents <= 0) {
    return 1;
  }
  const delay = tone.vibratoDelaySeconds ?? 0;
  const fade = clamp((time - delay) / 0.06, 0, 1);
  const lfo = sine(((tone.vibratoRateHz ?? 5.5) * time) % 1);
  return 2 ** ((tone.vibratoDepthCents * fade * lfo) / 1200);
}

/** Renders a tone to a fresh mono Float32Array (samples outside 0..length stay silent). */
export function renderTone(tone: Tone): Float32Array {
  const length = Math.max(1, secondsToSamples(tone.seconds));
  const samples = new Float32Array(length);
  const gain = tone.gain ?? 1;
  const attack = Math.max(0.001, tone.attack ?? 0.005);
  const decay = Math.max(0.001, tone.decay ?? 0.08);
  const sustain = tone.sustain ?? 0.7;
  const release = Math.max(0.005, tone.release ?? 0.05);
  const detune = 2 ** ((tone.detuneCents ?? 0) / 1200);
  const detuneGain = tone.detuneGain ?? 0;
  let phase = tone.phase ?? 0;
  let detunePhase = (phase + 0.37) % 1;
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const frequency = sweptFrequency(tone, time) * vibratoFactor(tone, time);
    const increment = Math.min(0.45, frequency / SAMPLE_RATE);
    phase = (phase + increment) % 1;
    let value = sampleOscillator(tone.wave, phase, increment, tone.duty ?? 0.5);
    if (detuneGain > 0) {
      detunePhase = (detunePhase + increment * detune) % 1;
      value += detuneGain * sampleOscillator(tone.wave, detunePhase, increment, tone.duty ?? 0.5);
    }
    const envelope = adsr(time, tone.seconds, attack, decay, sustain, release);
    samples[index] = value * envelope * gain;
  }
  if (tone.cutoffFromHz !== undefined) {
    applySweepLowpass(
      samples,
      tone.cutoffFromHz,
      tone.cutoffToHz ?? tone.cutoffFromHz,
      tone.cutoffQ ?? 0.7,
    );
  }
  return samples;
}

/** Applies an exponential low-pass sweep, re-tuning the biquad every 32 samples. */
export function applySweepLowpass(
  samples: Float32Array,
  fromHz: number,
  toHz: number,
  q = 0.7,
): void {
  const filter = new Biquad();
  const blockSize = 32;
  for (let start = 0; start < samples.length; start += blockSize) {
    const progress = samples.length <= 1 ? 0 : start / (samples.length - 1);
    filter.setLowpass(fromHz * (toHz / fromHz) ** progress, q);
    const end = Math.min(samples.length, start + blockSize);
    for (let index = start; index < end; index += 1) {
      samples[index] = filter.process(samples[index] ?? 0);
    }
  }
}

/** Filters samples in place through a fresh high-pass biquad. */
export function applyHighpass(samples: Float32Array, frequencyHz: number, q = 0.7): void {
  const filter = new Biquad();
  filter.setHighpass(frequencyHz, q);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = filter.process(samples[index] ?? 0);
  }
}

/** Filters samples in place through a fresh band-pass biquad. */
export function applyBandpass(samples: Float32Array, frequencyHz: number, q = 1): void {
  const filter = new Biquad();
  filter.setBandpass(frequencyHz, q);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = filter.process(samples[index] ?? 0);
  }
}

/** Filters samples in place through a fresh low-pass biquad. */
export function applyLowpass(samples: Float32Array, frequencyHz: number, q = 0.7): void {
  const filter = new Biquad();
  filter.setLowpass(frequencyHz, q);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = filter.process(samples[index] ?? 0);
  }
}

/** Constant-power pan gains for a pan position in -1 (left) .. 1 (right). */
export function panGains(pan: number): readonly [number, number] {
  const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

/** Mixes a mono voice into the stereo bus at `startSample` with constant-power pan. */
export function addMono(
  bus: StereoBuffer,
  voice: Float32Array,
  startSample: number,
  pan = 0,
  gain = 1,
): void {
  const start = Math.max(0, Math.round(startSample));
  const [leftGain, rightGain] = panGains(pan);
  const left = bus.left;
  const right = bus.right;
  for (let index = 0; index < voice.length; index += 1) {
    const position = start + index;
    if (position >= left.length) {
      break;
    }
    const value = (voice[index] ?? 0) * gain;
    left[position] = (left[position] ?? 0) + value * leftGain;
    right[position] = (right[position] ?? 0) + value * rightGain;
  }
}

/** Mixes a mono voice with a pan sweep (for stereo whooshes). */
export function addMonoSweep(
  bus: StereoBuffer,
  voice: Float32Array,
  startSample: number,
  fromPan: number,
  toPan: number,
  gain = 1,
): void {
  const start = Math.max(0, Math.round(startSample));
  const count = Math.max(1, voice.length - 1);
  for (let index = 0; index < voice.length; index += 1) {
    const position = start + index;
    if (position >= bus.left.length) {
      break;
    }
    const [leftGain, rightGain] = panGains(fromPan + ((toPan - fromPan) * index) / count);
    const value = (voice[index] ?? 0) * gain;
    bus.left[position] = (bus.left[position] ?? 0) + value * leftGain;
    bus.right[position] = (bus.right[position] ?? 0) + value * rightGain;
  }
}

/** Adds one stereo buffer into another, scaled by `gain`. */
export function mixStereoInto(destination: StereoBuffer, source: StereoBuffer, gain = 1): void {
  for (let index = 0; index < destination.left.length; index += 1) {
    destination.left[index] = (destination.left[index] ?? 0) + (source.left[index] ?? 0) * gain;
    destination.right[index] = (destination.right[index] ?? 0) + (source.right[index] ?? 0) * gain;
  }
}

/** Stereo ping-pong delay; adds the wet signal in place. Tuned for dotted-8th echoes. */
export function pingPongDelay(
  bus: StereoBuffer,
  delaySeconds: number,
  feedback: number,
  wet: number,
): void {
  const delaySamples = Math.max(1, secondsToSamples(delaySeconds));
  const echoLeft = new Float32Array(delaySamples);
  const echoRight = new Float32Array(delaySamples);
  let cursor = 0;
  for (let index = 0; index < bus.left.length; index += 1) {
    const dryLeft = bus.left[index] ?? 0;
    const dryRight = bus.right[index] ?? 0;
    const wetLeft = echoLeft[cursor] ?? 0;
    const wetRight = echoRight[cursor] ?? 0;
    bus.left[index] = dryLeft + wetLeft * wet;
    bus.right[index] = dryRight + wetRight * wet;
    echoLeft[cursor] = dryLeft * 0.6 + wetRight * feedback;
    echoRight[cursor] = dryRight * 0.6 + wetLeft * feedback;
    cursor = (cursor + 1) % delaySamples;
  }
}

/** Small Schroeder-style room: four damped comb delays plus a short stereo offset. */
export function applyReverb(bus: StereoBuffer, wet: number): void {
  const combSeconds = [0.0297, 0.0371, 0.0411, 0.0437];
  const combs = combSeconds.map((seconds) => new Float32Array(secondsToSamples(seconds)));
  const cursors = combSeconds.map(() => 0);
  const damped = combSeconds.map(() => 0);
  const width = new Float32Array(17);
  let widthCursor = 0;
  for (let index = 0; index < bus.left.length; index += 1) {
    const input = ((bus.left[index] ?? 0) + (bus.right[index] ?? 0)) * 0.5;
    let wetSample = 0;
    for (let comb = 0; comb < combs.length; comb += 1) {
      const buffer = combs[comb];
      const cursor = cursors[comb] ?? 0;
      if (buffer === undefined) {
        continue;
      }
      const delayed = buffer[cursor] ?? 0;
      damped[comb] = (damped[comb] ?? 0) * 0.68 + delayed * 0.32;
      buffer[cursor] = input + (damped[comb] ?? 0) * 0.79;
      cursors[comb] = (cursor + 1) % buffer.length;
      wetSample += delayed * 0.25;
    }
    const previous = width[widthCursor] ?? 0;
    width[widthCursor] = wetSample;
    widthCursor = (widthCursor + 1) % width.length;
    bus.left[index] = (bus.left[index] ?? 0) + wetSample * wet;
    bus.right[index] = (bus.right[index] ?? 0) + previous * wet;
  }
}

/** Ducking envelope (modern sidechain compression) triggered by the given sample times. */
export function applySidechain(
  bus: StereoBuffer,
  triggerSamples: readonly number[],
  depth: number,
  releaseSeconds: number,
): void {
  const triggers = [...triggerSamples].sort((a, b) => a - b);
  const attackSeconds = 0.004;
  const release = Math.max(0.02, releaseSeconds);
  let triggerIndex = 0;
  let lastTrigger = -1;
  for (let index = 0; index < bus.left.length; index += 1) {
    while (triggerIndex < triggers.length && (triggers[triggerIndex] ?? Infinity) <= index) {
      lastTrigger = triggers[triggerIndex] ?? lastTrigger;
      triggerIndex += 1;
    }
    const elapsed = (index - lastTrigger) / SAMPLE_RATE;
    const attack = 1 - Math.exp(-Math.max(0, elapsed) / attackSeconds);
    const recovery = Math.exp(-Math.max(0, elapsed) / release);
    const gain = 1 - depth * attack * recovery;
    bus.left[index] = (bus.left[index] ?? 0) * gain;
    bus.right[index] = (bus.right[index] ?? 0) * gain;
  }
}

/** Soft saturation used on the drum bus to glue the transients together. */
export function softClip(samples: Float32Array, drive = 1): void {
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.tanh((samples[index] ?? 0) * drive);
  }
}

/** Peak absolute sample value over both channels. */
export function peakOf(bus: StereoBuffer): number {
  let peak = 0;
  for (let index = 0; index < bus.left.length; index += 1) {
    peak = Math.max(peak, Math.abs(bus.left[index] ?? 0), Math.abs(bus.right[index] ?? 0));
  }
  return peak;
}

/** Scales the buffer so its peak sits at `targetDb`; returns the peak that was measured. */
export function normalizePeak(bus: StereoBuffer, targetDb = -1.5): number {
  const measured = peakOf(bus);
  if (measured <= 1e-9) {
    return 0;
  }
  const gain = dbToGain(targetDb) / measured;
  for (let index = 0; index < bus.left.length; index += 1) {
    bus.left[index] = (bus.left[index] ?? 0) * gain;
    bus.right[index] = (bus.right[index] ?? 0) * gain;
  }
  return 20 * Math.log10(measured);
}

/** Folds the render tail that runs past `loopSamples` back onto the loop start. */
export function foldTail(bus: StereoBuffer, loopSamples: number): void {
  const tail = bus.left.length - loopSamples;
  for (let index = 0; index < tail; index += 1) {
    const source = loopSamples + index;
    if (source >= bus.left.length) {
      break;
    }
    bus.left[index] = (bus.left[index] ?? 0) + (bus.left[source] ?? 0);
    bus.right[index] = (bus.right[index] ?? 0) + (bus.right[source] ?? 0);
  }
}

/** Linear fade-in of `seconds` at the start of the buffer. */
export function fadeIn(bus: StereoBuffer, seconds: number): void {
  const length = Math.min(bus.left.length, secondsToSamples(seconds));
  for (let index = 0; index < length; index += 1) {
    const gain = index / length;
    bus.left[index] = (bus.left[index] ?? 0) * gain;
    bus.right[index] = (bus.right[index] ?? 0) * gain;
  }
}

/** Linear fade-out of `seconds` at the end of the buffer. */
export function fadeOut(bus: StereoBuffer, seconds: number): void {
  const length = Math.min(bus.left.length, secondsToSamples(seconds));
  for (let index = 0; index < length; index += 1) {
    const gain = index / length;
    const position = bus.left.length - 1 - index;
    bus.left[position] = (bus.left[position] ?? 0) * gain;
    bus.right[position] = (bus.right[position] ?? 0) * gain;
  }
}
