# Palette texture

`palette.png` is the single shared colour texture of every Bastion Heroes model: one 256×256 PNG
made of 16×16 flat swatches (256 colours). Spec 9.3 (proportions and budgets), 9.4 (the colour
table) and 12.11 (assets) define it. Models never get their own flat colour textures; they are
UV-mapped so that every face samples the centre of one swatch and picks its colour by index.

The generator is `tools/palette/make_palette.py` (spec 9.3), run through Blender's bundled Python
(spec 10.2, 12.2). Do not edit `palette.png` by hand: change the ramps in the script, regenerate,
and let the script's self-check update the table below.

## Swatch index convention

- `index = row * 16 + column`, so index 0 is the bottom-left swatch and index 255 the top-right one.
- **Row 0 is the bottom image row**, because Blender images and OpenGL UVs put the v origin at the
  bottom. Swatch `index` covers the 16×16 pixel block at `x = column * 16`, `y = row * 16`.
- The 256 swatches are 32 material ramps of 8 shades: `ramp = index // 8` and `slot = index % 8`.
  Ramp `r` is in image row `r // 2`, on the left half for even `r` and the right half for odd `r`.
- Slot 0 is the darkest shade and slot 7 the lightest. Each ramp carries the exact spec 9.4 hex on
  its **anchor slot**: slot 3 for most colours, slot 0 for anchors that are already very dark
  (`gloom_shadow`, `ink`) and slot 7 for very bright ones (`frost_snow`, `essence_core`,
  `warm_white`). Other slots mix the anchor 85 % towards ink `#1B1B2F` (darker slots) or 80 %
  towards white (lighter slots), so every character has highlight and shadow shades of its family.

## UV convention (centre-of-swatch)

A model face that should use swatch `index` puts **every UV loop** of that face on the centre of the
swatch:

```
column = index % 16          u = (column + 0.5) / 16
row    = index // 16         v = (row + 0.5) / 16
```

That is why the swatches are flat colours: with all loops of a face on one point, no texture
sampling, mip map or filtering can blend in a neighbour. Blender's glTF exporter flips V for glTF's
top-left UV origin, so the swatch index is the same number in Blender and after export.

## How character scripts reference it

The shared helper library (spec 12.3, `assets-src/blender/lib/palette.py`) exposes
`swatch(index)` and `assign_swatch(obj, index)`; character scripts pass the integer index from the
table below. For example a Forge Clan body with a copper robe, steel plate and orange trim:

```python
from palette import assign_swatch

assign_swatch(robe, 3)    # forge_copper anchor
assign_swatch(plate, 19)  # forge_steel anchor (ramp 2, slot 3)
assign_swatch(trim, 11)   # forge_orange anchor (ramp 1, slot 3)
```

Use anchors for a family's main colour and the neighbouring slots for its highlight (slot +1, +2)
and shadow (slot -1, -2) shades. Never hard-code RGB values in a character script: all colour is a
swatch index, so the whole game can be re-coloured by regenerating this one file.

## Ramps (`index = ramp × 8 + slot`)

| #   | Ramp               | Indices | Anchor | 0       | 1       | 2       | 3       | 4       | 5       | 6       | 7       |
| --- | ------------------ | ------- | ------ | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| 0   | forge_copper       | 0-7     | 3      | #362932 | #674335 | #985C38 | #C8743A | #D49162 | #DFAD8A | #EAC8B1 | #F5E4D9 |
| 1   | forge_orange       | 8-15    | 3      | #3E2D2F | #7F4C2E | #BF6C2D | #FF8A2B | #FFA256 | #FFBA81 | #FFD1AB | #FFE9D6 |
| 2   | forge_steel        | 16-23   | 3      | #2D2F42 | #4C5364 | #6C7887 | #8A9BA8 | #A2B0BA | #BAC4CC | #D1D8DD | #E9ECEF |
| 3   | wildgrove_leaf     | 24-31   | 3      | #263534 | #39633C | #4D9243 | #5FBF4A | #80CD6F | #A0DA93 | #C0E6B8 | #E0F3DC |
| 4   | wildgrove_mushroom | 32-39   | 3      | #3A2332 | #742F35 | #AD3C39 | #E5483B | #EB6E63 | #F0928A | #F6B7B2 | #FBDBD9 |
| 5   | wildgrove_moss     | 40-47   | 3      | #1F2B30 | #244631 | #2A6232 | #2E7D32 | #59985C | #83B285 | #ACCCAE | #D6E6D7 |
| 6   | neon_cyan          | 48-55   | 3      | #1D384D | #1F6C83 | #21A0B9 | #22D3EE | #4FDDF2 | #7BE6F6 | #A8EEF9 | #D4F7FD |
| 7   | neon_magenta       | 56-63   | 3      | #3A224F | #712C88 | #A937C2 | #E040FB | #E767FD | #ED8DFE | #F4B4FE | #FADAFF |
| 8   | neon_violet        | 64-71   | 3      | #2B234F | #46328A | #6240C5 | #7C4DFF | #9772FF | #B195FF | #CCB9FF | #E6DCFF |
| 9   | frost_ice          | 72-79   | 3      | #2F3B4F | #53748A | #78AEC5 | #9BE7FF | #B0EDFF | #C4F2FF | #D8F6FF | #ECFBFF |
| 10  | frost_snow         | 80-87   | 7      | #3D3E4F | #575968 | #717482 | #8C8F9B | #A6AAB4 | #C0C6CD | #DBE1E7 | #F4FBFF |
| 11  | frost_deep         | 88-95   | 3      | #1F294A | #25407B | #2A58AB | #2F6FDB | #5A8DE3 | #83AAEA | #ADC6F2 | #D6E3F9 |
| 12  | hollow_bone        | 96-103  | 3      | #3C3A48 | #787477 | #B4ADA5 | #EFE6D2 | #F3ECDC | #F6F1E5 | #FAF6EE | #FDFBF7 |
| 13  | hollow_royal       | 104-111 | 3      | #282141 | #3E2C61 | #553681 | #6A3FA0 | #8966B4 | #A78DC7 | #C4B3DA | #E2DAED |
| 14  | hollow_soul        | 112-119 | 3      | #2B3E39 | #467F4A | #62BF5B | #7CFF6B | #97FF8A | #B1FFA7 | #CCFFC5 | #E6FFE2 |
| 15  | gloom_shadow       | 120-127 | 0      | #2B1B3D | #443654 | #5C506A | #756A81 | #8D8497 | #A59EAD | #BDB8C3 | #D6D2D9 |
| 16  | gloom_dusk         | 128-135 | 3      | #231F38 | #302548 | #3E2A57 | #4A2F66 | #6F5A86 | #9383A4 | #B8ADC3 | #DCD6E1 |
| 17  | gloom_eye_cyan     | 136-143 | 3      | #213C4F | #2A798A | #34B6C5 | #3CF2FF | #64F6FF | #8BF8FF | #B2FBFF | #D9FDFF |
| 18  | gloom_eye_lime     | 144-151 | 3      | #313E32 | #597F36 | #81BF39 | #A8FF3C | #BAFF64 | #CCFF8B | #DDFFB2 | #EFFFD9 |
| 19  | essence_teal       | 152-159 | 3      | #213C47 | #2A7872 | #33B59E | #3BF0C8 | #63F4D4 | #8AF7DF | #B2FAEA | #D9FDF5 |
| 20  | essence_core       | 160-167 | 7      | #3E3E4F | #5A5A68 | #767682 | #91919B | #ADADB4 | #C9C9CD | #E4E4E7 | #FFFFFF |
| 21  | world1_grass_light | 168-175 | 3      | #2B3936 | #476E41 | #63A44D | #7ED957 | #99E27A | #B3E99B | #CCF1BD | #E6F8DE |
| 22  | world1_grass_dark  | 176-183 | 3      | #283633 | #3F6639 | #56973F | #6CC644 | #8AD26A | #A8DE90 | #C5E9B5 | #E3F5DB |
| 23  | world1_path        | 184-191 | 3      | #393038 | #6E5648 | #A47B57 | #D9A066 | #E2B486 | #E9C7A4 | #F1DAC3 | #F8EDE1 |
| 24  | world1_sky         | 192-199 | 3      | #30384F | #556E8A | #7BA3C5 | #9FD8FF | #B3E1FF | #C6E9FF | #DAF0FF | #EDF8FF |
| 25  | neutral_grey       | 200-207 | 3      | #2D2D3E | #4D4D58 | #6D6D73 | #8C8C8C | #A4A4A4 | #BBBBBB | #D2D2D2 | #E9E9E9 |
| 26  | skin               | 208-215 | 3      | #3C3540 | #79655F | #B6957D | #F2C49B | #F6D1B0 | #F8DDC4 | #FBE8D8 | #FDF4EC |
| 27  | metal              | 216-223 | 3      | #313346 | #595E6F | #818A98 | #A8B4C0 | #BAC4CE | #CCD3DA | #DDE2E7 | #EFF1F3 |
| 28  | wood               | 224-231 | 3      | #2D252F | #4D372E | #6C492D | #8B5A2B | #A37C56 | #BA9D81 | #D2BEAB | #E9DFD6 |
| 29  | bone               | 232-239 | 3      | #3A3845 | #736D6B | #ABA192 | #E3D5B8 | #EADEC7 | #EFE7D5 | #F5EFE4 | #FAF8F2 |
| 30  | ink                | 240-247 | 0      | #1B1B2F | #363648 | #505060 | #6A6A77 | #84848F | #9E9EA7 | #B8B8BF | #D2D2D6 |
| 31  | warm_white         | 248-255 | 7      | #3E3C49 | #5A565E | #767073 | #918B87 | #ADA59C | #C9BFB1 | #E4D9C5 | #FFF2D9 |

Ramps 0-24 are the spec 9.4 colours; `essence_core` is the white core of the essence orb (the spec
gives no hex, so pure white). Ramps 25-31 are neutral and utility ramps (greys, skin, metal, wood,
bone, ink, warm white) so character scripts have shades for props and skin. `ink` is the outline
colour of spec 9.2; `warm_white` is the key-light colour.

## Regenerating

`npm run assets` (spec 10.3) rebuilds the palette through headless Blender. It needs
`BLENDER_PATH`, e.g.:

```bash
export BLENDER_PATH=/opt/homebrew/bin/blender
npm run assets
```

Direct call without the npm wrapper:

```bash
"$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
  -P tools/palette/make_palette.py -- --out assets-src/palette/palette.png
```

The output is byte-stable: the same script and Blender version always produce the identical PNG, so
a clean regeneration should show no diff. The script self-checks and fails loudly (non-zero Blender
exit through `--python-exit-code`) if the image is not 256×256, if the 256 swatches are not distinct,
if a spec 9.4 anchor is off by one byte, if the saved file does not read back with the exact 16×16
blocks, or if the table above no longer matches the ramps in the script.
