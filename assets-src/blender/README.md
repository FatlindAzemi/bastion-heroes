# Blender asset helpers

Shared `bpy` helpers for every Bastion Heroes model (spec 12.1 12.9). All models are built by
Python scripts that run Blender headless; nobody sculpts or clicks in Blender. The helper library is
the contract every character script and the asset pipeline (`npm run assets`, spec 12.2) use.

## Requirements

- `BLENDER_PATH` must point at a Blender executable, for example:
  `export BLENDER_PATH=/opt/homebrew/bin/blender`.
- Blender 4.x LTS or newer (spec 10.2 names 4.x LTS). The library is written against APIs that exist
  in 4.x and was verified headless on Blender **5.2.2 LTS**. It needs no add-ons and no internet.
- The build must support EEVEE rendering and WebP image saving (official 4.x and 5.x builds do).
- One script must finish in under 60 seconds (spec 12.2). The smoke test below takes about 10 s.

Every command passes `--python-exit-code 1`. Blender 4.x and 5.x both exit with status **0** when a
`-P` script raises an exception, so without this flag a failed self-check (a broken budget, a wrong
origin, a failed render) would look like success to `npm run assets`.

## Running a character script (spec 12.2)

```bash
"$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
  -P assets-src/blender/characters/<id>.py -- --out assets-build/raw/<id>.glb
```

Character scripts follow the template of spec 12.4: import the helpers, build parts, rig, key the
clips, run the checks, `export_glb(OUT)`. `assets-build/` is gitignored (spec 12.1).

## Library modules (spec 12.3)

| Module        | API                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene.py`    | `reset_scene()`, `repo_root()`, `character_collection()`, `character_objects()`, `character_meshes()`, `character_armature()`, `character_bounds()`, `script_arguments()`, `argument_value()` |
| `palette.py`  | `swatch(index)` (centre UV), `assign_swatch(obj, index)`, `palette_material()` - one shared material for all models (spec 9.3)                                                                |
| `parts.py`    | `blob`, `cylinder`, `cone`, `sphere`, `capsule`, `mirror_x` - low-poly primitives with bevel modifiers, sizes in tiles                                                                        |
| `rig.py`      | `make_armature(bones)`, `bind(mesh_parts, armature)` - bones as `(name, head, tail, parent)` tuples                                                                                           |
| `anim.py`     | `clip(name, length_s, keys)`, `key(bone, frame, rot, loc, scale)` - 30 fps actions pushed to one NLA track per clip                                                                           |
| `export.py`   | `export_glb(path)` - applies modifiers, exports only the character collection, Y up, all NLA clips as glTF animations                                                                         |
| `checks.py`   | `assert_height(min, max)`, `assert_tris(max)`, `assert_origin_at_feet()` - fail loudly before export (spec 9.3, 12.5)                                                                         |
| `render.py`   | shared render plumbing used by the two scripts below (import, lights, camera, EEVEE, WebP)                                                                                                    |
| `preview.py`  | `render_previews(glb, id, out_dir=None)` - the four review images of spec 12.8                                                                                                                |
| `portrait.py` | `render_portrait(glb, id, webp_path=None, png_path=None)` - the card portrait of spec 12.9                                                                                                    |

Sizes are in tiles (spec 9.1: 1 unit = 1 tile) and a primitive's `loc` is the centre of its bounding
box. Primitives bake their transform into the mesh, so character space and world space agree.

## Palette contract

Every mesh gets the one shared palette material. A face uses swatch `index` by putting all of its UV
loops on the swatch centre, exactly as documented in
[`assets-src/palette/README.md`](../palette/README.md): `column = index % 16`, `row = index // 16`,
`u = (column + 0.5) / 16`, `v = (row + 0.5) / 16`. The texture is packed into the `.glb`, so the
exported file is self-contained. The glTF exporter flips V for glTF's top-left UV origin, so the
index is the same number in Blender and after export.

## Rig and export conventions

- Characters stand at the origin on the ground and face **+X** (spec 12.5); the renderer rotates
  enemies 180 degrees.
- Every rig has a `root` (knockback) and a `head` (status VFX) bone; `make_armature()` and `bind()`
  refuse a rig without them.
- `bind({"body": [body], "head": [head, cap], "hand_r": [staff]}, armature)` binds every part rigidly
  to exactly one bone: all vertices of the part get weight 1.0 on that bone, no weight painting.
  `bind()` applies the bevel modifiers, joins the parts into one mesh and skinning keeps the model
  at one draw call and one material (spec 11.7, 12.5).
- `mirror_x(obj)` mirrors a part across the character's left/right symmetry plane. Because
  characters face +X with Z up, that plane is the XZ plane and the copy differs in Y; pass a part
  placed at `+y` to get its symmetric counterpart at `-y`.
- Clip names must be the ones of spec 9.6 (`idle`, `attack`, `produce`, `walk`, `eat`, `victory`) and
  the clip length must match the table there. `clip()` requires a key on frame 0; when the last
  authored pose comes before `length_s * 30` it is held to the clip end, so the spec 9.6 length is
  exact (the spec 12.4 template ends `victory` on frame 24 although 1.2 s is 36 frames). Clips are
  moved to the NLA so they export as separate glTF animations.

## Preview and portrait scripts (spec 12.8, 12.9)

Both open an exported raw `.glb`, so they run after the character script. `preview.py` writes four
512x512 transparent PNGs - front three-quarter, right side, the fixed game camera angle of spec 9.1
(FOV 32) and the solid black silhouette of spec 9.5 - into `assets-build/previews/<id>/`:

```bash
"$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
  -P assets-src/blender/lib/preview.py -- --glb assets-build/raw/<id>.glb --id <id>
```

`portrait.py` writes a 512x512 transparent PNG to `assets-build/portraits/<id>.png` for review and
converts it to `public/portraits/<id>.webp` at quality 85 (committed; the UI draws the rarity frame
behind it, spec 9.8). The camera sits at head height and the head and shoulders fill 80 % of the
frame:

```bash
"$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
  -P assets-src/blender/lib/portrait.py -- --glb assets-build/raw/<id>.glb --id <id>
```

Both accept `--out` to override the output path, which the smoke test uses to keep every generated
file under the gitignored `assets-build/`.

## Smoke test

`smoke_test.py` builds a throwaway blocky figure (not a game character, no model id) to exercise
every module end to end, verifies the exported `.glb` contract with a small built-in GLB reader
(animations `idle` + `attack`, one skin, one mesh, embedded palette) and renders the four previews
plus a portrait:

```bash
"$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
  -P assets-src/blender/smoke_test.py
```

Outputs land in `assets-build/raw/smoke_test.glb`, `assets-build/previews/smoke_test/` and
`assets-build/smoke/`. Run it after any helper change or Blender upgrade.

## Notes for the asset pipeline (`npm run assets`)

`tools/build-assets/run.ts` (the `assets` script of spec 10.3) should, for each model id:

1. run the character script with `-- --out assets-build/raw/<id>.glb`;
2. run `lib/preview.py -- --glb assets-build/raw/<id>.glb --id <id>`;
3. optimize the raw `.glb` into `public/models/<id>.glb` (spec 12.6) and run the checks (spec 12.7);
4. run `lib/portrait.py -- --glb assets-build/raw/<id>.glb --id <id>` for defenders.

The previews and the portrait use the raw model, before gltf-transform changes it. Every Blender
call must pass `--python-exit-code 1` (see above) and only needs `BLENDER_PATH`, no add-ons and no
network.
