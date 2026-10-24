"""Sparkbolt Gremlin - Forge Clan shooter (spec 5.3, 12.4).

A green gremlin with huge ears and goggles, holding a copper spark cannon twice
its size that points +X (right). Smoke puffs drift from the muzzle. The long
horizontal cannon plus the big ears are the silhouette anchors that read
"shooter" even in black.

Built by `npm run assets -- sparkbolt_gremlin` through Blender's bundled Python
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
from parts import blob, capsule, cone, cylinder, mirror_x, sphere
from rig import bind, make_armature
from scene import reset_scene

OUT = sys.argv[sys.argv.index("--") + 2]
reset_scene()

# Palette swatches: ramp * 8 + slot, anchor on slot 3 (assets-src/palette/README.md).
SKIN = 28  # wildgrove leaf green (one ramp step up for the toon shadow band)
SKIN_DARK = 26
SKIN_LIGHT = 30
INNER_EAR = 37  # mushroom red highlight
COPPER = 4  # forge copper, one ramp step up
COPPER_DARK = 2
COPPER_LIGHT = 6
ORANGE = 12  # forge orange, one ramp step up
STEEL = 20  # forge steel, one ramp step up
STEEL_DARK = 18
CYAN = 51  # neon cyan lens
INK = 243
TEETH = 255  # warm white
SMOKE = 205  # neutral grey light
SMOKE_DARK = 202

# 1. Parts (sizes in tiles; the gremlin faces +X).
body = blob("body", size=(0.30, 0.26, 0.30), loc=(0.0, 0.0, 0.32), swatch=SKIN, bevel=0.06, bevel_segments=1)
vest = blob("vest", size=(0.32, 0.285, 0.17), loc=(0.0, 0.0, 0.38), swatch=COPPER, bevel=0.04, bevel_segments=1)
belt = blob("belt", size=(0.325, 0.29, 0.045), loc=(0.0, 0.0, 0.30), swatch=ORANGE, bevel=0.015, bevel_segments=1)
buckle = blob("buckle", size=(0.05, 0.05, 0.045), loc=(0.16, 0.0, 0.30), swatch=STEEL, bevel=0.012, bevel_segments=1)
collar_plate = blob("collar_plate", size=(0.20, 0.19, 0.05), loc=(0.06, 0.0, 0.455), swatch=STEEL_DARK, bevel=0.015, bevel_segments=1)

leg_a = capsule("leg_a", radius=0.055, depth=0.09, loc=(0.0, 0.10, 0.115), swatch=SKIN_DARK, segments=8)
leg_b = mirror_x(leg_a, name="leg_b")
boot_a = blob("boot_a", size=(0.17, 0.13, 0.10), loc=(0.03, 0.10, 0.055), swatch=COPPER_DARK, bevel=0.03, bevel_segments=1)
boot_b = mirror_x(boot_a, name="boot_b")
toe_a = blob("toe_a", size=(0.06, 0.12, 0.07), loc=(0.13, 0.10, 0.045), swatch=STEEL_DARK, bevel=0.02, bevel_segments=1)
toe_b = mirror_x(toe_a, name="toe_b")

head = sphere("head", radius=0.17, loc=(0.02, 0.0, 0.60), swatch=SKIN, segments=12, rings=8, scale=(1.0, 1.0, 1.02))
# Huge pointed ears: the second silhouette anchor.
ear_a = cone("ear_a", radius1=0.075, radius2=0.006, depth=0.27, loc=(0.0, 0.19, 0.70), swatch=SKIN, rot=(math.radians(-34), 0, 0), vertices=7)
ear_b = mirror_x(ear_a, name="ear_b")
ear_inner_a = cone("ear_inner_a", radius1=0.042, radius2=0.004, depth=0.19, loc=(0.035, 0.20, 0.71), swatch=INNER_EAR, rot=(math.radians(-34), 0, 0), vertices=6)
ear_inner_b = mirror_x(ear_inner_a, name="ear_inner_b")

# Goggles: steel rims, cyan lenses and a strap across the head.
lens_a = cylinder("lens_a", radius=0.048, depth=0.022, loc=(0.17, 0.062, 0.635), swatch=CYAN, rot=(0, math.radians(90), 0), vertices=10)
lens_b = mirror_x(lens_a, name="lens_b")
rim_a = cylinder("rim_a", radius=0.058, depth=0.022, loc=(0.158, 0.062, 0.635), swatch=STEEL, rot=(0, math.radians(90), 0), vertices=10)
rim_b = mirror_x(rim_a, name="rim_b")
strap_a = capsule("strap_a", radius=0.014, depth=0.09, loc=(0.10, 0.145, 0.645), swatch=STEEL_DARK, rot=(math.radians(90), 0, 0), segments=6)
strap_b = mirror_x(strap_a, name="strap_b")
nose = sphere("nose", radius=0.045, loc=(0.19, 0.0, 0.565), swatch=SKIN_LIGHT, segments=8, rings=6, scale=(0.9, 1.0, 0.9))
nostril_a = sphere("nostril_a", radius=0.012, loc=(0.225, 0.018, 0.56), swatch=INK, segments=6, rings=4)
nostril_b = mirror_x(nostril_a, name="nostril_b")
mouth = sphere("mouth", radius=0.055, loc=(0.20, 0.0, 0.505), swatch=INK, segments=8, rings=5, scale=(0.32, 1.5, 0.7))
tooth_a = blob("tooth_a", size=(0.022, 0.02, 0.024), loc=(0.222, -0.035, 0.525), swatch=TEETH, bevel=0.006, bevel_segments=1)
tooth_b = blob("tooth_b", size=(0.022, 0.02, 0.024), loc=(0.222, 0.0, 0.528), swatch=TEETH, bevel=0.006, bevel_segments=1)
tooth_c = mirror_x(tooth_a, name="tooth_c")

# Cannon arm: a copper spark cannon twice the gremlin's size, pointing +X.
cannon = cylinder("cannon", radius=0.072, depth=0.44, loc=(0.36, 0.14, 0.38), swatch=COPPER, rot=(0, math.radians(90), 0), vertices=10)
cannon_stock = blob("cannon_stock", size=(0.14, 0.13, 0.13), loc=(0.11, 0.14, 0.38), swatch=COPPER_DARK, bevel=0.03, bevel_segments=1)
cannon_muzzle = cone("cannon_muzzle", radius1=0.085, radius2=0.073, depth=0.10, loc=(0.62, 0.14, 0.38), swatch=STEEL, rot=(0, math.radians(90), 0), vertices=12)
cannon_hole = cylinder("cannon_hole", radius=0.05, depth=0.035, loc=(0.672, 0.14, 0.38), swatch=INK, rot=(0, math.radians(90), 0), vertices=10)
ring_a = cylinder("ring_a", radius=0.082, depth=0.022, loc=(0.30, 0.14, 0.38), swatch=ORANGE, rot=(0, math.radians(90), 0), vertices=10)
ring_b = cylinder("ring_b", radius=0.082, depth=0.022, loc=(0.48, 0.14, 0.38), swatch=STEEL_DARK, rot=(0, math.radians(90), 0), vertices=10)
spark_a = sphere("spark_a", radius=0.026, loc=(0.70, 0.14, 0.40), swatch=CYAN, segments=6, rings=4)
spark_b = sphere("spark_b", radius=0.016, loc=(0.735, 0.10, 0.35), swatch=ORANGE, segments=6, rings=4)
spark_c = sphere("spark_c", radius=0.012, loc=(0.72, 0.18, 0.44), swatch=CYAN, segments=6, rings=4)
smoke_a = sphere("smoke_a", radius=0.038, loc=(0.68, 0.14, 0.45), swatch=SMOKE, segments=6, rings=4, scale=(1.0, 1.0, 0.9))
smoke_b = sphere("smoke_b", radius=0.028, loc=(0.64, 0.10, 0.48), swatch=SMOKE_DARK, segments=6, rings=4)
smoke_c = sphere("smoke_c", radius=0.02, loc=(0.70, 0.19, 0.49), swatch=SMOKE, segments=6, rings=4)

shoulder_a = sphere("shoulder_a", radius=0.06, loc=(0.01, 0.165, 0.44), swatch=SKIN, segments=8, rings=6)
shoulder_b = mirror_x(shoulder_a, name="shoulder_b")
arm_free = capsule("arm_free", radius=0.04, depth=0.15, loc=(0.10, -0.19, 0.38), swatch=SKIN, rot=(0, math.radians(38), 0), segments=8)
hand_free = sphere("hand_free", radius=0.052, loc=(0.17, -0.215, 0.33), swatch=STEEL_DARK, segments=8, rings=6)
hand_cannon = sphere("hand_cannon", radius=0.055, loc=(0.20, 0.14, 0.35), swatch=STEEL_DARK, segments=8, rings=6)
grip = capsule("grip", radius=0.025, depth=0.10, loc=(0.20, 0.14, 0.33), swatch=COPPER_DARK, segments=6)

# 2. Rig: the cannon has its own hand bone so the attack clip can recoil it.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.42), "root"),
        ("head", (0.02, 0.0, 0.44), (0.02, 0.0, 0.70), "body"),
        ("ear_a", (0.0, 0.17, 0.68), (0.0, 0.27, 0.80), "head"),
        ("ear_b", (0.0, -0.17, 0.68), (0.0, -0.27, 0.80), "head"),
        ("hand_cannon", (0.18, 0.14, 0.40), (0.30, 0.14, 0.38), "body"),
        ("hand_free", (0.14, -0.18, 0.40), (0.20, -0.21, 0.33), "body"),
        ("leg_a", (0.0, 0.10, 0.16), (0.0, 0.10, 0.02), "root"),
        ("leg_b", (0.0, -0.10, 0.16), (0.0, -0.10, 0.02), "root"),
    ]
)
bind(
    {
        "body": [body, vest, belt, buckle, collar_plate, shoulder_a, shoulder_b, arm_free],
        "head": [
            head,
            ear_inner_a,
            ear_inner_b,
            lens_a,
            lens_b,
            rim_a,
            rim_b,
            strap_a,
            strap_b,
            nose,
            nostril_a,
            nostril_b,
            mouth,
            tooth_a,
            tooth_b,
            tooth_c,
        ],
        "ear_a": [ear_a],
        "ear_b": [ear_b],
        "hand_cannon": [
            cannon,
            cannon_stock,
            cannon_muzzle,
            cannon_hole,
            ring_a,
            ring_b,
            spark_a,
            spark_b,
            spark_c,
            smoke_a,
            smoke_b,
            smoke_c,
            hand_cannon,
            grip,
        ],
        "hand_free": [hand_free],
        "leg_a": [leg_a, boot_a, toe_a],
        "leg_b": [leg_b, boot_b, toe_b],
    },
    armature,
)

# 3. Clips: fidgety idle with ear twitches, a 0.1 s wind-up shot, a victory hop.
clip(
    "idle",
    2.0,
    [
        key("body", 0, scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("ear_a", 0, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 30, scale=(1.02, 1.02, 0.985)),
        key("head", 30, rot=(0.0, math.radians(-4.0), 0.0)),
        key("ear_a", 30, rot=(math.radians(-8.0), 0.0, 0.0)),
        key("ear_b", 30, rot=(math.radians(6.0), 0.0, 0.0)),
        key("body", 60, scale=(1.0, 1.0, 1.0)),
        key("head", 60, rot=(0.0, 0.0, 0.0)),
        key("ear_a", 60, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 60, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "attack",
    0.4,
    [
        key("hand_cannon", 0, rot=(0.0, 0.0, 0.0), loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_cannon", 3, rot=(0.0, 0.0, math.radians(4.0)), loc=(-0.035, 0.0, 0.0)),
        key("body", 3, rot=(0.0, math.radians(-3.0), 0.0)),
        key("hand_cannon", 6, rot=(0.0, 0.0, math.radians(-3.0)), loc=(0.045, 0.0, 0.0)),
        key("body", 6, rot=(0.0, math.radians(2.0), 0.0)),
        key("hand_cannon", 12, rot=(0.0, 0.0, 0.0), loc=(0.0, 0.0, 0.0)),
        key("body", 12, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("hand_cannon", 0, rot=(0.0, 0.0, 0.0)),
        key("ear_a", 0, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 12, loc=(0.0, 0.0, 0.22)),
        key("hand_cannon", 12, rot=(0.0, 0.0, math.radians(-18.0))),
        key("ear_a", 12, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("ear_b", 12, rot=(math.radians(18.0), 0.0, 0.0)),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
        key("hand_cannon", 24, rot=(0.0, 0.0, 0.0)),
        key("ear_a", 24, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 24, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.7, 0.9)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
