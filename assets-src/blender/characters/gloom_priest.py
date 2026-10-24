"""Gloom Priest - Spectral M2 enemy (spec 6.4, 12.4).

A thin, tall hooded Gloom cleric in a layered tattered robe with a bone plus-relic
on the chest and a long crooked staff. The staff is topped by a small bone skull
lantern holding a sickly green soul flame; the flame is the silhouette and colour
anchor that reads "healer/priest" even in black. Two glowing cyan eyes look out of
the dark cowl. Spectral violet trims and green glow accents do the magic look with
palette swatches only (no alpha material, spec 9.3/12.5).

Built by `npm run assets -- gloom_priest` through Blender's bundled Python
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
DUSK = 132  # gloom dusk purple, robe
DUSK_DARK = 131  # robe shadow layers and hood
DUSK_LIGHT = 134  # robe highlight
SHADOW = 120  # deepest tatters and the cowl interior
EYE = 139  # gloom eye cyan
EYE_LIGHT = 143
VIOLET = 67  # spectral trim
VIOLET_LIGHT = 69
BONE = 235  # skull lantern, plus-relic and trim
BONE_LIGHT = 237
INK = 243  # staff, skull sockets and hood opening
SOUL = 115  # hollow soul green, the lantern flame
SOUL_LIGHT = 117
WOOD = 227  # crooked staff shaft

# 1. Parts (sizes in tiles, the priest stands at the origin and faces +X).
# The robe is the big silhouette: a layered cone with tattered strips at the hem.
robe = cone("robe", radius1=0.25, radius2=0.13, depth=0.62, loc=(0.0, 0.0, 0.35), swatch=DUSK, vertices=12)
robe_layer = cone("robe_layer", radius1=0.20, radius2=0.13, depth=0.46, loc=(0.0, 0.0, 0.53), swatch=DUSK_LIGHT, vertices=10)
chest = sphere("chest", radius=0.125, loc=(0.03, 0.0, 0.68), swatch=DUSK, segments=10, rings=6, scale=(0.9, 1.0, 0.9))
back_hump = sphere("back_hump", radius=0.115, loc=(-0.10, 0.0, 0.72), swatch=DUSK_DARK, segments=10, rings=6, scale=(0.9, 1.0, 0.95))

# Tattered hem strips around the robe bottom; the longest touch the ground so the
# helper's feet-origin check passes.
hem_specs = ((0.16, 0.13, 0.26), (0.04, 0.22, 0.24), (-0.12, 0.15, 0.25), (-0.18, -0.05, 0.26), (0.12, -0.17, 0.24), (-0.02, -0.22, 0.25))
hem = [
    cone("hem_%d" % index, radius1=0.085, radius2=0.006, depth=depth, loc=(x, y, depth / 2.0 + 0.02), swatch=DUSK_DARK if index % 2 == 0 else DUSK, rot=(math.radians(-5.0 * (index - 2)), 0, 0), vertices=5)
    for index, (x, y, depth) in enumerate(hem_specs)
]
hem_glow = [
    cone("hem_glow_%d" % index, radius1=0.03, radius2=0.003, depth=0.12, loc=(x, y, 0.065), swatch=VIOLET if index % 2 == 0 else SOUL, rot=(math.radians(180), 0, 0), vertices=4)
    for index, (x, y, _depth) in enumerate(hem_specs[:3])
]

# Hood and dark cowl with two glowing eyes and a thin bone plus-relic on the chest.
hood = sphere("hood", radius=0.135, loc=(0.02, 0.0, 0.79), swatch=DUSK_DARK, segments=12, rings=8, scale=(1.0, 1.0, 1.0))
hood_tip = cone("hood_tip", radius1=0.095, radius2=0.008, depth=0.17, loc=(-0.03, 0.0, 0.88), swatch=DUSK_DARK, rot=(0, math.radians(-32), 0), vertices=9)
hood_brim = blob("hood_brim", size=(0.09, 0.23, 0.075), loc=(0.11, 0.0, 0.84), swatch=DUSK, bevel=0.03, bevel_segments=1, rot=(0, math.radians(16), 0))
cowl = sphere("cowl", radius=0.105, loc=(0.09, 0.0, 0.77), swatch=SHADOW, segments=10, rings=6, scale=(0.55, 0.95, 0.95))
eye_a = sphere("eye_a", radius=0.027, loc=(0.16, 0.043, 0.78), swatch=EYE, segments=8, rings=5)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.01, loc=(0.18, 0.045, 0.788), swatch=EYE_LIGHT, segments=5, rings=3)
glint_b = mirror_x(glint_a, name="glint_b")
plus_h = blob("plus_h", size=(0.015, 0.13, 0.035), loc=(0.135, 0.0, 0.63), swatch=BONE, bevel=0.005, bevel_segments=1, rot=(0, math.radians(10), 0))
plus_v = blob("plus_v", size=(0.015, 0.035, 0.13), loc=(0.135, 0.0, 0.63), swatch=BONE_LIGHT, bevel=0.005, bevel_segments=1, rot=(0, math.radians(10), 0))
robe_trim_a = blob("robe_trim_a", size=(0.02, 0.16, 0.10), loc=(0.10, 0.0, 0.44), swatch=VIOLET, bevel=0.004, bevel_segments=1, rot=(0, math.radians(8), 0))
cape_a = cone("cape_a", radius1=0.06, radius2=0.006, depth=0.20, loc=(-0.10, 0.20, 0.62), swatch=DUSK_DARK, rot=(math.radians(-18), 0, math.radians(-24)), vertices=5)
cape_b = mirror_x(cape_a, name="cape_b")
cape_c = cone("cape_c", radius1=0.05, radius2=0.005, depth=0.15, loc=(-0.16, 0.0, 0.58), swatch=DUSK_DARK, rot=(0, math.radians(-60), 0), vertices=5)

# Thin ghost sleeves; the +Y hand grips the staff, the -Y hand is a pale claw.
sleeve_a = capsule("sleeve_a", radius=0.045, depth=0.24, loc=(0.06, 0.13, 0.60), swatch=DUSK_DARK, rot=(0.0, math.radians(20), math.radians(-14)), segments=8)
hand_a = sphere("hand_a", radius=0.038, loc=(0.14, 0.19, 0.51), swatch=BONE, segments=6, rings=4, scale=(1.0, 1.0, 0.85))
sleeve_b = mirror_x(sleeve_a, name="sleeve_b")
hand_b = mirror_x(hand_a, name="hand_b")
claw_a = cone("claw_a", radius1=0.01, radius2=0.002, depth=0.05, loc=(0.17, -0.20, 0.48), swatch=BONE, rot=(0, math.radians(120), 0), vertices=5)
claw_b = cone("claw_b", radius1=0.009, radius2=0.002, depth=0.045, loc=(0.165, -0.225, 0.50), swatch=BONE, rot=(0, math.radians(120), math.radians(-18)), vertices=5)

# Crooked staff: three angled shaft segments planted on the ground, topped by a
# small bone skull lantern with a green soul flame.
staff_low = cylinder("staff_low", radius=0.022, depth=0.48, loc=(0.16, 0.24, 0.26), swatch=WOOD, rot=(0, math.radians(6), math.radians(-6)), vertices=7)
staff_mid = cylinder("staff_mid", radius=0.02, depth=0.30, loc=(0.175, 0.24, 0.56), swatch=WOOD, rot=(0, math.radians(-8), math.radians(4)), vertices=7)
staff_top = cylinder("staff_top", radius=0.018, depth=0.13, loc=(0.19, 0.24, 0.74), swatch=INK, rot=(0, math.radians(16), 0), vertices=7)
skull = sphere("skull", radius=0.06, loc=(0.215, 0.24, 0.81), swatch=BONE, segments=10, rings=6, scale=(1.0, 0.95, 0.9))
skull_jaw = blob("skull_jaw", size=(0.065, 0.085, 0.033), loc=(0.225, 0.24, 0.765), swatch=BONE_LIGHT, bevel=0.008, bevel_segments=1)
skull_socket_a = sphere("skull_socket_a", radius=0.018, loc=(0.262, 0.214, 0.82), swatch=INK, segments=6, rings=4)
skull_socket_b = mirror_x(skull_socket_a, name="skull_socket_b")
flame_core = sphere("flame_core", radius=0.048, loc=(0.225, 0.24, 0.875), swatch=SOUL, segments=8, rings=5, scale=(0.9, 0.9, 1.15))
flame_tip = sphere("flame_tip", radius=0.028, loc=(0.23, 0.24, 0.918), swatch=SOUL_LIGHT, segments=6, rings=4, scale=(0.8, 0.8, 1.1))
flame_glow = sphere("flame_glow", radius=0.015, loc=(0.20, 0.22, 0.94), swatch=SOUL_LIGHT, segments=5, rings=3)

# 2. Rig: root float, body sway, head for eye VFX, staff for the heal pulse and
# two cloth bones so the tatters trail.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.12), None),
        ("body", (0.0, 0.0, 0.12), (0.0, 0.0, 0.62), "root"),
        ("head", (0.02, 0.0, 0.62), (0.02, 0.0, 0.90), "body"),
        ("staff", (0.16, 0.24, 0.49), (0.22, 0.24, 0.82), "body"),
        ("arm_a", (0.06, 0.14, 0.65), (0.14, 0.19, 0.51), "body"),
        ("arm_b", (0.06, -0.14, 0.65), (0.16, -0.21, 0.49), "body"),
        ("cloth_front", (0.06, 0.0, 0.45), (0.10, 0.0, 0.02), "body"),
        ("cloth_back", (-0.08, 0.0, 0.45), (-0.12, 0.0, 0.06), "body"),
    ]
)
bind(
    {
        "body": [robe, robe_layer, chest, back_hump, sleeve_a, sleeve_b, robe_trim_a, plus_h, plus_v, cape_a, cape_b, cape_c],
        "head": [hood, hood_tip, hood_brim, cowl, eye_a, eye_b, glint_a, glint_b],
        "arm_a": [hand_a],
        "arm_b": [hand_b, claw_a, claw_b],
        "staff": [staff_low, staff_mid, staff_top, skull, skull_jaw, skull_socket_a, skull_socket_b, flame_core, flame_tip, flame_glow],
        "cloth_front": [hem[0], hem[3], hem_glow[0]],
        "cloth_back": [hem[1], hem[2], hem[4], hem[5], hem_glow[1], hem_glow[2]],
    },
    armature,
)

# 3. Clips: a slow floating walk with a staff sway, and a 0.5 s heal pulse where the
# staff and soul flame flare (the bite interval of the sim is 0.5 s, spec 6.2).
clip(
    "walk",
    1.0,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("staff", 0, rot=(0.0, 0.0, 0.0)),
        key("cloth_front", 0, rot=(0.0, 0.0, 0.0)),
        key("cloth_back", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.022)),
        key("body", 15, rot=(math.radians(-3.0), 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, math.radians(3.0))),
        key("staff", 15, rot=(math.radians(-4.0), math.radians(4.0), 0.0)),
        key("cloth_front", 15, rot=(math.radians(6.0), 0.0, 0.0)),
        key("cloth_back", 15, rot=(math.radians(-6.0), 0.0, 0.0)),
        key("root", 30, loc=(0.0, 0.0, 0.0)),
        key("body", 30, rot=(0.0, 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, 0.0)),
        key("staff", 30, rot=(0.0, 0.0, 0.0)),
        key("cloth_front", 30, rot=(0.0, 0.0, 0.0)),
        key("cloth_back", 30, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "eat",
    0.5,
    [
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("staff", 0, rot=(0.0, 0.0, 0.0), loc=(0.0, 0.0, 0.0)),
        key("body", 7, rot=(math.radians(-4.0), 0.0, 0.0)),
        key("head", 7, rot=(math.radians(-6.0), 0.0, 0.0)),
        key("staff", 7, rot=(math.radians(-10.0), 0.0, 0.0), loc=(0.0, 0.0, 0.06)),
        key("body", 15, rot=(0.0, 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, 0.0)),
        key("staff", 15, rot=(0.0, 0.0, 0.0), loc=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.0)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
