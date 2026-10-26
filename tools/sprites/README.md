# Sprite pipeline (issue #114)

Generates the pixel-art sprite atlases of the 2.5D portrait relaunch:

- one transparent grid atlas per unit (all animation clips of its GLB),
- one single-frame atlas per environment prop (trees, bush, rock, mushroom,
  flower cluster, grass tufts),
- one 128x128 card portrait per unit for the collection UI,
- `public/sprites/manifest.json` for the sprite render layer
  (`src/render/sprites/`).

## One-command build

```bash
python3 tools/sprites/build_sprites.py                    # everything: 15 units + 9 props + 15 portraits
python3 tools/sprites/build_sprites.py --only gloomling   # one unit (fast pipeline proof)
python3 tools/sprites/build_sprites.py --skip-props       # units + portraits only
python3 tools/sprites/build_sprites.py --skip-render      # repack the cached renders only
```

Requirements: Blender (default `/opt/homebrew/bin/blender`, override with
`BLENDER_PATH`) and the system `python3` with Pillow and numpy. No add-ons, no
network. The build cache defaults to `<temp>/bastion-heroes-sprites` and is
never committed; every stage is deterministic, so a rerun reproduces the same
bytes.

## Stages

1. `assets-src/blender/sprites/props.py` builds the environment props
   (`tree_round`, `tree_pine`, `bush`, `rock`, `mushroom`, `flower_cluster`,
   `grass_tuft_a`, `grass_tuft_b`, `grass_tuft_c`) with the shared palette
   helpers of the World 1 environment and exports one static GLB per prop into
   the cache. Prop heights are authored to the old 3D decor: trees ~2.5, bush
   ~0.95, rock ~0.62, mushroom ~0.4, flower cluster ~0.3, grass tufts ~0.24-0.44.
2. `tools/sprites/render_sprites.py` (inside Blender) imports every rigged
   `public/models/<id>.glb`, plays each animation clip (spec 9.6 names) and
   renders the sampled frames at 4x the final sprite size. It also renders the
   one-shot card portraits (64x64 logical grid at 4x).

   Camera contract: the fixed portrait game camera of the relaunch is a
   perspective camera with FOV 32 on the `-x` side of the board looking along
   `+x` towards the portal at 45 degrees elevation. The sprite render uses an
   orthographic camera with exactly that view direction (Blender basis:
   forward `(cos45, 0, -sin45)`, screen up `(sin45, 0, cos45)`, screen right
   `(0, -1, 0)`), centred on the character's vertical axis. Defenders face `+x`
   and are seen from behind, enemies face `-x`: their models are rotated 180
   degrees before rendering, so the atlas shows the enemy's front - exactly what
   the billboard shows in game. Lighting is the spec 9.2 key from the upper left
   front (`-x/+y/+z`) plus fills; shadows are off so the colour stays inside the
   three toon bands.

   Portrait camera: an orthographic three-quarter front view (azimuth 22
   degrees, elevation 12 degrees) that shows every model's face as authored.
   The crop runs from just above the top of the silhouette down past the rig's
   `head` bone, so heads and shoulders fill the frame; it widens automatically
   for wide hats/horns.

3. `tools/sprites/make_atlases.py` (system Python) turns the 4x renders into the
   final pixel art: max-alpha nearest downsample, hard alpha threshold, palette
   quantisation to the game palette (`assets-src/palette/palette.png`) expanded
   with the three spec 9.2 toon shading bands, 1px `#1B1B2F` outline, row-major
   transparent atlas, the manifest and the review contact sheet
   `docs/screenshots/m3b-sprites-contact-sheet.png`.

## Output contract

`public/sprites/<id>.png` for the 15 units, `public/sprites/props_<id>.png` for
the 9 props (a `prop_<id>.png` alias is kept for the original task wording),
`public/sprites/portraits/<id>.png` for the 15 card portraits (128x128; a 64x64
pixel grid nearest-upscaled 2x, no manifest entry needed - the UI uses the path
pattern).

`public/sprites/manifest.json`:

```json
{
  "version": 1,
  "characters": {
    "<id>": {
      "image": "/sprites/<id>.png",
      "frameWidth": 64,
      "frameHeight": 68,
      "columns": 8,
      "worldHeight": 0.8299,
      "clips": { "idle": { "frames": [0], "fps": 1.0, "loop": true } }
    }
  },
  "props": {
    "<id>": {
      "image": "/sprites/props_<id>.png",
      "frameWidth": 164,
      "frameHeight": 220,
      "columns": 1,
      "worldHeight": 2.612
    }
  }
}
```

- Frames are row-major grid indices into the sheet; the frame size and column
  count differ per model (the atlas is tightly cropped so the silhouette fills
  the frame and the sheet stays <= 512 px wide). Consumers must read
  `frameWidth`, `frameHeight` and `columns` from the manifest.
- Anchor is bottom centre: the bottom-centre pixel of a frame is the unit's
  projected ground point on the board. Frames have 3 px of transparent padding
  below the lowest silhouette pixel so the 1px outline fits.
- `worldHeight` is the measured model height in world units (spec 9.3 budgets).
  The projected silhouette fills about 90% of the frame height because of the
  45 degree view; both `modelHeight` and `projectedHeight` are recorded in the
  raw render metadata if a consumer wants the projected value instead.
- Clips are omitted when the GLB does not contain them. `idle` is mandatory: a
  model without an `idle` clip gets a one-frame idle that holds the first frame
  of `walk`/`eat`/`attack` (all enemy GLBs only contain `walk` + `eat`).
- Clip playback uses the authored durations: `fps = samples / clipSeconds`, so
  the sprite animation keeps the timing of the 3D clip (rounded to 2 decimals).
- Units and props share the same texel density (90 px per world unit), so the
  whole scene keeps one chunky pixel size when the render layer scales
  billboards by `worldHeight`.

## Adding a character or prop

Add the id to `CHARACTERS` in `tools/sprites/render_sprites.py` (with its
faction) and, for props, to `PROPS` in `assets-src/blender/sprites/props.py`
and `PROP_ORDER` in `tools/sprites/make_atlases.py`, then rerun the build.
Stale generated PNGs are pruned automatically.
