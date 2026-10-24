"""Snowpup Yeti - Frostborn straight shooter (spec 5.2, 5.3, 12.4).

A fluffy baby yeti: rounded white-blue fur with a few shade tufts, small round
ears, big round eyes, a bulky frost-blue scarf and a wooden slingshot with a
snowball held forward (+X). The weapon arm and the snowball are the silhouette
anchor; ice-blue accents tie it to the Frostborn palette.

Built by `npm run assets -- snowpup_yeti` through Blender's bundled Python
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

from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 2]
reset_scene()


def rod(name, start, end, radius, swatch, vertices=6):
    """A cylinder between two points, for slingshot prongs, bands and struts."""
    direction = Vector(end) - Vector(start)
    middle = (Vector(start) + Vector(end)) / 2.0
    rotation = direction.to_track_quat("Z", "Y").to_euler()
    return cylinder(name, radius=radius, depth=direction.length, loc=tuple(middle), swatch=swatch, rot=tuple(rotation), vertices=vertices)

# Palette swatches: ramp * 8 + slot, anchor on slot 3 (assets-src/palette/README.md).
FUR = 86  # frost snow, main fur
FUR_LIGHT = 87  # snow highlight, belly, muzzle and paws
FUR_SHADE = 85  # cool grey-blue fur shadow
ICE = 76  # frost ice accents
SCARF = 92  # frost deep blue, one step up for the toon shadow band
SCARF_DARK = 90
EYE = 243  # ink
GLINT = 255
NOSE = 92
WOOD = 227
ROPE = 225
SNOWBALL = 87

# 1. Parts: round fluffy body, big head, bulky scarf, slingshot arm (sizes in tiles).
body = sphere("body", radius=0.20, loc=(0.0, 0.0, 0.36), swatch=FUR, segments=10, rings=6, scale=(1.0, 0.95, 1.0))
belly = sphere("belly", radius=0.15, loc=(0.08, 0.0, 0.34), swatch=FUR_LIGHT, segments=8, rings=5, scale=(0.8, 1.0, 1.0))
tail = sphere("tail", radius=0.075, loc=(-0.20, 0.0, 0.34), swatch=FUR_SHADE, segments=6, rings=4)

# A few rounded fur tufts only on the silhouette edge (never over the face).
tuft_places = (
    (0.0, 0.21, 0.42, 0.065),
    (0.0, -0.21, 0.42, 0.065),
    (-0.15, 0.13, 0.28, 0.06),
    (-0.15, -0.13, 0.28, 0.06),
    (-0.01, 0.0, 0.785, 0.075),
)
tufts = [
    sphere(
        "tuft_%d" % index,
        radius=radius,
        loc=(x, y, z),
        swatch=FUR_SHADE if index < 4 else ICE,
        segments=6,
        rings=4,
    )
    for index, (x, y, z, radius) in enumerate(tuft_places)
]

head = sphere("head", radius=0.18, loc=(0.02, 0.0, 0.60), swatch=FUR, segments=10, rings=6)
ear_a = sphere("ear_a", radius=0.055, loc=(0.0, 0.155, 0.755), swatch=FUR, segments=6, rings=4)
ear_b = mirror_x(ear_a, name="ear_b")
ear_inner_a = sphere("ear_inner_a", radius=0.03, loc=(0.028, 0.162, 0.762), swatch=ICE, segments=6, rings=4)
ear_inner_b = mirror_x(ear_inner_a, name="ear_inner_b")

# Face: big round eyes, lighter muzzle, small blue nose and a smile.
eye_a = sphere("eye_a", radius=0.045, loc=(0.16, 0.07, 0.65), swatch=EYE, segments=8, rings=5)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.016, loc=(0.195, 0.07, 0.665), swatch=GLINT, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")
muzzle = sphere("muzzle", radius=0.058, loc=(0.18, 0.0, 0.582), swatch=FUR_LIGHT, segments=8, rings=5, scale=(0.9, 1.0, 0.85))
nose = sphere("nose", radius=0.026, loc=(0.23, 0.0, 0.598), swatch=NOSE, segments=6, rings=4, scale=(1.0, 1.1, 0.8))
smile = sphere("smile", radius=0.02, loc=(0.20, 0.0, 0.555), swatch=EYE, segments=6, rings=4, scale=(0.4, 1.2, 0.3))

# Bulky scarf with a knot and a hanging tail.
scarf = sphere("scarf", radius=0.17, loc=(0.0, 0.0, 0.475), swatch=SCARF, segments=10, rings=5, scale=(1.15, 1.15, 0.45))
scarf_knot = sphere("scarf_knot", radius=0.06, loc=(0.11, -0.13, 0.485), swatch=SCARF_DARK, segments=6, rings=4)
scarf_tail_a = blob("scarf_tail_a", size=(0.08, 0.13, 0.20), loc=(0.03, -0.19, 0.40), swatch=SCARF, bevel=0.03, bevel_segments=1, rot=(math.radians(14), 0, math.radians(10)))
scarf_tail_b = blob("scarf_tail_b", size=(0.075, 0.11, 0.16), loc=(-0.02, -0.17, 0.30), swatch=SCARF_DARK, bevel=0.025, bevel_segments=1, rot=(math.radians(-6), 0, math.radians(-8)))

# Arms: one holds the slingshot forward (+X), one rests at the side.
shoulder_a = sphere("shoulder_a", radius=0.07, loc=(0.02, 0.19, 0.45), swatch=FUR, segments=6, rings=4)
shoulder_b = mirror_x(shoulder_a, name="shoulder_b")
arm_sling = capsule("arm_sling", radius=0.055, depth=0.22, loc=(0.17, 0.18, 0.47), swatch=FUR, rot=(0.0, math.radians(78), math.radians(-4)), segments=8)
paw_sling = sphere("paw_sling", radius=0.062, loc=(0.29, 0.16, 0.485), swatch=FUR_LIGHT, segments=6, rings=4)
arm_rest = capsule("arm_rest", radius=0.055, depth=0.14, loc=(0.09, -0.20, 0.38), swatch=FUR, rot=(0.0, math.radians(24), math.radians(12)), segments=8)
paw_rest = sphere("paw_rest", radius=0.062, loc=(0.17, -0.22, 0.335), swatch=FUR_LIGHT, segments=6, rings=4)

# Wooden slingshot with a rope band and a big snowball, pointing +X.
sling_handle = cylinder("sling_handle", radius=0.021, depth=0.18, loc=(0.315, 0.16, 0.525), swatch=WOOD, rot=(0.0, math.radians(55), 0), vertices=6)
sling_fork = sphere("sling_fork", radius=0.03, loc=(0.385, 0.16, 0.575), swatch=WOOD, segments=6, rings=4)
sling_prong_a = rod("sling_prong_a", (0.39, 0.16, 0.575), (0.47, 0.235, 0.66), 0.017, WOOD)
sling_prong_b = rod("sling_prong_b", (0.39, 0.16, 0.575), (0.47, 0.085, 0.66), 0.017, WOOD)
sling_band = rod("sling_band", (0.47, 0.235, 0.66), (0.47, 0.085, 0.66), 0.008, ROPE, vertices=5)
snowball = sphere("snowball", radius=0.065, loc=(0.495, 0.16, 0.66), swatch=SNOWBALL, segments=8, rings=5)
snow_fleck_a = sphere("snow_fleck_a", radius=0.016, loc=(0.45, 0.10, 0.62), swatch=ICE, segments=6, rings=4)
snow_fleck_b = sphere("snow_fleck_b", radius=0.013, loc=(0.53, 0.215, 0.69), swatch=ICE, segments=6, rings=4)

# Stubby legs, wide paws, ice toe beans.
leg_a = capsule("leg_a", radius=0.075, depth=0.10, loc=(0.0, 0.11, 0.125), swatch=FUR, segments=6)
leg_b = mirror_x(leg_a, name="leg_b")
paw_a = sphere("paw_a", radius=0.07, loc=(0.045, 0.11, 0.045), swatch=FUR_LIGHT, segments=6, rings=4, scale=(1.55, 1.0, 0.6))
paw_b = mirror_x(paw_a, name="paw_b")
toe_a = sphere("toe_a", radius=0.016, loc=(0.115, 0.065, 0.05), swatch=ICE, segments=6, rings=4)
toe_b = sphere("toe_b", radius=0.016, loc=(0.115, 0.155, 0.05), swatch=ICE, segments=6, rings=4)
toe_c = mirror_x(toe_a, name="toe_c")
toe_d = mirror_x(toe_b, name="toe_d")

# 2. Rig: ears twitch, the slingshot arm has its own bone for the throw.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.44), "root"),
        ("head", (0.02, 0.0, 0.44), (0.02, 0.0, 0.70), "body"),
        ("ear_a", (0.0, 0.14, 0.72), (0.0, 0.18, 0.80), "head"),
        ("ear_b", (0.0, -0.14, 0.72), (0.0, -0.18, 0.80), "head"),
        ("hand_sling", (0.17, 0.17, 0.48), (0.32, 0.16, 0.62), "body"),
        ("hand_rest", (0.09, -0.18, 0.42), (0.17, -0.22, 0.34), "body"),
        ("leg_a", (0.0, 0.11, 0.17), (0.0, 0.11, 0.02), "root"),
        ("leg_b", (0.0, -0.11, 0.17), (0.0, -0.11, 0.02), "root"),
    ]
)
bind(
    {
        "body": [body, belly, tail, *tufts[:4], scarf, scarf_knot, scarf_tail_a, scarf_tail_b, shoulder_a, shoulder_b, arm_rest],
        "head": [head, *tufts[4:], ear_inner_a, ear_inner_b, eye_a, eye_b, glint_a, glint_b, muzzle, nose, smile],
        "ear_a": [ear_a],
        "ear_b": [ear_b],
        "hand_sling": [arm_sling, paw_sling, sling_handle, sling_fork, sling_prong_a, sling_prong_b, sling_band, snowball, snow_fleck_a, snow_fleck_b],
        "hand_rest": [paw_rest],
        "leg_a": [leg_a, paw_a, toe_a, toe_b],
        "leg_b": [leg_b, paw_b, toe_c, toe_d],
    },
    armature,
)

# 3. Clips: curious breathing idle, a 0.4 s sling throw, a victory hop.
clip(
    "idle",
    2.0,
    [
        key("body", 0, scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("ear_a", 0, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_sling", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 30, scale=(1.02, 1.02, 0.985)),
        key("head", 30, rot=(0.0, math.radians(4.0), 0.0)),
        key("ear_a", 30, rot=(math.radians(-8.0), 0.0, 0.0)),
        key("ear_b", 30, rot=(math.radians(5.0), 0.0, 0.0)),
        key("hand_sling", 30, rot=(math.radians(-3.0), 0.0, 0.0)),
        key("body", 60, scale=(1.0, 1.0, 1.0)),
        key("head", 60, rot=(0.0, 0.0, 0.0)),
        key("ear_a", 60, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 60, rot=(0.0, 0.0, 0.0)),
        key("hand_sling", 60, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "attack",
    0.4,
    [
        key("hand_sling", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_sling", 3, rot=(math.radians(18.0), 0.0, 0.0)),
        key("body", 3, rot=(0.0, math.radians(5.0), 0.0)),
        key("hand_sling", 6, rot=(math.radians(-26.0), 0.0, 0.0)),
        key("body", 6, rot=(0.0, math.radians(-7.0), 0.0)),
        key("hand_sling", 12, rot=(0.0, 0.0, 0.0)),
        key("body", 12, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("ear_a", 0, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 12, loc=(0.0, 0.0, 0.22)),
        key("ear_a", 12, rot=(math.radians(-16.0), 0.0, 0.0)),
        key("ear_b", 12, rot=(math.radians(16.0), 0.0, 0.0)),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
        key("ear_a", 24, rot=(0.0, 0.0, 0.0)),
        key("ear_b", 24, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.7, 0.9)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
