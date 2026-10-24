"""Pyro Fox - Wildgrove epic lob attacker (spec 5.2, 5.3, 12.4).

A bipedal kitsune-like fire fox: warm orange fur, cream belly/snout, a tiny moss
green Wildgrove vest and a huge bushy tail with red-to-flame tips (the silhouette
anchor). It lobs a fireball from a raised paw while small fire orbs drift around
it; a playful grin and big eyes keep it cartoony.

Built by `npm run assets -- pyro_fox` through Blender's bundled Python
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
FUR = 12  # forge orange, one step up for the toon shadow band
FUR_DARK = 10
FUR_LIGHT = 14
RED = 36  # wildgrove mushroom red, tail and vest trim
RED_DARK = 34
CREAM = 237  # bone cream belly, snout, paws
CREAM_DARK = 235
VEST = 44  # wildgrove moss green vest
VEST_DARK = 42
FLAME = 13  # bright fire highlight
FIRE_CORE = 255
INK = 243
GLINT = 255

# 1. Parts (sizes in tiles; the fox faces +X).
leg_a = capsule("leg_a", radius=0.06, depth=0.22, loc=(0.0, 0.09, 0.19), swatch=FUR, segments=6)
leg_b = mirror_x(leg_a, name="leg_b")
foot_a = blob("foot_a", size=(0.17, 0.11, 0.09), loc=(0.04, 0.09, 0.045), swatch=FUR_DARK, bevel=0.025, bevel_segments=1)
foot_b = mirror_x(foot_a, name="foot_b")
toe_a = sphere("toe_a", radius=0.022, loc=(0.125, 0.06, 0.05), swatch=CREAM, segments=6, rings=4)
toe_b = sphere("toe_b", radius=0.022, loc=(0.125, 0.115, 0.05), swatch=CREAM, segments=6, rings=4)
toe_c = mirror_x(toe_a, name="toe_c")
toe_d = mirror_x(toe_b, name="toe_d")

torso = sphere("torso", radius=0.16, loc=(0.0, 0.0, 0.46), swatch=FUR, segments=10, rings=6, scale=(1.0, 0.9, 1.15))
belly = sphere("belly", radius=0.12, loc=(0.08, 0.0, 0.44), swatch=CREAM, segments=8, rings=5, scale=(0.78, 1.0, 1.05))
vest_a = blob("vest_a", size=(0.13, 0.07, 0.24), loc=(-0.02, 0.14, 0.48), swatch=VEST, bevel=0.025, bevel_segments=1, rot=(0.0, math.radians(-4), 0.0))
vest_b = mirror_x(vest_a, name="vest_b")
vest_back = blob("vest_back", size=(0.07, 0.26, 0.24), loc=(-0.12, 0.0, 0.47), swatch=VEST_DARK, bevel=0.025, bevel_segments=1)
belt = blob("belt", size=(0.27, 0.21, 0.045), loc=(0.01, 0.0, 0.36), swatch=RED_DARK, bevel=0.012, bevel_segments=1)
buckle = blob("buckle", size=(0.04, 0.05, 0.05), loc=(0.13, 0.0, 0.36), swatch=CREAM_DARK, bevel=0.008, bevel_segments=1)

# Head: fox muzzle, big eyes, cheek tufts and two big ears.
head = sphere("head", radius=0.15, loc=(0.04, 0.0, 0.76), swatch=FUR, segments=10, rings=6)
snout_top = blob("snout_top", size=(0.23, 0.10, 0.065), loc=(0.22, 0.0, 0.745), swatch=FUR, bevel=0.025, bevel_segments=1)
snout_bottom = blob("snout_bottom", size=(0.21, 0.09, 0.05), loc=(0.21, 0.0, 0.705), swatch=CREAM, bevel=0.02, bevel_segments=1)
nose = sphere("nose", radius=0.026, loc=(0.33, 0.0, 0.752), swatch=INK, segments=6, rings=4)
grin = sphere("grin", radius=0.045, loc=(0.255, 0.0, 0.69), swatch=INK, segments=8, rings=5, scale=(0.4, 1.15, 0.45))
tooth_a = blob("tooth_a", size=(0.014, 0.02, 0.018), loc=(0.265, 0.025, 0.70), swatch=CREAM, bevel=0.004, bevel_segments=1)
tooth_b = mirror_x(tooth_a, name="tooth_b")
cheek_a = sphere("cheek_a", radius=0.05, loc=(0.09, 0.125, 0.70), swatch=CREAM, segments=6, rings=4, scale=(0.9, 1.0, 0.9))
cheek_b = mirror_x(cheek_a, name="cheek_b")
eye_a = sphere("eye_a", radius=0.033, loc=(0.135, 0.075, 0.80), swatch=INK, segments=8, rings=5)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.013, loc=(0.163, 0.075, 0.812), swatch=GLINT, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")
brow_a = blob("brow_a", size=(0.06, 0.035, 0.02), loc=(0.13, 0.075, 0.84), swatch=FUR_DARK, bevel=0.006, bevel_segments=1, rot=(0.0, 0.0, math.radians(10)))
brow_b = mirror_x(brow_a, name="brow_b")

ear_a = cone("ear_a", radius1=0.075, radius2=0.008, depth=0.22, loc=(-0.01, 0.10, 0.94), swatch=FUR, rot=(math.radians(-16), math.radians(-10), 0), vertices=7)
ear_b = mirror_x(ear_a, name="ear_b")
ear_inner_a = cone("ear_inner_a", radius1=0.045, radius2=0.005, depth=0.15, loc=(-0.005, 0.11, 0.945), swatch=RED, rot=(math.radians(-16), math.radians(-10), 0), vertices=6)
ear_inner_b = mirror_x(ear_inner_a, name="ear_inner_b")

# Big bushy tail: orange base, red mid, flame tip (the silhouette anchor).
tail_1 = sphere("tail_1", radius=0.10, loc=(-0.18, 0.0, 0.44), swatch=FUR_DARK, segments=8, rings=5)
tail_2 = sphere("tail_2", radius=0.14, loc=(-0.31, 0.0, 0.52), swatch=FUR, segments=10, rings=6)
tail_3 = sphere("tail_3", radius=0.13, loc=(-0.40, 0.0, 0.65), swatch=RED, segments=10, rings=6)
tail_4 = sphere("tail_4", radius=0.09, loc=(-0.42, 0.0, 0.77), swatch=RED, segments=8, rings=5)
tail_tip = sphere("tail_tip", radius=0.055, loc=(-0.42, 0.0, 0.855), swatch=FLAME, segments=8, rings=5)
tail_lick_a = blob("tail_lick_a", size=(0.035, 0.04, 0.08), loc=(-0.42, 0.035, 0.92), swatch=FLAME, bevel=0.008, bevel_segments=1)
tail_lick_b = blob("tail_lick_b", size=(0.03, 0.035, 0.06), loc=(-0.39, -0.03, 0.895), swatch=RED, bevel=0.006, bevel_segments=1)
tail_lick_c = blob("tail_lick_c", size=(0.03, 0.035, 0.08), loc=(-0.44, 0.02, 0.945), swatch=FLAME, bevel=0.007, bevel_segments=1)
tail_lick_d = blob("tail_lick_d", size=(0.026, 0.03, 0.06), loc=(-0.40, -0.03, 0.935), swatch=RED, bevel=0.006, bevel_segments=1)

# Arms: a raised paw lobs a fireball; the other rests at the side.
shoulder_a = sphere("shoulder_a", radius=0.06, loc=(0.03, 0.145, 0.56), swatch=FUR, segments=6, rings=4)
shoulder_b = mirror_x(shoulder_a, name="shoulder_b")
arm_fire = capsule("arm_fire", radius=0.045, depth=0.22, loc=(0.13, 0.19, 0.68), swatch=FUR, rot=(0.0, math.radians(74), math.radians(-10)), segments=6)
paw_fire = sphere("paw_fire", radius=0.055, loc=(0.22, 0.25, 0.79), swatch=CREAM, segments=6, rings=4)
arm_free = capsule("arm_free", radius=0.045, depth=0.17, loc=(0.06, -0.17, 0.44), swatch=FUR, rot=(0.0, math.radians(26), math.radians(10)), segments=6)
paw_free = sphere("paw_free", radius=0.055, loc=(0.14, -0.20, 0.38), swatch=CREAM, segments=6, rings=4)

fireball = sphere("fireball", radius=0.075, loc=(0.27, 0.27, 0.91), swatch=FUR, segments=10, rings=6)
fire_core = sphere("fire_core", radius=0.042, loc=(0.29, 0.28, 0.925), swatch=FLAME, segments=8, rings=5)
fire_glint = sphere("fire_glint", radius=0.02, loc=(0.32, 0.28, 0.94), swatch=FIRE_CORE, segments=6, rings=4)
fire_lick = blob("fire_lick", size=(0.035, 0.045, 0.09), loc=(0.27, 0.27, 0.99), swatch=RED, bevel=0.008, bevel_segments=1)

orb_places = ((0.40, -0.14, 0.86), (-0.16, 0.24, 0.78), (-0.05, -0.26, 0.88))
orbs = [
    sphere("orb_%d" % index, radius=0.045, loc=place, swatch=FUR, segments=8, rings=5)
    for index, place in enumerate(orb_places)
]
orb_cores = [
    sphere("orb_core_%d" % index, radius=0.024, loc=(x + 0.02, y, z + 0.01), swatch=FLAME, segments=6, rings=4)
    for index, (x, y, z) in enumerate(orb_places)
]

# 2. Rig: tail and orbs get their own bones for the sway and the juggling drift.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.56), "root"),
        ("head", (0.04, 0.0, 0.56), (0.04, 0.0, 0.86), "body"),
        ("ear_a", (0.0, 0.10, 0.90), (0.0, 0.12, 1.02), "head"),
        ("ear_b", (0.0, -0.10, 0.90), (0.0, -0.12, 1.02), "head"),
        ("tail", (-0.16, 0.0, 0.42), (-0.40, 0.0, 0.80), "body"),
        ("orbs", (0.12, 0.0, 0.80), (0.12, 0.0, 0.92), "body"),
        ("hand_fire", (0.16, 0.14, 0.58), (0.30, 0.14, 0.74), "body"),
        ("hand_free", (0.08, -0.15, 0.48), (0.15, -0.20, 0.39), "body"),
        ("leg_a", (0.0, 0.09, 0.17), (0.0, 0.09, 0.02), "root"),
        ("leg_b", (0.0, -0.09, 0.17), (0.0, -0.09, 0.02), "root"),
    ]
)
bind(
    {
        "body": [torso, belly, vest_a, vest_b, vest_back, belt, buckle, shoulder_a, shoulder_b, arm_free],
        "head": [head, snout_top, snout_bottom, nose, grin, tooth_a, tooth_b, cheek_a, cheek_b, eye_a, eye_b, glint_a, glint_b, brow_a, brow_b],
        "ear_a": [ear_a, ear_inner_a],
        "ear_b": [ear_b, ear_inner_b],
        "tail": [tail_1, tail_2, tail_3, tail_4, tail_tip, tail_lick_a, tail_lick_b, tail_lick_c, tail_lick_d],
        "orbs": [*orbs, *orb_cores],
        "hand_fire": [arm_fire, paw_fire, fireball, fire_core, fire_glint, fire_lick],
        "hand_free": [paw_free],
        "leg_a": [leg_a, foot_a, toe_a, toe_b],
        "leg_b": [leg_b, foot_b, toe_c, toe_d],
    },
    armature,
)

# 3. Clips: playful idle with tail sway and floating fire, a lob, a victory hop.
clip(
    "idle",
    2.0,
    [
        key("body", 0, scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("tail", 0, rot=(0.0, 0.0, math.radians(-8.0))),
        key("orbs", 0, rot=(0.0, 0.0, 0.0), loc=(0.0, 0.0, 0.0)),
        key("ear_a", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 30, scale=(1.02, 1.02, 0.985)),
        key("head", 30, rot=(0.0, math.radians(4.0), 0.0)),
        key("tail", 30, rot=(0.0, 0.0, math.radians(10.0))),
        key("orbs", 30, rot=(0.0, 0.0, math.pi), loc=(0.0, 0.0, 0.03)),
        key("ear_a", 30, rot=(math.radians(-8.0), 0.0, 0.0)),
        key("body", 60, scale=(1.0, 1.0, 1.0)),
        key("head", 60, rot=(0.0, 0.0, 0.0)),
        key("tail", 60, rot=(0.0, 0.0, math.radians(-8.0))),
        key("orbs", 60, rot=(0.0, 0.0, math.tau), loc=(0.0, 0.0, 0.0)),
        key("ear_a", 60, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "attack",
    0.4,
    [
        key("hand_fire", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("tail", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_fire", 3, rot=(math.radians(24.0), 0.0, 0.0)),
        key("body", 3, rot=(0.0, math.radians(5.0), 0.0)),
        key("tail", 3, rot=(0.0, 0.0, math.radians(-14.0))),
        key("hand_fire", 6, rot=(math.radians(-32.0), 0.0, 0.0)),
        key("body", 6, rot=(0.0, math.radians(-6.0), 0.0)),
        key("tail", 6, rot=(0.0, 0.0, math.radians(16.0))),
        key("hand_fire", 12, rot=(0.0, 0.0, 0.0)),
        key("body", 12, rot=(0.0, 0.0, 0.0)),
        key("tail", 12, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("tail", 0, rot=(0.0, 0.0, 0.0)),
        key("orbs", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 12, loc=(0.0, 0.0, 0.24)),
        key("tail", 12, rot=(0.0, math.radians(20.0), 0.0)),
        key("orbs", 12, rot=(0.0, 0.0, math.pi)),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
        key("tail", 24, rot=(0.0, 0.0, 0.0)),
        key("orbs", 24, rot=(0.0, 0.0, math.tau)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.1)
assert_tris(4500)
assert_origin_at_feet()
export_glb(OUT)
