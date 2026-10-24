# Build assets pipeline

`npm run assets` builds every model from its Blender script, renders the review images and portraits,
optimizes the `.glb` files and runs the model checks (spec 12.1, 12.2, 12.6, 12.7).

```bash
export BLENDER_PATH=/opt/homebrew/bin/blender   # spec 12.2, required
npm run assets                                  # palette + every character + checks
npm run assets -- glowshroom_monk               # one model + checks
npm run assets:check                            # checks only (also runs in CI)
```

`npm run assets` stops with `Set BLENDER_PATH to your Blender 4.x executable.` and exit code 1 when
`BLENDER_PATH` is unset. A failing model does not stop the others; the run exits 1 at the end if
anything failed or a check reports a problem. Every Blender call passes `--python-exit-code 1`
because Blender 4.x/5.x exit 0 on a raising `-P` script.

## Steps per model id

For `assets-src/blender/characters/<id>.py` (files starting with `_` are ignored):

1. **Build** the model: `blender -b --factory-startup --python-exit-code 1 -P <script> -- --out assets-build/raw/<id>.glb`
2. **Preview** (spec 12.8): `assets-src/blender/lib/preview.py -- --glb assets-build/raw/<id>.glb --id <id>`
   writes four 512×512 transparent PNGs to `assets-build/previews/<id>/` (front 3/4, side, game
   camera, black silhouette).
3. **Optimize** (spec 12.6): `optimize.ts` writes `public/models/<id>.glb` (committed).
4. **Portrait** (spec 12.9) for defenders only: `assets-src/blender/lib/portrait.py -- --glb
assets-build/raw/<id>.glb --id <id>` writes `assets-build/portraits/<id>.png` (review) and
   `public/portraits/<id>.webp` (committed, quality 85).

Then the checks run over every committed model in `public/models/`.

`assets-build/` is gitignored (spec 12.1), so only `public/models/` and `public/portraits/` are
committed.

## Optimization (spec 12.6)

`optimize.ts` uses `@gltf-transform/core` + `@gltf-transform/functions` (spec 10.2, pinned 4.5.1)
and runs the exact order of spec 12.6:

`dedup` → `prune` → `weld` → `resample` → `quantize` → `meshopt`

- `quantize` stores attributes as integers (`KHR_mesh_quantization`).
- `meshopt` applies `EXT_meshopt_compression` with the medium level.

**Loader contract for the renderer:** models are meshopt-compressed, so the game must load them with
`MeshoptDecoder` set on the `GLTFLoader`:

```ts
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
```

`@gltf-transform/extensions` (extension registry) and `meshoptimizer` (encoder/decoder) are required
companions of the approved asset tooling; both are already installed as dependencies of
`@gltf-transform/functions` and `@gltf-transform/cli`, so `package.json` adds only the three packages
approved by spec 10.2. This spec gap is noted in the pull request.

## Checks (`npm run assets:check`, spec 12.7)

`check.ts` reads every `public/models/*.glb` with `check-logic.ts` (pure, unit tested rules, see
`tests/tools/assetsCheck.test.ts`) and fails on:

- a file above its spec 12.6 size limit: Common/Rare defenders and regular enemies **250 KB**,
  Epic/Legendary **400 KB**, Mythic defenders and bosses **700 KB**;
- more triangles than the spec 9.3 budget: 3,000 Common/Rare defenders and regular enemies, 4,500
  Epic/Legendary, 6,000 Mythic, 8,000 bosses;
- a bounding-box height outside spec 9.3 (0.7–0.9 Common/Rare, 0.8–1.1 Epic/Legendary, up to 1.3
  Mythic, 0.8–1.0 regular enemies, Ogre 1.4, boss 2.4);
- a missing role clip (spec 12.5) or a clip name outside spec 9.6;
- a missing `root` or `head` bone (spec 12.5);
- an id mapping problem: a model without a matching defender/enemy in `src/data/index.ts`, a
  character script without a data unit, or a script and its committed model disagreeing in either
  direction.

The size and height measurement uses the skinned bind pose (`model-summary.ts`): position attributes
are quantized, so the real scale lives in the skin's inverse bind matrices, not in the raw accessor
min/max.

CI runs `npm run assets:check` after `npm run check` (which ends with `npm run validate-data`), so a
model that breaks a budget or the data registry turns the pull request red. With no committed models
the check passes (empty set).
