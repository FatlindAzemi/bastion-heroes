"""Glowshroom Monk - Wildgrove producer (spec 5.3, 12.4).

A small round monk in a brown robe sits cross-legged on a giant glowing teal
mushroom cap; closed eyes, tiny smile, a wooden staff with a glowing tip and a
few Essence motes floating up. The huge cap is the silhouette anchor, the round
robe body and the oversized hands read as "producer".

Built by `npm run assets -- glowshroom_monk` through Blender's bundled Python
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
ROBE = 228  # wood, robe main (one ramp step up: readable in the toon shadow band)
ROBE_DARK = 226  # wood shadow, hem and crossed legs
ROBE_LIGHT = 229  # wood highlight, collar
SKIN = 212  # skin
SKIN_DARK = 211
CAP = 155  # essence teal anchor, main cap
CAP_DARK = 152  # cap underside
CAP_LIGHT = 157  # glowing cap spots and motes
GLOW = 159  # staff core
INK = 243  # closed eyes and smile
STAFF = 230  # light wood

# 1. Parts: cap pedestal, round robe body, head, staff, glow motes (sizes in tiles).
cap = sphere("cap", radius=0.35, loc=(0.0, 0.0, 0.175), swatch=CAP, segments=16, rings=10, scale=(1.0, 1.0, 0.5))
cap_brim = cylinder("cap_brim", radius=0.355, depth=0.045, loc=(0.0, 0.0, 0.032), swatch=CAP_DARK, vertices=16)
spot_places = ((-0.17, 0.09, 0.028), (0.11, 0.17, 0.024), (0.17, -0.11, 0.026), (-0.09, -0.19, 0.022), (0.0, 0.0, 0.022))
cap_spots = [
    sphere(
        "cap_spot_%d" % index,
        radius=radius,
        loc=(x, y, 0.315 if index < 4 else 0.342),
        swatch=CAP_LIGHT,
        segments=6,
        rings=4,
        scale=(1.0, 1.0, 0.4),
    )
    for index, (x, y, radius) in enumerate(spot_places)
]

body = sphere("body", radius=0.17, loc=(0.0, 0.0, 0.50), swatch=ROBE, segments=12, rings=8, scale=(1.0, 1.0, 1.05))
body_trim = sphere("robe_hem", radius=0.176, loc=(0.0, 0.0, 0.365), swatch=ROBE_DARK, segments=12, rings=6, scale=(1.0, 1.0, 0.32))
collar = sphere("collar", radius=0.15, loc=(0.0, 0.0, 0.585), swatch=ROBE_LIGHT, segments=12, rings=6, scale=(1.12, 1.12, 0.32))
leg_a = capsule("leg_a", radius=0.042, depth=0.095, loc=(0.135, 0.055, 0.345), swatch=ROBE_DARK, rot=(math.radians(90), 0, math.radians(22)), segments=8)
leg_b = capsule("leg_b", radius=0.042, depth=0.095, loc=(0.135, -0.055, 0.345), swatch=ROBE_DARK, rot=(math.radians(90), 0, math.radians(-22)), segments=8)
foot_a = sphere("foot_a", radius=0.028, loc=(0.185, 0.09, 0.332), swatch=SKIN_DARK, segments=6, rings=4)
foot_b = mirror_x(foot_a, name="foot_b")

head = sphere("head", radius=0.128, loc=(0.03, 0.0, 0.655), swatch=SKIN, segments=12, rings=8)
# Closed, content eyes: two short strokes per eye make a soft downward arc.
eye_a_outer = sphere("eye_a_outer", radius=0.021, loc=(0.15, 0.072, 0.703), swatch=INK, segments=6, rings=4, scale=(0.45, 1.2, 0.3))
eye_a_inner = sphere("eye_a_inner", radius=0.018, loc=(0.15, 0.038, 0.694), swatch=INK, segments=6, rings=4, scale=(0.45, 1.0, 0.3))
eye_b_outer = mirror_x(eye_a_outer, name="eye_b_outer")
eye_b_inner = mirror_x(eye_a_inner, name="eye_b_inner")
nose = sphere("nose", radius=0.016, loc=(0.156, 0.0, 0.667), swatch=SKIN_DARK, segments=6, rings=4, scale=(1.0, 1.0, 0.8))
smile = sphere("smile", radius=0.022, loc=(0.153, 0.0, 0.641), swatch=INK, segments=8, rings=5, scale=(0.4, 1.15, 0.28))
cheek_a = sphere("cheek_a", radius=0.018, loc=(0.13, 0.085, 0.652), swatch=SKIN_DARK, segments=6, rings=4, scale=(0.6, 1.0, 0.7))
cheek_b = mirror_x(cheek_a, name="cheek_b")

sleeve_a = blob("sleeve_a", size=(0.12, 0.10, 0.16), loc=(0.02, 0.155, 0.465), swatch=ROBE, bevel=0.04, rot=(0.0, math.radians(-12), 0.0))
sleeve_b = mirror_x(sleeve_a, name="sleeve_b")
hand_a = sphere("hand_a", radius=0.052, loc=(0.085, 0.175, 0.355), swatch=SKIN, segments=8, rings=6)
hand_b = mirror_x(hand_a, name="hand_b")

staff = cylinder("staff", radius=0.016, depth=0.64, loc=(0.22, 0.175, 0.32), swatch=STAFF, vertices=8)
staff_orb = sphere("staff_orb", radius=0.054, loc=(0.22, 0.175, 0.655), swatch=CAP_LIGHT, segments=10, rings=6)
staff_core = sphere("staff_core", radius=0.022, loc=(0.262, 0.175, 0.666), swatch=GLOW, segments=6, rings=4)

mote_places = ((0.10, 0.06, 0.78), (0.0, -0.12, 0.835), (-0.10, 0.10, 0.765))
motes = [
    sphere("mote_%d" % index, radius=0.016, loc=place, swatch=CAP_LIGHT, segments=6, rings=4)
    for index, place in enumerate(mote_places)
]

# 2. Rig: the cap can pulse on its own, the monk body and head sit above it.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("cap", (0.0, 0.0, 0.08), (0.0, 0.0, 0.32), "root"),
        ("body", (0.0, 0.0, 0.32), (0.0, 0.0, 0.58), "root"),
        ("head", (0.03, 0.0, 0.58), (0.03, 0.0, 0.80), "body"),
        ("hand_a", (0.18, 0.16, 0.46), (0.22, 0.18, 0.60), "body"),
        ("hand_b", (0.18, -0.16, 0.46), (0.22, -0.18, 0.60), "body"),
    ]
)
bind(
    {
        "cap": [cap, cap_brim, *cap_spots],
        "body": [body, body_trim, collar, leg_a, leg_b, foot_a, foot_b, sleeve_a, sleeve_b],
        "head": [head, eye_a_outer, eye_a_inner, eye_b_outer, eye_b_inner, nose, smile, cheek_a, cheek_b, *motes],
        "hand_a": [hand_a, staff, staff_orb, staff_core],
        "hand_b": [hand_b],
    },
    armature,
)

# 3. Clips: calm breathing idle, a cap glow pulse for produce, a happy hop for victory.
clip(
    "idle",
    2.0,
    [
        key("body", 0, scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("cap", 0, scale=(1.0, 1.0, 1.0)),
        key("body", 30, scale=(1.025, 1.025, 0.975)),
        key("head", 30, rot=(0.0, math.radians(3.0), 0.0)),
        key("cap", 30, scale=(1.012, 1.012, 0.99)),
        key("body", 60, scale=(1.0, 1.0, 1.0)),
        key("head", 60, rot=(0.0, 0.0, 0.0)),
        key("cap", 60, scale=(1.0, 1.0, 1.0)),
    ],
)
clip(
    "produce",
    0.6,
    [
        key("cap", 0, scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("cap", 9, scale=(1.12, 1.12, 1.08)),
        key("head", 9, rot=(math.radians(-7.0), 0.0, 0.0)),
        key("cap", 18, scale=(1.0, 1.0, 1.0)),
        key("head", 18, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("root", 12, loc=(0.0, 0.0, 0.18)),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.7, 0.9)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
