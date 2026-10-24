"""Iron Granny - Forge Clan rare wall (spec 5.2, 5.3, 12.4).

A tiny, tough grandma behind a massive riveted armour apron shaped like an oven
lid: the wide square plate plus the flared armoured skirt make the wall read as a
broad obstacle, with only a helmeted head and bun above it. A copper riveted
frying pan is raised at her side and the Forge palette (copper, steel, orange)
ties her to the clan.

Built by `npm run assets -- iron_granny` through Blender's bundled Python
(spec 10.2, 12.2). Palette indices come from assets-src/palette/README.md.
"""

import math
import pathlib
import sys

BLENDER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.append(str(BLENDER_DIR / "lib"))

from anim import clip, key
from checks import assert_height, assert_origin_at_feet, assert_tris
from export import export_glb
from parts import blob, capsule, cylinder, mirror_x, sphere
from rig import bind, make_armature
from scene import reset_scene

OUT = sys.argv[sys.argv.index("--") + 2]
reset_scene()

# Palette swatches: ramp * 8 + slot, anchor on slot 3 (assets-src/palette/README.md).
COPPER = 4
COPPER_DARK = 2
COPPER_LIGHT = 6
STEEL = 20  # forge steel highlight, big readable plates
STEEL_ANCHOR = 19
STEEL_DARK = 18
ORANGE = 12
SKIN = 212
SKIN_DARK = 211
HAIR = 87  # frost snow white hair
HAIR_SHADE = 86
INK = 243
GLINT = 255
CHEEK = 36

# 1. Parts: a wide armoured base and the oven-lid apron, sized in tiles.
boot_a = blob("boot_a", size=(0.20, 0.16, 0.10), loc=(0.03, 0.13, 0.05), swatch=STEEL_DARK, bevel=0.025, bevel_segments=1)
boot_b = mirror_x(boot_a, name="boot_b")
toe_a = blob("toe_a", size=(0.07, 0.13, 0.07), loc=(0.14, 0.13, 0.055), swatch=COPPER_DARK, bevel=0.02, bevel_segments=1)
toe_b = mirror_x(toe_a, name="toe_b")

skirt = blob("skirt", size=(0.26, 0.64, 0.30), loc=(0.02, 0.0, 0.26), swatch=STEEL_ANCHOR, bevel=0.035, bevel_segments=1)
skirt_rim = blob("skirt_rim", size=(0.28, 0.66, 0.06), loc=(0.02, 0.0, 0.13), swatch=COPPER, bevel=0.02, bevel_segments=1)
seam_left = blob("seam_left", size=(0.02, 0.04, 0.24), loc=(0.16, 0.20, 0.27), swatch=STEEL_DARK, bevel=0.006, bevel_segments=1)
seam_right = mirror_x(seam_left, name="seam_right")
seam_center = blob("seam_center", size=(0.02, 0.04, 0.24), loc=(0.16, 0.0, 0.27), swatch=STEEL_DARK, bevel=0.006, bevel_segments=1)

# The oven-lid armour apron: wide square plate with rivets, a copper rim and a hub handle.
apron = blob("apron", size=(0.16, 0.54, 0.44), loc=(0.16, 0.0, 0.48), swatch=STEEL, bevel=0.03, bevel_segments=1)
apron_top = blob("apron_top", size=(0.17, 0.56, 0.06), loc=(0.16, 0.0, 0.69), swatch=COPPER, bevel=0.02, bevel_segments=1)
apron_bottom = blob("apron_bottom", size=(0.17, 0.56, 0.05), loc=(0.16, 0.0, 0.265), swatch=COPPER, bevel=0.02, bevel_segments=1)
apron_seam = blob("apron_seam", size=(0.02, 0.50, 0.02), loc=(0.245, 0.0, 0.48), swatch=STEEL_DARK, bevel=0.006, bevel_segments=1)
crack_a = blob("crack_a", size=(0.015, 0.02, 0.14), loc=(0.245, 0.12, 0.42), swatch=STEEL_DARK, bevel=0.004, bevel_segments=1, rot=(math.radians(14), 0.0, 0.0))
crack_b = blob("crack_b", size=(0.015, 0.02, 0.10), loc=(0.245, -0.10, 0.52), swatch=STEEL_DARK, bevel=0.004, bevel_segments=1, rot=(math.radians(-20), 0.0, 0.0))
apron_hub = cylinder("apron_hub", radius=0.075, depth=0.045, loc=(0.26, 0.0, 0.48), swatch=COPPER_DARK, rot=(0.0, math.radians(90), 0.0), vertices=10)
apron_grip = blob("apron_grip", size=(0.035, 0.20, 0.04), loc=(0.29, 0.0, 0.48), swatch=COPPER, bevel=0.012, bevel_segments=1)
apron_paint = blob("apron_paint", size=(0.03, 0.44, 0.06), loc=(0.255, 0.0, 0.585), swatch=ORANGE, bevel=0.012, bevel_segments=1)

rivet_places = (
    (0.255, 0.22, 0.66),
    (0.255, -0.22, 0.66),
    (0.255, 0.22, 0.30),
    (0.255, -0.22, 0.30),
    (0.255, 0.10, 0.66),
    (0.255, -0.10, 0.66),
    (0.255, 0.10, 0.30),
    (0.255, -0.10, 0.30),
    (0.255, 0.0, 0.66),
    (0.255, 0.0, 0.30),
)
rivets = [
    sphere("rivet_%d" % index, radius=0.024, loc=place, swatch=COPPER, segments=6, rings=4)
    for index, place in enumerate(rivet_places)
]

# Shoulders, gauntlet arms and the raised copper frying pan.
pauldron_a = sphere("pauldron_a", radius=0.085, loc=(0.02, 0.27, 0.63), swatch=STEEL, segments=8, rings=5)
pauldron_b = mirror_x(pauldron_a, name="pauldron_b")
arm_a = capsule("arm_a", radius=0.055, depth=0.18, loc=(0.09, 0.30, 0.54), swatch=STEEL_DARK, rot=(math.radians(-10), math.radians(20), 0.0), segments=6)
arm_b = mirror_x(arm_a, name="arm_b")
gauntlet_a = sphere("gauntlet_a", radius=0.062, loc=(0.18, 0.33, 0.47), swatch=STEEL_ANCHOR, segments=6, rings=4)
gauntlet_b = mirror_x(gauntlet_a, name="gauntlet_b")
pan_grip = capsule("pan_grip", radius=0.018, depth=0.24, loc=(0.24, 0.36, 0.55), swatch=COPPER, rot=(0.0, math.radians(20), math.radians(-55)), segments=6)
pan = cylinder("pan", radius=0.14, depth=0.035, loc=(0.34, 0.40, 0.66), swatch=STEEL_DARK, rot=(0.0, math.radians(90), 0.0), vertices=12)
pan_rim = cylinder("pan_rim", radius=0.152, depth=0.02, loc=(0.325, 0.40, 0.66), swatch=COPPER, rot=(0.0, math.radians(90), 0.0), vertices=12)
pan_cuff = cylinder("pan_cuff", radius=0.026, depth=0.05, loc=(0.275, 0.35, 0.60), swatch=ORANGE, rot=(0.0, math.radians(20), math.radians(-55)), vertices=8)

# Granny head: helmet, white bun, round glasses and a determined frown.
head = sphere("head", radius=0.095, loc=(0.02, 0.0, 0.745), swatch=SKIN, segments=10, rings=6)
hair_left = sphere("hair_left", radius=0.052, loc=(0.0, 0.095, 0.765), swatch=HAIR, segments=6, rings=4)
hair_right = mirror_x(hair_left, name="hair_right")
bun = sphere("bun", radius=0.06, loc=(-0.09, 0.0, 0.825), swatch=HAIR, segments=8, rings=5)
bun_tie = cylinder("bun_tie", radius=0.045, depth=0.03, loc=(-0.06, 0.0, 0.805), swatch=COPPER_DARK, rot=(0.0, math.radians(90), 0.0), vertices=8)
helmet = sphere("helmet", radius=0.105, loc=(0.0, 0.0, 0.81), swatch=STEEL, segments=10, rings=6, scale=(1.0, 1.0, 0.55))
helmet_rim = cylinder("helmet_rim", radius=0.11, depth=0.04, loc=(0.0, 0.0, 0.775), swatch=COPPER, vertices=10)
helmet_nose = blob("helmet_nose", size=(0.03, 0.05, 0.10), loc=(0.09, 0.0, 0.745), swatch=STEEL_DARK, bevel=0.008, bevel_segments=1)
glasses_a = cylinder("glasses_a", radius=0.048, depth=0.02, loc=(0.10, 0.052, 0.75), swatch=STEEL_DARK, rot=(0.0, math.radians(90), 0.0), vertices=10)
glasses_b = mirror_x(glasses_a, name="glasses_b")
lens_a = cylinder("lens_a", radius=0.038, depth=0.012, loc=(0.11, 0.052, 0.75), swatch=INK, rot=(0.0, math.radians(90), 0.0), vertices=8)
lens_b = mirror_x(lens_a, name="lens_b")
glint_a = sphere("glint_a", radius=0.012, loc=(0.118, 0.06, 0.759), swatch=GLINT, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")
glasses_bridge = blob("glasses_bridge", size=(0.03, 0.04, 0.014), loc=(0.105, 0.0, 0.75), swatch=STEEL_DARK, bevel=0.005, bevel_segments=1)
nose = sphere("nose", radius=0.023, loc=(0.12, 0.0, 0.715), swatch=SKIN_DARK, segments=6, rings=4)
mouth = blob("mouth", size=(0.02, 0.05, 0.014), loc=(0.11, 0.0, 0.68), swatch=INK, bevel=0.005, bevel_segments=1)
cheek_a = sphere("cheek_a", radius=0.022, loc=(0.08, 0.08, 0.705), swatch=CHEEK, segments=6, rings=4, scale=(0.5, 1.0, 0.7))
cheek_b = mirror_x(cheek_a, name="cheek_b")

# 2. Rig: the pan hand and shield hand animate; the wall has no attack clip.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.60), "root"),
        ("head", (0.0, 0.0, 0.60), (0.0, 0.0, 0.80), "body"),
        ("hand_pan", (0.14, 0.30, 0.52), (0.34, 0.40, 0.66), "body"),
        ("hand_shield", (0.10, -0.28, 0.50), (0.20, -0.33, 0.47), "body"),
        ("leg_a", (0.0, 0.13, 0.16), (0.0, 0.13, 0.02), "root"),
        ("leg_b", (0.0, -0.13, 0.16), (0.0, -0.13, 0.02), "root"),
    ]
)
bind(
    {
        "body": [skirt, skirt_rim, seam_left, seam_right, seam_center, apron, apron_top, apron_bottom, apron_seam, crack_a, crack_b, apron_hub, apron_grip, *rivets, apron_paint, pauldron_a, pauldron_b, arm_a, arm_b],
        "head": [head, hair_left, hair_right, bun, bun_tie, helmet, helmet_rim, helmet_nose, glasses_a, glasses_b, lens_a, lens_b, glint_a, glint_b, glasses_bridge, nose, mouth, cheek_a, cheek_b],
        "hand_pan": [gauntlet_a, pan_grip, pan, pan_rim, pan_cuff],
        "hand_shield": [gauntlet_b],
        "leg_a": [boot_a, toe_a],
        "leg_b": [boot_b, toe_b],
    },
    armature,
)

# 3. Clips: a breathing idle and a proud victory hop (walls have no attack clip, 12.5).
clip(
    "idle",
    2.0,
    [
        key("body", 0, scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_pan", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 30, scale=(1.015, 1.015, 0.99)),
        key("head", 30, rot=(0.0, math.radians(3.0), 0.0)),
        key("hand_pan", 30, rot=(math.radians(-4.0), 0.0, 0.0)),
        key("body", 60, scale=(1.0, 1.0, 1.0)),
        key("head", 60, rot=(0.0, 0.0, 0.0)),
        key("hand_pan", 60, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("hand_pan", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 12, loc=(0.0, 0.0, 0.16)),
        key("hand_pan", 12, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("head", 12, rot=(0.0, 0.0, math.radians(-6.0))),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
        key("hand_pan", 24, rot=(0.0, 0.0, 0.0)),
        key("head", 24, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.7, 0.9)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
