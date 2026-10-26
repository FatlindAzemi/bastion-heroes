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

The hand-written SVG icons in [`public/icons/`](public/icons/), the app icon in
[`public/app-icon/`](public/app-icon/) and the sprite atlases in [`public/sprites/`](public/sprites/)
are created for this project and are not third-party assets. The sprites are rendered from the
project's own rigged Blender models by `tools/sprites/build_sprites.py` (spec 12.12); the icons and
the app icon are hand-authored SVG/scripts in this repository.

## Audio

The soundtrack and all SFX are **procedurally generated for this project** by
`tools/audio/generate.ts` (`npm run audio`, spec 9.9 and 12.13). No third-party samples, loops or
packs are bundled. The committed files in [`public/audio/`](public/audio/) are the direct output of
the generator and are original work of this repository.

- Music (OGG Vorbis + M4A AAC, 144 BPM, A minor): `menu`, `world1_calm`, `world1_big_wave`,
  `victory`, `defeat`. The three loops are 32 bars (53.333 s) with a seamless whole-bar boundary;
  the stings are 3.000 s.
- SFX (36 ids, M4A AAC 96 kbps): 0.09-1.90 s each, all under 50 KB, peak at or below -1 dBFS.
- The generator is deterministic (seeded PRNG); `npm run audio:verify` rebuilds the files and checks
  exact loop lengths, true peak, bitrate and loop seams. Rebuilds are byte-identical.
- The old Kenney CC0 placeholder set was removed together with the procedural replacement.

The generated waveform data is not a derivative of any third-party recording.

## Other assets

Third-party models and portraits are listed in their own sections as the M3 asset pipeline adds
them (issues #66/#67/#69-#72 and #73); audio is covered above.
