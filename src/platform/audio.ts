/**
 * Music and SFX wrapper around `howler` (spec 9.9, 10.2). `src/platform/` is the only
 * folder that may import howler (spec 10.4); the UI, renderer and main loop call this
 * module instead.
 *
 * Behaviour from spec 9.9:
 * - music 0.6 and SFX 0.8 by default; `setVolumes` changes either bus,
 * - music ducks to 30 % while the 3 s victory/defeat stings play,
 * - the big-wave intensity layer fades in on top of the World 1 calm track,
 * - no autoplay: nothing is created or played until the first user gesture unlocks the
 *   audio context (`installAudioUnlock`); music requested before that is queued.
 */
import { Howl, Howler } from 'howler';

import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  MUSIC_DEFINITIONS,
  MUSIC_FADE_MS,
  SFX_DEFINITIONS,
  STING_DUCK_FACTOR,
  STING_DURATION_MS,
  isSting,
  musicFiles,
  sfxFiles,
  type MusicId,
  type SfxId,
} from './audioManifest';

/** Current music/SFX bus volumes (spec 9.9 defaults 0.6/0.8). */
export interface AudioVolumes {
  readonly music: number;
  readonly sfx: number;
}

/** Read-only snapshot for settings/debug checks (manual verification of the wrapper). */
export interface AudioStatus {
  readonly unlocked: boolean;
  readonly music: MusicId | null;
  readonly sting: MusicId | null;
  readonly bigWaveIntensity: boolean;
  readonly ducked: boolean;
  readonly volumes: AudioVolumes;
}

interface AudioState {
  unlocked: boolean;
  volumes: AudioVolumes;
  music: MusicId | null;
  pendingMusic: MusicId | null;
  sting: MusicId | null;
  stingTimer: ReturnType<typeof setTimeout> | null;
  bigWaveIntensity: boolean;
  ducked: boolean;
  howls: Map<string, Howl>;
  musicStopTimer: ReturnType<typeof setTimeout> | null;
  intensityStopTimer: ReturnType<typeof setTimeout> | null;
}

const state: AudioState = {
  unlocked: false,
  volumes: { music: DEFAULT_MUSIC_VOLUME, sfx: DEFAULT_SFX_VOLUME },
  music: null,
  pendingMusic: null,
  sting: null,
  stingTimer: null,
  bigWaveIntensity: false,
  ducked: false,
  howls: new Map(),
  musicStopTimer: null,
  intensityStopTimer: null,
};

let autoUnlockConfigured = false;

/** Howler's own auto-unlock would start sound before we decide; we unlock explicitly. */
function configureHowler(): void {
  if (autoUnlockConfigured) {
    return;
  }
  autoUnlockConfigured = true;
  Howler.autoUnlock = false;
}

/** Vite's base path with a trailing slash, so `/audio/...` works on sub-path deploys. */
function basePath(): string {
  const base = import.meta.env.BASE_URL;
  return base.endsWith('/') ? base : `${base}/`;
}

/** Clamps a volume to 0..1; non-finite input becomes 0. */
function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Returns the cached Howl of a key, creating it on first use. */
function howlFor(key: string, files: readonly string[], loop: boolean): Howl {
  const cached = state.howls.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const howl = new Howl({ src: [...files], loop, preload: true, volume: 0 });
  state.howls.set(key, howl);
  return howl;
}

function musicHowl(id: MusicId): Howl {
  return howlFor(`music:${id}`, musicFiles(id, basePath()), MUSIC_DEFINITIONS[id].loop);
}

/** Target volume of a looping track, including the spec 9.9 sting duck. */
function musicVolumeTarget(id: MusicId): number {
  const duck = state.ducked ? STING_DUCK_FACTOR : 1;
  return state.volumes.music * MUSIC_DEFINITIONS[id].gain * duck;
}

/** Resumes the Web Audio context if it exists and is suspended (spec 6.3). */
function resumeAudioContext(): void {
  const context: AudioContext | null = Howler.ctx ?? null;
  if (context !== null && context.state !== 'running') {
    void context.resume();
  }
}

/** Starts a looping track with the spec 9.9 0.7 s crossfade. */
function startMusic(id: MusicId): void {
  const howl = musicHowl(id);
  state.music = id;
  const target = musicVolumeTarget(id);
  howl.volume(0);
  if (!howl.playing()) {
    howl.play();
  }
  howl.fade(0, target, MUSIC_FADE_MS);
}

/** Fades a looping track out and stops it after the crossfade, so two tracks overlap. */
function fadeOutMusic(howl: Howl): void {
  const from = howl.volume() as number;
  howl.fade(from, 0, MUSIC_FADE_MS);
  if (state.musicStopTimer !== null) {
    clearTimeout(state.musicStopTimer);
  }
  state.musicStopTimer = setTimeout(() => {
    howl.stop();
    state.musicStopTimer = null;
  }, MUSIC_FADE_MS);
}

/** Fades the big-wave layer out (and pauses it once silent). */
function fadeOutIntensity(): void {
  const layer = state.howls.get('music:big_wave_layer');
  if (layer === undefined) {
    return;
  }
  const from = layer.volume() as number;
  layer.fade(from, 0, MUSIC_FADE_MS);
  if (state.intensityStopTimer !== null) {
    clearTimeout(state.intensityStopTimer);
  }
  state.intensityStopTimer = setTimeout(() => {
    layer.pause();
    state.intensityStopTimer = null;
  }, MUSIC_FADE_MS);
}

/** Starts/fades the big-wave intensity layer if the World 1 calm track is playing. */
function applyBigWaveIntensity(): void {
  if (!state.unlocked || state.music !== 'world1_calm' || !state.bigWaveIntensity) {
    fadeOutIntensity();
    return;
  }
  const layer = howlFor('music:big_wave_layer', musicFiles('world1_big_wave', basePath()), true);
  const target = state.volumes.music * MUSIC_DEFINITIONS.world1_big_wave.gain;
  if (!layer.playing()) {
    layer.volume(0);
    layer.play();
  }
  layer.fade(layer.volume() as number, target, MUSIC_FADE_MS);
}

/** Ends the active sting and restores the ducked music volume. */
function endSting(): void {
  if (state.sting !== null) {
    state.howls.get(`sting:${state.sting}`)?.stop();
    state.sting = null;
  }
  if (state.stingTimer !== null) {
    clearTimeout(state.stingTimer);
    state.stingTimer = null;
  }
  if (state.ducked) {
    state.ducked = false;
    if (state.music !== null) {
      const music = musicHowl(state.music);
      music.fade(music.volume() as number, musicVolumeTarget(state.music), MUSIC_FADE_MS);
    }
  }
}

/** Plays a one-shot 3 s sting and ducks the looping music to 30 % (spec 9.9). */
function playSting(id: MusicId): void {
  configureHowler();
  if (!state.unlocked) {
    state.pendingMusic = id;
    return;
  }
  endSting();
  if (state.music !== null) {
    state.ducked = true;
    const music = musicHowl(state.music);
    music.fade(music.volume() as number, musicVolumeTarget(state.music), MUSIC_FADE_MS);
  }
  fadeOutIntensity();
  const sting = howlFor(`sting:${id}`, musicFiles(id, basePath()), false);
  sting.volume(state.volumes.music * MUSIC_DEFINITIONS[id].gain);
  sting.play();
  state.sting = id;
  state.stingTimer = setTimeout(() => endSting(), STING_DURATION_MS);
}

/** Plays a looping music track; a victory/defeat id plays its 3 s sting instead. */
export function playMusic(id: MusicId): void {
  configureHowler();
  if (isSting(id)) {
    playSting(id);
    return;
  }
  if (!state.unlocked) {
    state.pendingMusic = id;
    return;
  }
  if (state.music === id) {
    applyBigWaveIntensity();
    return;
  }
  resumeAudioContext();
  const previous = state.music === null ? undefined : state.howls.get(`music:${state.music}`);
  if (previous !== undefined) {
    fadeOutMusic(previous);
  }
  startMusic(id);
  applyBigWaveIntensity();
}

/** Fades all music out and forgets the pending track. */
export function stopMusic(): void {
  const current = state.music === null ? undefined : state.howls.get(`music:${state.music}`);
  if (current !== undefined) {
    fadeOutMusic(current);
  }
  state.music = null;
  state.pendingMusic = null;
  state.bigWaveIntensity = false;
  endSting();
  fadeOutIntensity();
}

/** Starts or fades out the big-wave intensity layer (spec 9.9). */
export function setBigWaveIntensity(on: boolean): void {
  state.bigWaveIntensity = on;
  applyBigWaveIntensity();
}

/** Plays one SFX; returns false while the audio context is still locked (spec 6.3). */
export function playSfx(id: SfxId): boolean {
  configureHowler();
  if (!state.unlocked) {
    return false;
  }
  const definition = SFX_DEFINITIONS[id];
  resumeAudioContext();
  const howl = howlFor(`sfx:${id}`, sfxFiles(id, basePath()), false);
  howl.volume(state.volumes.sfx * definition.gain);
  howl.play();
  return true;
}

/** Changes one or both buses (spec 9.9); returns the clamped volumes. */
export function setVolumes(partial: Partial<AudioVolumes>): AudioVolumes {
  if (partial.music !== undefined) {
    state.volumes = { ...state.volumes, music: clampVolume(partial.music) };
  }
  if (partial.sfx !== undefined) {
    state.volumes = { ...state.volumes, sfx: clampVolume(partial.sfx) };
  }
  if (state.music !== null) {
    musicHowl(state.music).volume(musicVolumeTarget(state.music));
  }
  for (const [key, howl] of state.howls) {
    if (key.startsWith('sfx:')) {
      const id = key.slice('sfx:'.length) as SfxId;
      howl.volume(state.volumes.sfx * SFX_DEFINITIONS[id].gain);
    }
  }
  return getVolumes();
}

/** The current volume defaults/overrides. */
export function getVolumes(): AudioVolumes {
  return { ...state.volumes };
}

/** Read-only playback state for debug checks and manual verification. */
export function getAudioStatus(): AudioStatus {
  return {
    unlocked: state.unlocked,
    music: state.music,
    sting: state.sting,
    bigWaveIntensity: state.bigWaveIntensity,
    ducked: state.ducked,
    volumes: getVolumes(),
  };
}

/** Unlocks/resumes the audio context on the first user gesture (spec 6.3). */
export function unlockAudio(): void {
  configureHowler();
  if (state.unlocked) {
    return;
  }
  state.unlocked = true;
  resumeAudioContext();
  if (state.pendingMusic !== null) {
    const pending = state.pendingMusic;
    state.pendingMusic = null;
    playMusic(pending);
  }
  // The pending track creates the context on first use; resume it once more.
  resumeAudioContext();
}

/** Binds the first pointerdown/keydown unlock; no-op outside a browser (unit tests). */
export function installAudioUnlock(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const unlock = (): void => {
    unlockAudio();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}

/** Test-only reset: unloads every Howl and restores the spec 9.9 defaults. */
export function resetAudioForTests(): void {
  for (const howl of state.howls.values()) {
    howl.unload();
  }
  state.howls.clear();
  if (state.stingTimer !== null) {
    clearTimeout(state.stingTimer);
  }
  if (state.musicStopTimer !== null) {
    clearTimeout(state.musicStopTimer);
  }
  if (state.intensityStopTimer !== null) {
    clearTimeout(state.intensityStopTimer);
  }
  state.unlocked = false;
  state.volumes = { music: DEFAULT_MUSIC_VOLUME, sfx: DEFAULT_SFX_VOLUME };
  state.music = null;
  state.pendingMusic = null;
  state.sting = null;
  state.stingTimer = null;
  state.bigWaveIntensity = false;
  state.ducked = false;
  state.musicStopTimer = null;
  state.intensityStopTimer = null;
}
