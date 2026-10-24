"""Boomcap Brewer - Wildgrove splash defender (spec 5.2, 5.3, 12.4).

A chubby mushroom-headed alchemist: the big red-spotted cap is the silhouette
anchor, a cream apron and moss-green tunic cover the round body, a belt of bubbling
potion bottles hangs around the waist, and one oversized arm lobs a flask forward
(+X). Idle breathes and wobbles the cap, attack is a 0.4 s underhand lob, victory a
happy hop.

Built by `npm run assets -- boomcap_brewer` through Blender's bundled Python
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
CAP = 35  # wildgrove mushroom red anchor, saturated
CAP_DARK = 34
SPOT = 237  # bone cream spots, bright
SKIN = 212
SKIN_DARK = 211
TUNIC = 44  # wildgrove moss green
TUNIC_DARK = 42
APRON = 236  # bone cream apron
APRON_STRAP = 235
BELT = 227  # wood
BUCKLE = 20  # forge steel
POTION = 155  # essence teal
POTION_WARM = 12  # forge orange
BUBBLE = 159
BOOT = 226
INK = 243
GLINT = 255

# 1. Parts: chubby body, huge spotted cap, apron, potion belt, lobbing arm (sizes in tiles).
body = sphere("body", radius=0.19, loc=(0.0, 0.0, 0.38), swatch=TUNIC, segments=10, rings=6, scale=(1.0, 1.0, 1.02))
belly = sphere("apron", radius=0.175, loc=(0.075, 0.0, 0.36), swatch=APRON, segments=10, rings=6, scale=(0.72, 0.95, 0.98))
belt = sphere("belt", radius=0.196, loc=(0.0, 0.0, 0.285), swatch=BELT, segments=10, rings=5, scale=(1.0, 1.0, 0.16))
buckle = blob("buckle", size=(0.05, 0.06, 0.05), loc=(0.19, 0.0, 0.285), swatch=BUCKLE, bevel=0.012, bevel_segments=1)

# Belt of bubbling potion bottles: two teal, one warm, with wooden corks and bubbles.
bottle_a = cylinder("bottle_a", radius=0.04, depth=0.11, loc=(0.145, 0.115, 0.30), swatch=POTION, rot=(0.0, 0.0, math.radians(-16)), vertices=6)
bottle_b = cylinder("bottle_b", radius=0.036, depth=0.10, loc=(0.14, -0.105, 0.30), swatch=POTION_WARM, rot=(0.0, 0.0, math.radians(12)), vertices=6)
bottle_c = cylinder("bottle_c", radius=0.032, depth=0.09, loc=(-0.13, -0.14, 0.30), swatch=POTION, rot=(0.0, 0.0, math.radians(20)), vertices=6)
cork_a = cylinder("cork_a", radius=0.021, depth=0.03, loc=(0.145, 0.115, 0.372), swatch=BELT, vertices=6)
cork_b = cylinder("cork_b", radius=0.019, depth=0.03, loc=(0.14, -0.105, 0.367), swatch=BELT, vertices=6)
cork_c = cylinder("cork_c", radius=0.017, depth=0.03, loc=(-0.13, -0.14, 0.358), swatch=BELT, vertices=6)
bubble_a = sphere("bubble_a", radius=0.016, loc=(0.17, 0.115, 0.34), swatch=BUBBLE, segments=6, rings=4)
bubble_b = sphere("bubble_b", radius=0.012, loc=(0.16, -0.105, 0.335), swatch=BUBBLE, segments=6, rings=4)
apron_strap_a = blob("apron_strap_a", size=(0.035, 0.06, 0.17), loc=(0.10, 0.10, 0.475), swatch=APRON_STRAP, bevel=0.008, bevel_segments=1, rot=(0.0, math.radians(-14), 0.0))
apron_strap_b = mirror_x(apron_strap_a, name="apron_strap_b")

# Head and the big spotted mushroom cap: the silhouette anchor.
head = sphere("head", radius=0.155, loc=(0.02, 0.0, 0.60), swatch=SKIN, segments=10, rings=6)
cap = sphere("cap", radius=0.27, loc=(0.0, 0.0, 0.75), swatch=CAP, segments=12, rings=8, scale=(1.0, 1.0, 0.5))
cap_brim = cylinder("cap_brim", radius=0.265, depth=0.045, loc=(0.0, 0.0, 0.708), swatch=CAP_DARK, vertices=14)
spot_places = ((0.02, 0.14, 0.055), (-0.12, 0.09, 0.05), (0.15, -0.06, 0.055), (-0.06, -0.15, 0.045), (0.0, 0.0, 0.05))
cap_spots = [
    sphere(
        "cap_spot_%d" % index,
        radius=radius,
        loc=(x, y, 0.835 if index < 4 else 0.858),
        swatch=SPOT,
        segments=6,
        rings=4,
        scale=(1.0, 1.0, 0.4),
    )
    for index, (x, y, radius) in enumerate(spot_places)
]

# Cheerful face: big round eyes with a glint, round nose, broad grin with one tooth.
eye_a = sphere("eye_a", radius=0.034, loc=(0.155, 0.064, 0.635), swatch=INK, segments=8, rings=6)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.013, loc=(0.175, 0.064, 0.648), swatch=GLINT, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")
nose = sphere("nose", radius=0.026, loc=(0.185, 0.0, 0.597), swatch=SKIN_DARK, segments=6, rings=4, scale=(1.0, 1.0, 0.85))
cheek_a = sphere("cheek_a", radius=0.02, loc=(0.148, 0.095, 0.603), swatch=SKIN_DARK, segments=6, rings=4, scale=(0.5, 1.0, 0.7))
cheek_b = mirror_x(cheek_a, name="cheek_b")
grin = sphere("grin", radius=0.048, loc=(0.17, 0.0, 0.552), swatch=INK, segments=8, rings=5, scale=(0.32, 1.3, 0.45))
tooth = blob("tooth", size=(0.014, 0.02, 0.016), loc=(0.188, 0.0, 0.565), swatch=SPOT, bevel=0.004, bevel_segments=1)

# Arms: one arm lobs a flask, the other rests oversized on the apron.
shoulder_a = sphere("shoulder_a", radius=0.062, loc=(0.02, 0.175, 0.45), swatch=TUNIC, segments=6, rings=4)
shoulder_b = mirror_x(shoulder_a, name="shoulder_b")
arm_lob = capsule("arm_lob", radius=0.048, depth=0.16, loc=(0.13, 0.17, 0.52), swatch=TUNIC, rot=(0.0, math.radians(58), math.radians(-14)), segments=8)
hand_lob = sphere("hand_lob", radius=0.055, loc=(0.235, 0.14, 0.585), swatch=SKIN, segments=6, rings=4)
arm_rest = capsule("arm_rest", radius=0.05, depth=0.15, loc=(0.10, -0.18, 0.37), swatch=TUNIC, rot=(0.0, math.radians(28), math.radians(12)), segments=8)
hand_rest = sphere("hand_rest", radius=0.058, loc=(0.09, -0.245, 0.30), swatch=SKIN, segments=6, rings=4)

# The lobbed flask above the raised hand.
flask = sphere("flask", radius=0.072, loc=(0.30, 0.15, 0.665), swatch=POTION_WARM, segments=8, rings=5)
flask_neck = cylinder("flask_neck", radius=0.023, depth=0.07, loc=(0.30, 0.15, 0.735), swatch=POTION_WARM, vertices=8)
flask_cork = cylinder("flask_cork", radius=0.02, depth=0.03, loc=(0.30, 0.15, 0.775), swatch=BELT, vertices=6)
flask_bubble = sphere("flask_bubble", radius=0.018, loc=(0.315, 0.13, 0.70), swatch=BUBBLE, segments=6, rings=4)

# Stubby legs and boots.
leg_a = capsule("leg_a", radius=0.07, depth=0.11, loc=(0.0, 0.11, 0.125), swatch=TUNIC_DARK, segments=8)
leg_b = mirror_x(leg_a, name="leg_b")
boot_a = blob("boot_a", size=(0.16, 0.15, 0.10), loc=(0.03, 0.11, 0.05), swatch=BOOT, bevel=0.03, bevel_segments=1)
boot_b = mirror_x(boot_a, name="boot_b")

# 2. Rig: cap and flask arm get their own bones for the wobble and the lob.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.46), "root"),
        ("head", (0.02, 0.0, 0.46), (0.02, 0.0, 0.70), "body"),
        ("cap", (0.0, 0.0, 0.68), (0.0, 0.0, 0.88), "head"),
        ("hand_lob", (0.16, 0.16, 0.50), (0.30, 0.15, 0.62), "body"),
        ("hand_rest", (0.10, -0.16, 0.42), (0.19, -0.20, 0.34), "body"),
        ("leg_a", (0.0, 0.11, 0.17), (0.0, 0.11, 0.02), "root"),
        ("leg_b", (0.0, -0.11, 0.17), (0.0, -0.11, 0.02), "root"),
    ]
)
bind(
    {
        "body": [body, belly, belt, buckle, bottle_a, bottle_b, bottle_c, cork_a, cork_b, cork_c, bubble_a, bubble_b, apron_strap_a, apron_strap_b, shoulder_a, shoulder_b, arm_rest],
        "head": [head, eye_a, eye_b, glint_a, glint_b, nose, cheek_a, cheek_b, grin, tooth],
        "cap": [cap, cap_brim, *cap_spots],
        "hand_lob": [arm_lob, hand_lob, flask, flask_neck, flask_cork, flask_bubble],
        "hand_rest": [hand_rest],
        "leg_a": [leg_a, boot_a],
        "leg_b": [leg_b, boot_b],
    },
    armature,
)

# 3. Clips: breathing idle with a cap wobble, a 0.4 s lob, a victory hop.
clip(
    "idle",
    2.0,
    [
        key("body", 0, scale=(1.0, 1.0, 1.0)),
        key("cap", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_lob", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 30, scale=(1.025, 1.025, 0.98)),
        key("cap", 30, rot=(math.radians(2.0), math.radians(3.0), 0.0)),
        key("hand_lob", 30, rot=(math.radians(-4.0), 0.0, 0.0)),
        key("body", 60, scale=(1.0, 1.0, 1.0)),
        key("cap", 60, rot=(0.0, 0.0, 0.0)),
        key("hand_lob", 60, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "attack",
    0.4,
    [
        key("hand_lob", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_lob", 3, rot=(math.radians(22.0), 0.0, 0.0)),
        key("body", 3, rot=(0.0, math.radians(6.0), 0.0)),
        key("hand_lob", 6, rot=(math.radians(-30.0), 0.0, 0.0)),
        key("body", 6, rot=(0.0, math.radians(-8.0), 0.0)),
        key("hand_lob", 12, rot=(0.0, 0.0, 0.0)),
        key("body", 12, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("cap", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 12, loc=(0.0, 0.0, 0.20)),
        key("cap", 12, rot=(math.radians(-8.0), 0.0, 0.0)),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
        key("cap", 24, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.7, 0.9)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
