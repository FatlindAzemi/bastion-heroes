"""Frost Witch - Frostborn epic beam caster (spec 5.2, 5.3, 12.4).

A hooded frost sorceress: layered deep-blue and ice-blue dress with snow trim and
flowing ribbons, a dark hood with glowing ice eyes, and a long icy staff with a
glowing crystal head held forward (+X) as the beam source. Floating ice shards and
orbs drift around her, and a crystal crown hovers above the hood.

Built by `npm run assets -- frost_witch` through Blender's bundled Python
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
from parts import blob, capsule, cone, cylinder, mirror_x, rod, sphere
from rig import bind, make_armature
from scene import reset_scene

OUT = sys.argv[sys.argv.index("--") + 2]
reset_scene()

# Palette swatches: ramp * 8 + slot, anchor on slot 3 (assets-src/palette/README.md).
DEEP = 92  # frost deep blue
DEEP_DARK = 90
DEEP_LIGHT = 93
ICE = 76  # frost ice blue
ICE_LIGHT = 77
ICE_DARK = 74
SNOW = 87  # frost snow white
SNOW_SHADE = 86
GLOW = 143  # glowing ice cyan
GLOW_CORE = 255
INK = 243
STEEL = 20

# 1. Parts: layered flowing dress, hooded head, ice staff and floating shards (tiles).
dress_outer = cone("dress_outer", radius1=0.34, radius2=0.13, depth=0.42, loc=(0.0, 0.0, 0.21), swatch=DEEP, vertices=24)
dress_hem = cylinder("dress_hem", radius=0.335, depth=0.05, loc=(0.0, 0.0, 0.05), swatch=SNOW, vertices=24)
dress_mid = cone("dress_mid", radius1=0.27, radius2=0.15, depth=0.18, loc=(0.0, 0.0, 0.42), swatch=ICE, vertices=20)
dress_trim = cylinder("dress_trim", radius=0.283, depth=0.04, loc=(0.0, 0.0, 0.345), swatch=SNOW, vertices=20)
dress_accent = cone("dress_accent", radius1=0.20, radius2=0.11, depth=0.12, loc=(0.0, 0.0, 0.51), swatch=DEEP_LIGHT, vertices=18)
ribbon_a = blob("ribbon_a", size=(0.10, 0.10, 0.34), loc=(-0.22, 0.10, 0.30), swatch=DEEP_LIGHT, bevel=0.03, bevel_segments=1, rot=(math.radians(8), math.radians(-16), math.radians(8)))
ribbon_b = blob("ribbon_b", size=(0.085, 0.095, 0.30), loc=(-0.24, -0.10, 0.26), swatch=DEEP, bevel=0.03, bevel_segments=1, rot=(math.radians(-6), math.radians(-20), math.radians(-10)))
ribbon_c = blob("ribbon_c", size=(0.07, 0.08, 0.24), loc=(-0.26, 0.0, 0.20), swatch=ICE, bevel=0.025, bevel_segments=1, rot=(math.radians(4), math.radians(-24), 0.0))
trim_fur_a = sphere("trim_fur_a", radius=0.045, loc=(0.22, 0.16, 0.30), swatch=SNOW, segments=8, rings=5)
trim_fur_b = sphere("trim_fur_b", radius=0.045, loc=(0.22, -0.16, 0.30), swatch=SNOW, segments=8, rings=5)
trim_fur_c = sphere("trim_fur_c", radius=0.04, loc=(0.10, 0.26, 0.27), swatch=SNOW_SHADE, segments=8, rings=5)
snowflake_a = cone("snowflake_a", radius1=0.03, radius2=0.003, depth=0.09, loc=(0.24, 0.0, 0.24), swatch=ICE_LIGHT, rot=(0.0, math.radians(90), 0.0), vertices=6)
snowflake_b = cone("snowflake_b", radius1=0.024, radius2=0.003, depth=0.07, loc=(0.22, 0.12, 0.18), swatch=ICE, rot=(0.0, math.radians(70), math.radians(20)), vertices=6)
snowflake_c = cone("snowflake_c", radius1=0.024, radius2=0.003, depth=0.07, loc=(0.22, -0.12, 0.18), swatch=ICE, rot=(0.0, math.radians(70), math.radians(-20)), vertices=6)

torso = sphere("torso", radius=0.09, loc=(0.0, 0.0, 0.58), swatch=DEEP_DARK, segments=12, rings=8)
mantle = blob("mantle", size=(0.18, 0.30, 0.13), loc=(0.0, 0.0, 0.65), swatch=DEEP, bevel=0.03, bevel_segments=1)
fur_a = sphere("fur_a", radius=0.042, loc=(0.05, 0.17, 0.625), swatch=SNOW, segments=6, rings=4)
fur_b = sphere("fur_b", radius=0.042, loc=(0.05, -0.17, 0.625), swatch=SNOW, segments=6, rings=4)
fur_c = sphere("fur_c", radius=0.036, loc=(-0.04, 0.0, 0.63), swatch=SNOW_SHADE, segments=6, rings=4)

# Hooded head: dark face opening, glowing ice eyes and a floating crystal crown.
hood = sphere("hood", radius=0.12, loc=(-0.02, 0.0, 0.745), swatch=DEEP, segments=16, rings=10, scale=(1.0, 1.0, 1.05))
hood_peak = cone("hood_peak", radius1=0.07, radius2=0.006, depth=0.19, loc=(-0.03, 0.0, 0.87), swatch=DEEP_DARK, rot=(0.0, math.radians(-18), 0.0), vertices=8)
face_shadow = sphere("face_shadow", radius=0.09, loc=(0.03, 0.0, 0.745), swatch=INK, segments=12, rings=8, scale=(0.5, 1.0, 1.0))
face = sphere("face", radius=0.075, loc=(0.09, 0.0, 0.745), swatch=SNOW, segments=12, rings=8, scale=(0.55, 1.0, 1.05))
brow_a = blob("brow_a", size=(0.035, 0.045, 0.014), loc=(0.135, 0.042, 0.785), swatch=ICE_DARK, bevel=0.004, bevel_segments=1, rot=(0.0, 0.0, math.radians(8)))
brow_b = mirror_x(brow_a, name="brow_b")
mouth = blob("mouth", size=(0.02, 0.04, 0.012), loc=(0.145, 0.0, 0.705), swatch=INK, bevel=0.004, bevel_segments=1)
eye_a = sphere("eye_a", radius=0.026, loc=(0.145, 0.042, 0.755), swatch=GLOW, segments=8, rings=5)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.011, loc=(0.16, 0.042, 0.764), swatch=GLOW_CORE, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")
crown_glow = sphere("crown_glow", radius=0.028, loc=(0.0, 0.0, 0.94), swatch=GLOW, segments=8, rings=5)
crown_shard = cone("crown_shard", radius1=0.05, radius2=0.004, depth=0.13, loc=(0.0, 0.0, 0.985), swatch=ICE_LIGHT, vertices=8)
crown_shard_b = cone("crown_shard_b", radius1=0.032, radius2=0.003, depth=0.08, loc=(0.03, 0.0, 0.955), swatch=ICE, rot=(0.0, math.radians(-16), 0.0), vertices=8)
crown_shard_c = cone("crown_shard_c", radius1=0.026, radius2=0.003, depth=0.06, loc=(-0.035, 0.0, 0.945), swatch=SNOW, rot=(0.0, math.radians(18), 0.0), vertices=6)

# Arms: the staff arm reaches forward (+X), the free hand holds a hovering ice orb.
arm_staff = capsule("arm_staff", radius=0.04, depth=0.22, loc=(0.12, 0.14, 0.62), swatch=DEEP, rot=(0.0, math.radians(80), 0.0), segments=8)
hand_staff = sphere("hand_staff", radius=0.045, loc=(0.26, 0.14, 0.64), swatch=ICE, segments=8, rings=5)
arm_free = capsule("arm_free", radius=0.038, depth=0.18, loc=(0.06, -0.16, 0.52), swatch=DEEP, rot=(0.0, math.radians(38), math.radians(14)), segments=8)
hand_free = sphere("hand_free", radius=0.045, loc=(0.16, -0.20, 0.46), swatch=ICE, segments=8, rings=5)
palm_orb = sphere("palm_orb", radius=0.038, loc=(0.20, -0.22, 0.56), swatch=ICE_LIGHT, segments=8, rings=5)
palm_glow = sphere("palm_glow", radius=0.02, loc=(0.21, -0.22, 0.57), swatch=GLOW, segments=6, rings=4)

# The icy staff with a crystal head, pointing +X as the beam source.
staff_shaft = rod("staff_shaft", (0.18, 0.14, 0.62), (0.72, 0.13, 0.76), 0.016, ICE)
staff_gem_a = sphere("staff_gem_a", radius=0.022, loc=(0.38, 0.137, 0.66), swatch=ICE_LIGHT, segments=6, rings=4)
staff_gem_b = sphere("staff_gem_b", radius=0.018, loc=(0.56, 0.133, 0.71), swatch=SNOW, segments=6, rings=4)
staff_crystal_a = cone("staff_crystal_a", radius1=0.075, radius2=0.006, depth=0.15, loc=(0.77, 0.13, 0.78), swatch=ICE_LIGHT, rot=(0.0, math.radians(90), 0.0), vertices=8)
staff_crystal_b = cone("staff_crystal_b", radius1=0.075, radius2=0.006, depth=0.15, loc=(0.77, 0.13, 0.78), swatch=ICE, rot=(0.0, math.radians(-90), 0.0), vertices=8)
staff_crystal_c = cone("staff_crystal_c", radius1=0.032, radius2=0.004, depth=0.10, loc=(0.76, 0.20, 0.81), swatch=SNOW, rot=(math.radians(-40), math.radians(90), 0.0), vertices=6)
staff_crystal_d = cone("staff_crystal_d", radius1=0.032, radius2=0.004, depth=0.10, loc=(0.76, 0.06, 0.81), swatch=ICE, rot=(math.radians(40), math.radians(90), 0.0), vertices=6)
staff_glow = sphere("staff_glow", radius=0.05, loc=(0.77, 0.13, 0.78), swatch=GLOW, segments=8, rings=5)
staff_spark = sphere("staff_spark", radius=0.018, loc=(0.85, 0.13, 0.785), swatch=GLOW_CORE, segments=6, rings=4)

# Floating ice shards and orbs (bound to one bone so they can spin).
shard_places = (
    (0.30, 0.0, 0.88),
    (0.16, 0.26, 0.92),
    (-0.10, 0.24, 0.84),
    (-0.24, -0.06, 0.90),
    (0.04, -0.28, 0.94),
    (0.24, -0.20, 0.86),
    (-0.26, 0.14, 0.82),
)
shards = [
    cone(
        "shard_%d" % index,
        radius1=0.028,
        radius2=0.004,
        depth=0.10,
        loc=place,
        swatch=ICE_LIGHT if index % 2 == 0 else ICE,
        rot=(0.0, math.radians(20 + index * 30), math.radians(index * 24)),
        vertices=7,
    )
    for index, place in enumerate(shard_places)
]
shard_orbs = [
    sphere("shard_orb_a", radius=0.035, loc=(0.28, 0.20, 0.80), swatch=ICE, segments=8, rings=5),
    sphere("shard_orb_b", radius=0.03, loc=(-0.20, -0.20, 0.78), swatch=ICE_LIGHT, segments=8, rings=5),
]
shard_glows = [
    sphere("shard_glow_a", radius=0.017, loc=(0.29, 0.20, 0.81), swatch=GLOW, segments=6, rings=4),
    sphere("shard_glow_b", radius=0.014, loc=(-0.19, -0.19, 0.79), swatch=GLOW, segments=6, rings=4),
]

# 2. Rig: the staff arm casts, the shard ring spins on its own bone.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.60), "root"),
        ("head", (0.0, 0.0, 0.60), (0.0, 0.0, 0.90), "body"),
        ("orbs", (0.0, 0.0, 0.82), (0.0, 0.0, 1.0), "body"),
        ("hand_staff", (0.16, 0.14, 0.60), (0.78, 0.13, 0.78), "body"),
        ("hand_free", (0.12, -0.18, 0.50), (0.20, -0.22, 0.58), "body"),
    ]
)
bind(
    {
        "body": [dress_outer, dress_hem, dress_mid, dress_trim, dress_accent, ribbon_a, ribbon_b, ribbon_c, trim_fur_a, trim_fur_b, trim_fur_c, snowflake_a, snowflake_b, snowflake_c, torso, mantle, fur_a, fur_b, fur_c, arm_free, palm_orb, palm_glow],
        "head": [hood, hood_peak, face_shadow, face, brow_a, brow_b, mouth, eye_a, eye_b, glint_a, glint_b, crown_glow, crown_shard, crown_shard_b, crown_shard_c],
        "orbs": [*shards, *shard_orbs, *shard_glows],
        "hand_staff": [arm_staff, hand_staff, staff_shaft, staff_gem_a, staff_gem_b, staff_crystal_a, staff_crystal_b, staff_crystal_c, staff_crystal_d, staff_glow, staff_spark],
        "hand_free": [hand_free],
    },
    armature,
)

# 3. Clips: floating idle with spinning shards, a 0.4 s staff cast, a victory hover.
clip(
    "idle",
    2.0,
    [
        key("body", 0, loc=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("orbs", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_staff", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 30, loc=(0.0, 0.0, 0.02), scale=(1.01, 1.01, 0.995)),
        key("head", 30, rot=(0.0, math.radians(3.0), 0.0)),
        key("orbs", 30, rot=(0.0, 0.0, math.pi)),
        key("hand_staff", 30, rot=(math.radians(-2.0), 0.0, 0.0)),
        key("body", 60, loc=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)),
        key("head", 60, rot=(0.0, 0.0, 0.0)),
        key("orbs", 60, rot=(0.0, 0.0, math.tau)),
        key("hand_staff", 60, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "attack",
    0.4,
    [
        key("hand_staff", 0, rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_staff", 3, rot=(0.0, math.radians(10.0), 0.0), scale=(1.0, 1.0, 1.0)),
        key("body", 3, rot=(0.0, math.radians(3.0), 0.0)),
        key("hand_staff", 6, rot=(0.0, math.radians(-14.0), 0.0), scale=(1.05, 1.05, 1.05)),
        key("body", 6, rot=(0.0, math.radians(-4.0), 0.0)),
        key("hand_staff", 12, rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)),
        key("body", 12, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("orbs", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_staff", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 12, loc=(0.0, 0.0, 0.20)),
        key("orbs", 12, rot=(0.0, 0.0, math.pi)),
        key("hand_staff", 12, rot=(0.0, math.radians(-10.0), 0.0)),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
        key("orbs", 24, rot=(0.0, 0.0, math.tau)),
        key("hand_staff", 24, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.1)
assert_tris(4500)
assert_origin_at_feet()
export_glb(OUT)
