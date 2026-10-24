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

## Other assets

No third-party audio, models or portraits are bundled yet. When the M3 asset pipeline adds them
(issues #66, #73, audio), add a row here with name, author, license and source URL.
