# Credits

Bastion Heroes bundles the following third-party assets. Every third-party asset gets a line with
its name, author, license and source URL (spec 12.11). Hand-made assets (SVG icons, UI code, game
data) are not listed.

## Fonts

Both font families are licensed under the SIL Open Font License, Version 1.1. The full license texts
are bundled in [`public/fonts/OFL.txt`](public/fonts/OFL.txt); the fonts are served from the app
bundle and are never loaded from the internet at runtime (spec 9.8).

| Asset                   | Bundled files                          | Author                                  | License                   | Source                                       |
| ----------------------- | -------------------------------------- | --------------------------------------- | ------------------------- | -------------------------------------------- |
| Lilita One, Regular 400 | `public/fonts/LilitaOne-Regular.woff2` | Juan Montoreano                         | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Lilita+One |
| Nunito, Bold 700        | `public/fonts/Nunito-Bold.woff2`       | Vernon Adams, Cyreal, Jacques Le Bailly | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Nunito     |
| Nunito, ExtraBold 800   | `public/fonts/Nunito-ExtraBold.woff2`  | Vernon Adams, Cyreal, Jacques Le Bailly | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Nunito     |

The two Nunito files are static 700/800 instances generated with `fontTools.varLib.instancer` from
the official OFL variable font served by Google Fonts (latin subset, WOFF2). Lilita One is the
official regular WOFF2 (latin subset). No font file was renamed or otherwise modified beyond the
static instantiation.

## Icons

The hand-written SVG icons in [`public/icons/`](public/icons/) were created for this project and are
not third-party assets.

## Audio

The placeholder music and SFX come from five [Kenney](https://kenney.nl) audio packs, all
released under **Creative Commons Zero (CC0 1.0)**. They are placeholder assets (spec 9.9: the
final audio is an open decision, section 17) and are expected to be replaced before release.

| Asset                   | Used for in the bundle                                      | Author | License | Source                                    |
| ----------------------- | ----------------------------------------------------------- | ------ | ------- | ----------------------------------------- |
| Kenney Interface Sounds | UI taps, card/orb SFX, beam attack, wave horn               | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| Kenney Casino Audio     | card place/flip/shove, chest open/shake                     | Kenney | CC0 1.0 | https://kenney.nl/assets/casino-audio     |
| Kenney Impact Sounds    | hit types, splash attack, combos, deaths, trap, boss roar   | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds    |
| Kenney RPG Audio        | attack swings, enemy groan/eat/death, orb collect           | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio        |
| Kenney Music Jingles    | 3 looping tracks, victory/defeat stings, level win/lose SFX | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles    |

Derivation: the Kenney OGG files were decoded, trimmed, resampled to mono 32 kHz WAV sources in
[`assets-src/audio/`](assets-src/audio/) and then encoded to the committed M4A/OGG files by
`tools/build-assets/audio.ts` (spec 12.11). The looping tracks are 8 s placeholder edits that
crossfade several jingles from one family; the two stings are trimmed to 3 s (spec 9.9). The exact
mapping and ffmpeg commands are documented in [`assets-src/audio/README.md`](assets-src/audio/README.md).
These are derivative works of CC0 audio, so they remain CC0.

## Other assets

Third-party models and portraits are listed in their own sections as the M3 asset pipeline adds
them (issues #66/#67/#69-#72 and #73); audio is covered above.
