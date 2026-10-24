"""Shade Wisp - Spectral M2 enemy (spec 6.4, 12.4).

A hooded ghost with no legs: a dark cowl holding one big glowing cyan eye, a
tattered cloak that breaks into hanging strips and fades into violet smoke, and
two thin ghost arms with pale claws. It floats a little above the ground, so the
lowest cloak strip sets the feet origin and the hood + ragged strips make a
floating, wispy silhouette that reads "ghost" even in solid black. Translucency is
implied with the palette only (light violet tips and smoke puffs, no alpha), so
the model stays one shared palette material (spec 9.3, 12.5).

Built by `npm run assets -- shade_wisp` through Blender's bundled Python
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
from parts import blob, capsule, cone, mirror_x, sphere
from rig import bind, make_armature
from scene import reset_scene

OUT = sys.argv[sys.argv.index("--") + 2]
reset_scene()

# Palette swatches: ramp * 8 + slot, anchor on slot 3 (assets-src/palette/README.md).
DUSK = 132  # gloom dusk purple, cloak body
DUSK_DARK = 131  # hood and cloak shadow
DUSK_LIGHT = 134  # cloak highlight edges
SHADOW = 120  # gloom shadow, deepest tatters
EYE = 139  # gloom eye cyan
EYE_LIGHT = 143
VIOLET = 67  # spectral glow accent, cloak magic
VIOLET_LIGHT = 69  # faint glow strips and smoke puffs
BONE = 236  # pale ghost claws
INK = 243  # inside of the cowl

# 1. Parts (sizes in tiles, the wraith floats at the origin and faces +X).
# The shoulders and chest are the widest part; the cloak narrows into strips.
shoulders = sphere("shoulders", radius=0.19, loc=(0.0, 0.0, 0.55), swatch=DUSK, segments=12, rings=8, scale=(0.95, 1.0, 0.8))
chest = sphere("chest", radius=0.15, loc=(0.045, 0.0, 0.45), swatch=DUSK_LIGHT, segments=10, rings=6, scale=(0.8, 0.95, 0.95))
back_hump = sphere("back_hump", radius=0.13, loc=(-0.12, 0.0, 0.58), swatch=DUSK_DARK, segments=10, rings=6, scale=(0.9, 1.0, 1.0))

# Hood: a pointed cowl over a dark, empty face with ONE big glowing eye (6.4).
hood = sphere("hood", radius=0.165, loc=(0.035, 0.0, 0.73), swatch=DUSK_DARK, segments=12, rings=8, scale=(1.0, 1.0, 0.95))
hood_tip = cone("hood_tip", radius1=0.12, radius2=0.01, depth=0.22, loc=(-0.03, 0.0, 0.86), swatch=DUSK_DARK, rot=(0, math.radians(-32), 0), vertices=10)
hood_brim = blob("hood_brim", size=(0.10, 0.26, 0.09), loc=(0.15, 0.0, 0.79), swatch=DUSK, bevel=0.035, bevel_segments=1, rot=(0, math.radians(18), 0))
face = sphere("face", radius=0.115, loc=(0.14, 0.0, 0.68), swatch=INK, segments=10, rings=6, scale=(0.55, 0.9, 0.9))
eye = sphere("eye", radius=0.062, loc=(0.205, 0.0, 0.70), swatch=EYE, segments=10, rings=7, scale=(0.75, 1.0, 1.0))
glint = sphere("glint", radius=0.019, loc=(0.245, -0.022, 0.718), swatch=EYE_LIGHT, segments=6, rings=4)
eye_halo = sphere("eye_halo", radius=0.086, loc=(0.188, 0.0, 0.70), swatch=VIOLET_LIGHT, segments=8, rings=5, scale=(0.36, 1.0, 1.0))
cowl_shadow = sphere("cowl_shadow", radius=0.128, loc=(0.13, 0.0, 0.695), swatch=SHADOW, segments=10, rings=6, scale=(0.22, 1.0, 1.0))

# Two thin ghost arms with pale claws; the +Y arm reaches forward a little.
sleeve_a = capsule("sleeve_a", radius=0.05, depth=0.22, loc=(0.06, 0.16, 0.50), swatch=DUSK_DARK, rot=(0.0, math.radians(35), math.radians(-10)), segments=8)
arm_a = capsule("arm_a", radius=0.032, depth=0.17, loc=(0.15, 0.19, 0.40), swatch=DUSK_LIGHT, rot=(0.0, math.radians(60), 0), segments=6)
hand_a = sphere("hand_a", radius=0.036, loc=(0.232, 0.205, 0.352), swatch=BONE, segments=6, rings=4, scale=(1.0, 1.0, 0.8))
claw_a = cone("claw_a", radius1=0.009, radius2=0.002, depth=0.05, loc=(0.25, 0.205, 0.325), swatch=BONE, rot=(0.0, math.radians(110), 0), vertices=5)
claw_b = cone("claw_b", radius1=0.008, radius2=0.002, depth=0.045, loc=(0.246, 0.232, 0.334), swatch=BONE, rot=(0.0, math.radians(110), math.radians(-18)), vertices=5)
sleeve_b = mirror_x(sleeve_a, name="sleeve_b")
arm_b = mirror_x(arm_a, name="arm_b")
hand_b = mirror_x(hand_a, name="hand_b")
claw_c = mirror_x(claw_a, name="claw_c")
claw_d = mirror_x(claw_b, name="claw_d")

# Tattered cloak strips: three longer strips at the front/sides ending just above
# the ground, plus shorter ragged strips behind. The tips glow violet.
strip_specs = (
    (0.13, 0.16, 0.54, 0.16, 0.54),  # name suffix x, y, top z, half width, length
    (0.02, 0.20, 0.56, 0.13, 0.36),
    (-0.10, 0.13, 0.55, 0.15, 0.28),
    (0.10, -0.17, 0.54, 0.14, 0.40),
    (-0.02, -0.21, 0.56, 0.12, 0.32),
    (-0.13, -0.12, 0.55, 0.14, 0.24),
    (-0.16, 0.02, 0.56, 0.12, 0.20),
    (0.20, -0.06, 0.50, 0.09, 0.36),
    (-0.19, 0.07, 0.52, 0.08, 0.30),
)
strips = []
strip_tips = []
for index, (x, y, top_z, half_width, length) in enumerate(strip_specs):
    strips.append(
        cone(
            "strip_%d" % index,
            radius1=half_width,
            radius2=0.012,
            depth=length,
            loc=(x, y, top_z - length / 2.0),
            swatch=DUSK_DARK if index % 2 == 0 else DUSK,
            rot=(math.radians(-4.0 * index), 0, 0),
            vertices=6,
        )
    )
    strip_tips.append(
        cone(
            "strip_tip_%d" % index,
            radius1=0.035,
            radius2=0.004,
            depth=0.09,
            loc=(x, y, max(0.045, top_z - length + 0.02)),
            swatch=VIOLET,
            rot=(0, math.radians(180), 0),
            vertices=5,
        )
    )

# Shorter ragged strips at the hem, some glowing, and drifting smoke puffs that
# imply translucency without an alpha material.
hem_specs = ((0.17, 0.06, 0.34), (0.06, -0.09, 0.30), (-0.06, 0.08, 0.27), (-0.15, -0.05, 0.32))
hem = [
    cone(
        "hem_%d" % index,
        radius1=0.075,
        radius2=0.006,
        depth=0.20,
        loc=(x, y, z),
        swatch=VIOLET_LIGHT if index % 2 == 0 else DUSK_LIGHT,
        rot=(0, math.radians(-12), 0),
        vertices=5,
    )
    for index, (x, y, z) in enumerate(hem_specs)
]
smoke_places = ((0.22, -0.08, 0.16), (-0.04, 0.23, 0.21), (-0.20, -0.10, 0.30))
smoke = [
    sphere("smoke_%d" % index, radius=0.046 - 0.008 * index, loc=place, swatch=VIOLET_LIGHT if index % 2 == 0 else DUSK_LIGHT, segments=6, rings=4, scale=(1.1, 1.0, 0.75))
    for index, place in enumerate(smoke_places)
]
fringe = cone("fringe", radius1=0.02, radius2=0.002, depth=0.20, loc=(-0.16, 0.0, 0.18), swatch=SHADOW, rot=(0, math.radians(-22), 0), vertices=5)

# 2. Rig: root for the hover, body for the sway, head for the eye VFX, cloth
# bones so the strips trail and drift in the walk loop.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.12), None),
        ("body", (0.0, 0.0, 0.12), (0.0, 0.0, 0.58), "root"),
        ("head", (0.03, 0.0, 0.58), (0.03, 0.0, 0.90), "body"),
        ("arm_a", (0.10, 0.16, 0.54), (0.26, 0.23, 0.30), "body"),
        ("arm_b", (0.10, -0.16, 0.54), (0.26, -0.23, 0.30), "body"),
        ("cloth_front", (0.08, 0.0, 0.50), (0.10, 0.0, 0.05), "body"),
        ("cloth_back", (-0.10, 0.0, 0.50), (-0.12, 0.0, 0.10), "body"),
        ("cloth_left", (0.0, 0.20, 0.50), (0.0, 0.22, 0.12), "body"),
        ("cloth_right", (0.0, -0.20, 0.50), (0.0, -0.22, 0.12), "body"),
    ]
)
bind(
    {
        "body": [shoulders, chest, back_hump, sleeve_a, sleeve_b, arm_a, arm_b, *smoke],
        "head": [hood, hood_tip, hood_brim, face, eye, glint, eye_halo, cowl_shadow],
        "arm_a": [hand_a, claw_a, claw_b],
        "arm_b": [hand_b, claw_c, claw_d],
        "cloth_front": [strips[0], strip_tips[0], strips[3], strip_tips[3], hem[0]],
        "cloth_back": [strips[2], strip_tips[2], strips[5], strip_tips[5], fringe],
        "cloth_left": [strips[1], strip_tips[1], strips[6], strip_tips[6], strips[7], strip_tips[7], hem[1], hem[3]],
        "cloth_right": [strips[4], strip_tips[4], strips[8], strip_tips[8], hem[2]],
    },
    armature,
)

# 3. Clips: a slow floating walk (hover bob + trailing strips) and a 0.5 s eat
# loop where the wisp recoils and flares its eye (bite interval, spec 9.6).
clip(
    "walk",
    1.0,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, math.radians(-4.0))),
        key("cloth_front", 0, rot=(0.0, 0.0, 0.0)),
        key("cloth_back", 0, rot=(0.0, 0.0, 0.0)),
        key("cloth_left", 0, rot=(0.0, 0.0, 0.0)),
        key("cloth_right", 0, rot=(0.0, 0.0, 0.0)),
        key("arm_a", 0, rot=(0.0, 0.0, 0.0)),
        key("arm_b", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.035)),
        key("body", 15, rot=(math.radians(-3.0), 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, math.radians(4.0))),
        key("cloth_front", 15, rot=(math.radians(9.0), 0.0, 0.0)),
        key("cloth_back", 15, rot=(math.radians(-7.0), 0.0, 0.0)),
        key("cloth_left", 15, rot=(math.radians(3.0), 0.0, 0.0)),
        key("cloth_right", 15, rot=(math.radians(-3.0), 0.0, 0.0)),
        key("arm_a", 15, rot=(0.0, math.radians(6.0), 0.0)),
        key("arm_b", 15, rot=(0.0, math.radians(-6.0), 0.0)),
        key("root", 30, loc=(0.0, 0.0, 0.0)),
        key("body", 30, rot=(0.0, 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, math.radians(-4.0))),
        key("cloth_front", 30, rot=(0.0, 0.0, 0.0)),
        key("cloth_back", 30, rot=(0.0, 0.0, 0.0)),
        key("cloth_left", 30, rot=(0.0, 0.0, 0.0)),
        key("cloth_right", 30, rot=(0.0, 0.0, 0.0)),
        key("arm_a", 30, rot=(0.0, 0.0, 0.0)),
        key("arm_b", 30, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "eat",
    0.5,
    [
        key("body", 0, rot=(0.0, 0.0, 0.0), loc=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)),
        key("cloth_front", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 7, rot=(math.radians(-6.0), 0.0, 0.0), loc=(-0.03, 0.0, 0.0)),
        key("head", 7, rot=(math.radians(-10.0), 0.0, 0.0), scale=(1.08, 1.08, 1.05)),
        key("cloth_front", 7, rot=(math.radians(-14.0), 0.0, 0.0)),
        key("body", 15, rot=(0.0, 0.0, 0.0), loc=(0.0, 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)),
        key("cloth_front", 15, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.0)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
