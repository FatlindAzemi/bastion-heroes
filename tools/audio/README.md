# Procedural audio (`tools/audio/`)

The committed soundtrack and SFX of Bastion Heroes are **synthesised from scratch** by this
folder (issue #114 §5, spec 9.9/12.11). It replaces the old Kenney CC0 placeholder pipeline
(`assets-src/audio/` + `tools/build-assets/audio.ts`): there are no third-party samples in the
bundle any more, only code and data.

The recreation target is the fast 16-bit chiptune-orchestral hybrid of the portrait relaunch:
GBA/SNES-style pulse, triangle and noise voices for the melody and character, layered with
modern punchy drums, a saturated sub bass and a glue limiter for the arcade feel.

## Commands

```sh
npm run audio                                                  # render, encode, verify everything
npx tsx tools/audio/generate.ts --only=menu,orb_collect        # iterate on a few ids
npx tsx tools/audio/generate.ts --skip-encode                  # WAV masters only
npx tsx tools/audio/generate.ts --skip-verify                  # render + encode only
npx tsx tools/audio/generate.ts --verify-only                  # verify the committed files only
```

`package.json` gains one script for this:

```json
"audio": "tsx tools/audio/generate.ts"
```

Requirements: Node 24 + `tsx`, and FFmpeg/FFprobe on `PATH` (override with `FFMPEG_PATH` /
`FFPROBE_PATH`). OGG uses FFmpeg's bundled native Vorbis encoder (`-strict -2`, 48 kHz stereo).
M4A uses the AudioToolbox AAC encoder (`aac_at`) when the FFmpeg build provides it and falls back
to the native `aac` encoder otherwise (`AUDIO_AAC_ENCODER` overrides). `AUDIO_OGG_QUALITY`
overrides the Vorbis quality (default 3).

Intermediates go to the git-ignored `assets-build/audio/` folder: `wav/` holds the 48 kHz
stereo masters, `decoded/` the lossy files decoded back to PCM for verification, and
`verification.json` the machine-readable report. Only `public/audio/**` is committed.

Rebuilds are byte-reproducible: the synthesis uses seeded PRNGs only, and the Ogg muxer's random
bitstream serial is normalised after encoding (every page is rewritten with a fixed serial and a
recomputed CRC, so the Vorbis payload is untouched). Re-running the generator twice produces
identical WAV, OGG and M4A bytes.

## Musical design

- **Key and tempo:** A minor, 144 BPM. At 48 kHz one 16th is exactly 5,000 samples, so every
  loop is sample-exact on the bar grid.
- **Progression:** the heroic i-VI-III-VII axis (Am-F-C-G), a lift (F-G-Am-Am / F-G-C-E with
  E major as the dominant) and a iv-VI-i-V bridge (Dm-F-Am-E) that sets up the loop restart.
- **Form:** each loop is 32 bars = 4 × 8-bar sections (A / B / A' / C) = 53.333 s. A recurring
  hero motif is stated in the menu theme, answered in the B phrase and reworked in World 1;
  the C section is a build that drops back into the loop downbeat.
- **The big-wave track is an intensity layer, not an alternate song:** `src/platform/audio.ts`
  plays `world1_big_wave` on top of `world1_calm`, so it has the same tempo, key and 32-bar grid,
  no lead melody (it must not fight the calm lead) and adds double kick, 16th hats, snare/tom
  fills, shakers, octave bass and a high 16th arpeggio. Its master is 4 dB quieter (peak -7 vs
  -2.5 dBFS) so the combined mix at the manifest gains (calm 1.0 + layer 0.8 at music volume 0.6)
  peaks around -4.4 dBFS with no clipping.
- **Instrumentation:** polyBLEP pulse lead (vibrato, detuned second pulse), NES triangle + sine
  sub bass, detuned saw string pad, brass/string stabs, 12.5 % pulse arpeggio, then synthesised
  modern drums (pitch-swept kick with click, body+crack snare, claps, band-limited noise hats,
  toms, crash) and a sidechain duck on bass/pad. Effects: ping-pong delay on lead/arp, a small
  Schroeder room, 16-bit-style 15.5 kHz band limit on the percussion.
- **Stings:** victory is a 3.000 s A-major fanfare (rising 16ths, D and E major stabs, ringing
  A major); defeat is a 3.000 s descending A-minor line over low strings and a boom. Both fade
  to true silence so Howler's 3 s one-shot timer never clicks.

## SFX design

Every one of the 36 manifest ids in `src/platform/audioManifest.ts` has a recipe in `sfx.ts`
(the `Record<SfxId, ...>` table makes a missing id a compile error). Each sound follows the same
recipe: a bright chiptune transient for the retro read plus a modern sub thump, noise crack or
metallic ring for the punch. Families: UI taps/blips, card place/merge/flip (rarity-scaled chime
runs), shovel, orb drop/collect, five attacks, three hits, four combos, enemy/defender deaths,
trap, wave horn, boss roar, chest shake/open, upgrade, level win/lose. Durations are 0.09-1.9 s;
only `chest_open`, `level_win` and `level_lose` exceed the 1.5 s spec 12.11 budget, which issue
#114 explicitly allows (all stay under 2 s and under 50 KB).

## Verification

`generate.ts` runs `verify.ts` unless `--skip-verify` is passed. It does not trust the renderer:
it probes the committed files with FFprobe, decodes them back to PCM, and checks the acceptance
numbers of the task:

- music loops: exactly 32 bars (2,560,000 samples) and stings exactly 3.000 s;
- every committed file (music OGG + M4A, SFX M4A): decoded peak and EBU R128 true peak at or
  below -1 dBFS, 48 kHz stereo, expected bitrate window;
- loop seam: the wrap step (last sample → first sample) is compared with the median
  sample-to-sample movement in the 30 ms around the seam, on the WAV master **and** on the
  decoded OGG. `foldTail` folds the 3 s render tail back onto the loop start, so the seam must
  behave like the steady state of one bar-grid period. Current values are -41…-44 dBFS on the
  masters and -35…-40 dBFS after Vorbis decoding (< 2 × local movement);
- SFX: file exists, under the 50 KB and 2 s (1.5 s unless allowed) budgets, decoded peak and
  true peak below -1 dBFS;
- music size: 3.33 MB total (2-4 MB target); SFX 330 KB total.

AAC adds encoder padding: FFmpeg's CLI decodes the M4A 20 ms longer than the master, but the
container declares 2,560,032 valid frames (0.67 ms beyond the loop), which is what
`decodeAudioData` in Chrome and AVFoundation/CoreAudio in Safari play — the M4A loop is therefore
sample-exact within a sub-millisecond tolerance, while the OGG decodes exactly to the loop length.
