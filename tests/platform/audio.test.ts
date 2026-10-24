import { readdirSync, statSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests of the howler wrapper (spec 9.9). Howler itself is faked, so the tests
 * cover the rules without a browser or a real audio device: volume defaults, the
 * first-gesture unlock, the music crossfade, the big-wave layer, the 30 % sting duck,
 * the SFX budget and the manifest catalogue.
 */

const fake = vi.hoisted(() => {
  interface FadeCall {
    readonly from: number;
    readonly to: number;
    readonly durationMs: number;
  }

  class FakeHowl {
    readonly src: readonly string[];
    readonly loop: boolean;
    plays = 0;
    stops = 0;
    pauses = 0;
    unloads = 0;
    readonly fades: FadeCall[] = [];
    private volumeValue: number;
    private playingState = false;

    constructor(options: {
      readonly src: readonly string[];
      readonly loop?: boolean;
      readonly volume?: number;
    }) {
      this.src = options.src;
      this.loop = options.loop ?? false;
      this.volumeValue = options.volume ?? 1;
      howls.push(this);
    }

    volume(value?: number): number | this {
      if (value === undefined) {
        return this.volumeValue;
      }
      this.volumeValue = value;
      return this;
    }

    play(): number {
      this.plays += 1;
      this.playingState = true;
      return 1;
    }

    pause(): void {
      this.pauses += 1;
      this.playingState = false;
    }

    stop(): void {
      this.stops += 1;
      this.playingState = false;
    }

    fade(from: number, to: number, durationMs: number): void {
      this.fades.push({ from, to, durationMs });
      this.volumeValue = to;
    }

    playing(): boolean {
      return this.playingState;
    }

    unload(): void {
      this.unloads += 1;
      this.playingState = false;
    }
  }

  const howls: FakeHowl[] = [];
  const resume = vi.fn(() => Promise.resolve());
  return {
    howls,
    FakeHowl,
    resume,
    context: { state: 'suspended' as string, resume },
  };
});

vi.mock('howler', () => ({
  Howl: fake.FakeHowl,
  Howler: { autoUnlock: true, ctx: fake.context },
}));

import {
  getAudioStatus,
  getVolumes,
  playMusic,
  playSfx,
  resetAudioForTests,
  setBigWaveIntensity,
  setVolumes,
  stopMusic,
  unlockAudio,
} from '../../src/platform/audio';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  MUSIC_DEFINITIONS,
  SFX_DEFINITIONS,
  STING_DUCK_FACTOR,
  type MusicId,
  type SfxId,
} from '../../src/platform/audioManifest';
import { lastHapticStrength, playHaptic, resetHapticsForTests } from '../../src/platform/haptics';

/** Finds one fake Howl by its first source file name. */
function howlFor(file: string): (typeof fake.howls)[number] | undefined {
  return fake.howls.find((howl) => howl.src[0]?.endsWith(file));
}

beforeEach(() => {
  resetAudioForTests();
  resetHapticsForTests();
  fake.howls.length = 0;
  fake.resume.mockClear();
  vi.useFakeTimers();
});

describe('audio volumes (spec 9.9)', () => {
  it('defaults to music 0.6 and SFX 0.8', () => {
    expect(getVolumes()).toEqual({ music: 0.6, sfx: 0.8 });
    expect(DEFAULT_MUSIC_VOLUME).toBe(0.6);
    expect(DEFAULT_SFX_VOLUME).toBe(0.8);
  });

  it('clamps changed volumes to 0..1 and returns them', () => {
    expect(setVolumes({ music: 2, sfx: -3 })).toEqual({ music: 1, sfx: 0 });
    expect(setVolumes({ music: 0.25 })).toEqual({ music: 0.25, sfx: 0 });
  });

  it('applies a volume change to a cached SFX and the playing music', () => {
    unlockAudio();
    playMusic('world1_calm');
    playSfx('button_tap');
    const music = howlFor('world1_calm.m4a');
    const sfx = howlFor('button_tap.m4a');
    setVolumes({ music: 0.5, sfx: 1 });
    expect(music?.volume()).toBe(0.5);
    expect(sfx?.volume()).toBeCloseTo(SFX_DEFINITIONS.button_tap.gain, 6);
  });
});

describe('first-gesture unlock (spec 6.3)', () => {
  it('does not create any Howl before a user gesture', () => {
    expect(playSfx('button_tap')).toBe(false);
    playMusic('menu');
    expect(fake.howls).toHaveLength(0);
    expect(getAudioStatus()).toMatchObject({ unlocked: false, music: null });
  });

  it('resumes the context and starts the queued music on unlock', () => {
    playMusic('menu');
    unlockAudio();
    expect(fake.resume).toHaveBeenCalled();
    const music = howlFor('menu.m4a');
    expect(music?.plays).toBe(1);
    expect(music?.loop).toBe(true);
    expect(music?.fades.at(-1)).toMatchObject({ to: 0.6 });
    expect(getAudioStatus()).toMatchObject({ unlocked: true, music: 'menu' });
  });

  it('queues a queued victory sting until the first gesture', () => {
    playMusic('victory');
    expect(fake.howls).toHaveLength(0);
    unlockAudio();
    expect(howlFor('victory.m4a')?.plays).toBe(1);
    expect(getAudioStatus().sting).toBe('victory');
  });
});

describe('music and big-wave layer (spec 9.9)', () => {
  beforeEach(() => {
    unlockAudio();
  });

  it('crossfades from one track to the next and stops the old one', () => {
    playMusic('menu');
    playMusic('world1_calm');
    const menu = howlFor('menu.m4a');
    const calm = howlFor('world1_calm.m4a');
    expect(calm?.plays).toBe(1);
    expect(calm?.loop).toBe(true);
    vi.advanceTimersByTime(700);
    expect(menu?.stops).toBe(1);
    expect(getAudioStatus().music).toBe('world1_calm');
  });

  it('fades the big-wave layer in over World 1 calm and out again', () => {
    playMusic('world1_calm');
    setBigWaveIntensity(true);
    const layer = howlFor('world1_big_wave.m4a');
    expect(layer?.loop).toBe(true);
    expect(layer?.plays).toBe(1);
    expect(layer?.fades.at(-1)).toMatchObject({ to: 0.48 });
    setBigWaveIntensity(false);
    vi.advanceTimersByTime(700);
    expect(layer?.pauses).toBe(1);
    expect(getAudioStatus().bigWaveIntensity).toBe(false);
  });

  it('keeps the intensity layer for the final wave', () => {
    playMusic('world1_calm');
    setBigWaveIntensity(true);
    setBigWaveIntensity(true);
    expect(fake.howls.filter((howl) => howl.src[0]?.endsWith('world1_big_wave.m4a'))).toHaveLength(
      1,
    );
  });

  it('forgets the pending track on stopMusic', () => {
    playMusic('menu');
    stopMusic();
    expect(getAudioStatus().music).toBeNull();
    vi.advanceTimersByTime(700);
    expect(howlFor('menu.m4a')?.stops).toBe(1);
  });
});

describe('victory/defeat sting ducking (spec 9.9)', () => {
  beforeEach(() => {
    unlockAudio();
    playMusic('world1_calm');
  });

  it('ducks the loop to 30 % and plays a one-shot 3 s sting', () => {
    playMusic('victory');
    const calm = howlFor('world1_calm.m4a');
    const sting = howlFor('victory.m4a');
    expect(sting?.loop).toBe(false);
    expect(sting?.plays).toBe(1);
    expect(calm?.volume()).toBeCloseTo(0.6 * STING_DUCK_FACTOR, 6);
    expect(getAudioStatus()).toMatchObject({ sting: 'victory', ducked: true });
    vi.advanceTimersByTime(3000);
    expect(sting?.stops).toBe(1);
    expect(calm?.volume()).toBeCloseTo(0.6, 6);
    expect(getAudioStatus()).toMatchObject({ sting: null, ducked: false });
  });

  it('does not keep a stale sting when stopMusic is called', () => {
    playMusic('defeat');
    stopMusic();
    vi.advanceTimersByTime(5000);
    expect(getAudioStatus()).toMatchObject({ sting: null, ducked: false, music: null });
  });
});

describe('SFX playback (spec 9.9)', () => {
  it('plays a catalogued SFX after unlock with its mixing gain', () => {
    unlockAudio();
    expect(playSfx('card_select')).toBe(true);
    expect(playSfx('card_select')).toBe(true);
    const howl = howlFor('card_select.m4a');
    expect(howl?.plays).toBe(2);
    expect(howl?.volume()).toBeCloseTo(0.8 * SFX_DEFINITIONS.card_select.gain, 6);
  });

  it('covers every documented SFX with a definition and a committed file', () => {
    const ids = Object.keys(SFX_DEFINITIONS) as SfxId[];
    expect(ids).toHaveLength(36);
    const files = readdirSync('public/audio/sfx');
    for (const id of ids) {
      expect(files).toContain(`${id}.m4a`);
      const bytes = statSync(`public/audio/sfx/${id}.m4a`).size;
      expect(bytes, `${id}.m4a is under the 50 KB budget of spec 12.11`).toBeLessThan(50 * 1024);
    }
  });

  it('ships both music formats for every track', () => {
    const ids = Object.keys(MUSIC_DEFINITIONS) as MusicId[];
    const files = readdirSync('public/audio/music');
    for (const id of ids) {
      expect(files).toContain(`${id}.m4a`);
      expect(files).toContain(`${id}.ogg`);
    }
  });
});

describe('haptics stub (spec 9.9, 6.3)', () => {
  it('records the requested strength without a device plugin', () => {
    expect(lastHapticStrength()).toBeNull();
    playHaptic('medium');
    expect(lastHapticStrength()).toBe('medium');
  });
});
