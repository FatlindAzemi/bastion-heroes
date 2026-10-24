# Placeholder audio sources (spec 9.9, 12.11)

These WAV files are the committed sources of the placeholder audio. `tools/build-assets/audio.ts`
encodes them to `public/audio/` (AAC 128 kbps music M4A + OGG, AAC 96 kbps SFX M4A) and enforces
the spec 12.11 SFX budget (< 1.5 s, < 50 KB). The wrapper that plays them is
`src/platform/audio.ts`; the catalogue (music ids, 36 SFX ids, volume gains) is
`src/platform/audioManifest.ts`.

## Origin and license

Every source sound comes from [Kenney](https://kenney.nl) audio packs released under **CC0 1.0**
(public domain). The files below are derivatives (decoded, trimmed, resampled, crossfaded, looped)
of those CC0 files and stay CC0. See the Audio section of [`CREDITS.md`](../../CREDITS.md) for the
source URLs and the bundled-file attribution.

| Pack             | Original folder in the pack                                   |
| ---------------- | ------------------------------------------------------------- |
| Interface Sounds | `Audio/`                                                      |
| Casino Audio     | `Audio/`                                                      |
| Impact Sounds    | `Audio/`                                                      |
| RPG Audio        | `Audio/`                                                      |
| Music Jingles    | `Audio/<Family> jingles/` (8-Bit, Hit, Pizzicato, Sax, Steel) |

The original OGG files are not committed; only the small WAV sources below are.

## SFX sources (`assets-src/audio/sfx/<id>.wav`)

Each file is produced from one original Kenney OGG with:

```sh
ffmpeg -y -v error -i <pack>/Audio/<file>.ogg -ac 1 -ar 32000 -c:a pcm_s16le \
  -af "silenceremove=start_periods=1:start_threshold=-50dB:detection=peak" \
  -t 1.5 assets-src/audio/sfx/<id>.wav
```

| SFX id                                                       | Pack             | Original file                                                              |
| ------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------- |
| `card_select`                                                | Interface Sounds | `select_002.ogg`                                                           |
| `button_tap`                                                 | Interface Sounds | `click_002.ogg`                                                            |
| `card_merge`                                                 | Interface Sounds | `confirmation_002.ogg`                                                     |
| `upgrade`                                                    | Interface Sounds | `confirmation_003.ogg`                                                     |
| `wave_horn`                                                  | Interface Sounds | `confirmation_004.ogg`                                                     |
| `orb_drop`                                                   | Interface Sounds | `drop_002.ogg`                                                             |
| `attack_beam`                                                | Interface Sounds | `bong_001.ogg`                                                             |
| `hit_arcane` / `combo_chain` / `combo_steam` / `combo_toxic` | Interface Sounds | `pluck_002.ogg` / `select_007.ogg` / `scratch_001.ogg` / `scratch_003.ogg` |
| `card_place`                                                 | Casino Audio     | `card-place-2.ogg`                                                         |
| `shovel`                                                     | Casino Audio     | `card-shove-2.ogg`                                                         |
| `chest_shake`                                                | Casino Audio     | `dice-shake-1.ogg`                                                         |
| `chest_open`                                                 | Casino Audio     | `cards-pack-open-1.ogg`                                                    |
| `card_flip_common` … `card_flip_mythic`                      | Casino Audio     | `card-slide-1.ogg` … `card-slide-5.ogg`                                    |
| `attack_splash`                                              | Impact Sounds    | `impactSoft_heavy_000.ogg`                                                 |
| `hit_pierce`                                                 | Impact Sounds    | `impactMetal_light_000.ogg`                                                |
| `hit_blast`                                                  | Impact Sounds    | `impactPunch_heavy_000.ogg`                                                |
| `boss_roar`                                                  | Impact Sounds    | `impactPunch_heavy_001.ogg`                                                |
| `combo_shatter`                                              | Impact Sounds    | `impactGlass_heavy_000.ogg`                                                |
| `enemy_death`                                                | Impact Sounds    | `impactSoft_heavy_001.ogg`                                                 |
| `defender_death`                                             | Impact Sounds    | `impactMetal_heavy_000.ogg`                                                |
| `trap`                                                       | Impact Sounds    | `impactMetal_medium_000.ogg`                                               |
| `orb_collect`                                                | RPG Audio        | `handleCoins.ogg`                                                          |
| `attack_straight` / `attack_diagonal`                        | RPG Audio        | `knifeSlice.ogg` / `knifeSlice2.ogg`                                       |
| `attack_lob`                                                 | RPG Audio        | `cloth2.ogg`                                                               |
| `enemy_groan`                                                | RPG Audio        | `creak1.ogg`                                                               |
| `enemy_eat`                                                  | RPG Audio        | `chop.ogg`                                                                 |
| `level_win`                                                  | Music Jingles    | `8-Bit jingles/jingles_NES00.ogg`                                          |
| `level_lose`                                                 | Music Jingles    | `Sax jingles/jingles_SAX07.ogg`                                            |

## Music sources (`assets-src/audio/music/<id>.wav`)

The loops are 8 s mono 32 kHz edits that crossfade five jingles of one family (0.25 s crossfades),
then loop the result to 8 s and fade the ends:

```sh
# menu: PIZZI family · world1_calm: SAX family · world1_big_wave: STEEL family
FAMILY="Pizzicato jingles"; N=(00 04 08 12 16)
ffmpeg -y -v error \
  -i "$FAMILY/jingles_PIZZI00.ogg" -i "$FAMILY/jingles_PIZZI04.ogg" \
  -i "$FAMILY/jingles_PIZZI08.ogg" -i "$FAMILY/jingles_PIZZI12.ogg" \
  -i "$FAMILY/jingles_PIZZI16.ogg" \
  -filter_complex "[0:a][1:a]acrossfade=d=0.25:c1=tri:c2=tri[a];[a][2:a]acrossfade=d=0.25[b];[b][3:a]acrossfade=d=0.25[c];[c][4:a]acrossfade=d=0.25[d]" \
  -map "[d]" -ac 1 -ar 32000 /tmp/menu.wav
ffmpeg -y -v error -stream_loop 5 -i /tmp/menu.wav -t 8 -ac 1 -ar 32000 -c:a pcm_s16le \
  -af "afade=t=in:st=0:d=0.05,afade=t=out:st=7.9:d=0.1" assets-src/audio/music/menu.wav
```

`victory.wav` crossfades `jingles_NES00`, `NES05` and `NES13` and is trimmed to 3 s (spec 9.9).
`defeat.wav` crossfades `jingles_SAX07` and `SAX03`, slows/lowers them (`asetrate=32000*0.8`) and is
trimmed to 3 s. All music files get a 0.02 s fade-in and a 0.15 s fade-out.

## Building the bundle files

```sh
npx tsx tools/build-assets/audio.ts   # ffmpeg + ffprobe on PATH (FFMPEG_PATH/FFPROBE_PATH override)
```

The tool writes `public/audio/music/*.m4a|.ogg` and `public/audio/sfx/*.m4a`, fails when an SFX is
longer than 1.5 s or 50 KB, and needs ffmpeg with an AAC encoder (and `-c:a vorbis -strict -2` for
the OGG fallback). The music tracks are placeholder loops (spec 9.9/section 17), expected to be
replaced by final audio.
