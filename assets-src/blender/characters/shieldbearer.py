"""Shieldbearer - Armored M2 enemy (spec 6.4, 12.4).

A taller, hulking Gloomling that carries a ruined house door as a shield, holding
it forward on its +X side so straight and diagonal shots hit the door first
(spec 6.2). The door is the silhouette anchor: a big plank slab with an iron
frame, nails sticking out, a bone eye-rune on the front and jagged spikes along
the top and the free shoulder. It is always hunched behind the door.

Built by `npm run assets -- shieldbearer` through Blender's bundled Python
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
DUSK = 132  # gloom dusk purple, body
DUSK_DARK = 131
BELLY = 133  # lighter dusk chest
SHADOW = 120  # gloom shadow, spikes and claws
EYE = 139  # gloom eye cyan
EYE_LIGHT = 143
BONE = 235  # bone paint and teeth
BONE_LIGHT = 237
INK = 243  # mouth and rune notches
IRON = 217  # iron door frame, shoulder plates
IRON_DARK = 216
IRON_LIGHT = 220  # nail heads and rivets
WOOD = 227  # door planks
WOOD_DARK = 226
WOOD_LIGHT = 229
RUST = 9  # rust around the nails

# 1. Parts (sizes in tiles, character stands hunched at the origin and faces +X).
# The body leans into the door, so the head sits low and forward.
body = blob("body", size=(0.30, 0.30, 0.40), loc=(-0.05, 0.0, 0.44), swatch=DUSK, bevel=0.09, bevel_segments=1)
hump = sphere("hump", radius=0.17, loc=(-0.14, 0.0, 0.60), swatch=DUSK_DARK, segments=8, rings=5, scale=(0.9, 1.0, 0.95))
chest = sphere("chest", radius=0.15, loc=(0.07, 0.0, 0.42), swatch=BELLY, segments=8, rings=5, scale=(0.7, 1.05, 1.0))
neck = capsule("neck", radius=0.07, depth=0.07, loc=(0.03, 0.0, 0.64), swatch=DUSK_DARK, segments=8)
head = sphere("head", radius=0.125, loc=(0.06, 0.0, 0.72), swatch=DUSK, segments=10, rings=7, scale=(1.0, 1.0, 0.98))
helmet = blob("helmet", size=(0.20, 0.24, 0.10), loc=(0.02, 0.0, 0.80), swatch=IRON_DARK, bevel=0.03, bevel_segments=1, rot=(0, 0, math.radians(4)))
helmet_ridge = cone("helmet_ridge", radius1=0.035, radius2=0.004, depth=0.12, loc=(-0.07, 0.0, 0.85), swatch=SHADOW, rot=(0, math.radians(-58), 0), vertices=6)

# The face is a wide angry brow over two cyan eyes and a toothy jaw.
brow = blob("brow", size=(0.055, 0.16, 0.04), loc=(0.16, 0.0, 0.745), swatch=SHADOW, bevel=0.012, bevel_segments=1)
eye_a = sphere("eye_a", radius=0.038, loc=(0.175, 0.055, 0.70), swatch=EYE, segments=8, rings=6)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.012, loc=(0.205, 0.058, 0.712), swatch=EYE_LIGHT, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")
mouth = sphere("mouth", radius=0.055, loc=(0.175, 0.0, 0.64), swatch=INK, segments=8, rings=5, scale=(0.3, 1.2, 0.65))
tooth_a = blob("tooth_a", size=(0.018, 0.02, 0.026), loc=(0.196, -0.032, 0.652), swatch=BONE, bevel=0.005, bevel_segments=1)
tooth_b = blob("tooth_b", size=(0.018, 0.02, 0.026), loc=(0.198, 0.0, 0.655), swatch=BONE, bevel=0.005, bevel_segments=1)
tooth_c = mirror_x(tooth_a, name="tooth_c")

# Jagged spikes on the free (left) shoulder and down the back.
back_spike_a = cone("back_spike_a", radius1=0.05, radius2=0.006, depth=0.20, loc=(-0.19, 0.0, 0.62), swatch=SHADOW, rot=(0, math.radians(-64), 0), vertices=6)
back_spike_b = cone("back_spike_b", radius1=0.042, radius2=0.005, depth=0.16, loc=(-0.21, 0.0, 0.46), swatch=SHADOW, rot=(0, math.radians(-72), 0), vertices=6)
back_spike_c = cone("back_spike_c", radius1=0.034, radius2=0.005, depth=0.12, loc=(-0.19, 0.0, 0.31), swatch=SHADOW, rot=(0, math.radians(-78), 0), vertices=6)
shoulder_plate = blob("shoulder_plate", size=(0.16, 0.20, 0.10), loc=(0.0, -0.18, 0.60), swatch=IRON, bevel=0.025, bevel_segments=1)
shoulder_spike = cone("shoulder_spike", radius1=0.05, radius2=0.006, depth=0.16, loc=(-0.02, -0.24, 0.66), swatch=SHADOW, rot=(math.radians(-52), 0, 0), vertices=6)

# The door shield: a thick slab on the +X side, with plank seams, an iron frame,
# nails sticking out of the front and a bone eye-rune as the emblem.
shield_slab = blob("shield_slab", size=(0.09, 0.44, 0.62), loc=(0.30, 0.0, 0.47), swatch=WOOD_DARK, bevel=0.025, bevel_segments=1)
plank_a = blob("plank_a", size=(0.05, 0.12, 0.58), loc=(0.345, -0.145, 0.47), swatch=WOOD, bevel=0.012, bevel_segments=1)
plank_b = blob("plank_b", size=(0.05, 0.12, 0.58), loc=(0.345, 0.0, 0.47), swatch=WOOD_LIGHT, bevel=0.012, bevel_segments=1)
plank_c = blob("plank_c", size=(0.05, 0.12, 0.58), loc=(0.345, 0.145, 0.47), swatch=WOOD, bevel=0.012, bevel_segments=1)
frame_top = blob("frame_top", size=(0.07, 0.46, 0.07), loc=(0.33, 0.0, 0.80), swatch=IRON_DARK, bevel=0.015, bevel_segments=1)
frame_bottom = blob("frame_bottom", size=(0.07, 0.46, 0.07), loc=(0.33, 0.0, 0.14), swatch=IRON_DARK, bevel=0.015, bevel_segments=1)
frame_side_a = blob("frame_side_a", size=(0.07, 0.06, 0.62), loc=(0.33, 0.21, 0.47), swatch=IRON, bevel=0.015, bevel_segments=1)
frame_side_b = mirror_x(frame_side_a, name="frame_side_b")
brace_a = blob("brace_a", size=(0.05, 0.42, 0.06), loc=(0.36, 0.0, 0.66), swatch=IRON, bevel=0.012, bevel_segments=1)
brace_b = blob("brace_b", size=(0.05, 0.42, 0.06), loc=(0.36, 0.0, 0.30), swatch=IRON, bevel=0.012, bevel_segments=1)

# Bone eye-rune: a pale ring with a dark notch and a glowing cyan pupil.
rune_ring = cylinder("rune_ring", radius=0.115, depth=0.03, loc=(0.372, 0.0, 0.50), swatch=BONE, rot=(0, math.radians(90), 0), vertices=10)
rune_disc = cylinder("rune_disc", radius=0.085, depth=0.03, loc=(0.383, 0.0, 0.50), swatch=INK, rot=(0, math.radians(90), 0), vertices=10)
rune_pupil = sphere("rune_pupil", radius=0.042, loc=(0.398, 0.0, 0.50), swatch=EYE, segments=8, rings=6, scale=(0.6, 1.0, 1.0))
rune_notch_a = blob("rune_notch_a", size=(0.02, 0.03, 0.09), loc=(0.372, 0.0, 0.60), swatch=INK, bevel=0.004, bevel_segments=1)
rune_notch_b = blob("rune_notch_b", size=(0.02, 0.08, 0.03), loc=(0.372, 0.11, 0.50), swatch=INK, bevel=0.004, bevel_segments=1)

# Nails through the door: tapered iron spikes whose heads stick out of the front
# so they read in silhouette.
nail_places = ((0.42, -0.16, 0.72), (0.42, 0.16, 0.72), (0.42, -0.16, 0.24), (0.42, 0.16, 0.24), (0.42, 0.0, 0.78), (0.42, 0.0, 0.18))
nails = [
    cone("nail_%d" % index, radius1=0.03, radius2=0.008, depth=0.08, loc=place, swatch=IRON_LIGHT, rot=(0, math.radians(90), 0), vertices=5)
    for index, place in enumerate(nail_places)
]
nail_rust = blob("nail_rust", size=(0.02, 0.10, 0.10), loc=(0.405, 0.16, 0.72), swatch=RUST, bevel=0.006, bevel_segments=1)

# Spikes on the shield rim: three jagged iron teeth pointing up and forward.
shield_spike_a = cone("shield_spike_a", radius1=0.035, radius2=0.005, depth=0.14, loc=(0.34, -0.16, 0.845), swatch=SHADOW, rot=(math.radians(-16), math.radians(-18), 0), vertices=6)
shield_spike_b = cone("shield_spike_b", radius1=0.04, radius2=0.005, depth=0.16, loc=(0.35, 0.02, 0.86), swatch=SHADOW, rot=(math.radians(-10), 0, 0), vertices=6)
shield_spike_c = cone("shield_spike_c", radius1=0.032, radius2=0.005, depth=0.12, loc=(0.34, 0.17, 0.84), swatch=SHADOW, rot=(math.radians(-20), math.radians(16), 0), vertices=6)
shield_spike_d = cone("shield_spike_d", radius1=0.03, radius2=0.005, depth=0.12, loc=(0.45, 0.20, 0.46), swatch=SHADOW, rot=(0, math.radians(68), 0), vertices=6)

# Arms: the right arm braces the door from behind, the left hangs free with a claw.
arm_shield = capsule("arm_shield", radius=0.055, depth=0.20, loc=(0.20, -0.04, 0.52), swatch=DUSK, rot=(0.0, math.radians(72), 0), segments=8)
hand_shield = sphere("hand_shield", radius=0.06, loc=(0.27, -0.03, 0.47), swatch=DUSK, segments=6, rings=4)
arm_free = capsule("arm_free", radius=0.06, depth=0.22, loc=(-0.02, -0.24, 0.40), swatch=DUSK, rot=(math.radians(-10), math.radians(26), 0), segments=8)
fist_free = sphere("fist_free", radius=0.065, loc=(0.06, -0.30, 0.30), swatch=DUSK, segments=6, rings=4)
claw_a = cone("claw_a", radius1=0.016, radius2=0.003, depth=0.06, loc=(0.11, -0.31, 0.27), swatch=BONE, rot=(0.0, math.radians(100), 0), vertices=5)
claw_b = cone("claw_b", radius1=0.016, radius2=0.003, depth=0.06, loc=(0.10, -0.35, 0.27), swatch=BONE, rot=(0.0, math.radians(100), math.radians(-14)), vertices=5)

# Thick stumpy legs and big clawed feet.
leg_a = capsule("leg_a", radius=0.075, depth=0.13, loc=(0.0, 0.11, 0.14), swatch=DUSK_DARK, segments=8)
leg_b = mirror_x(leg_a, name="leg_b")
foot_a = sphere("foot_a", radius=0.08, loc=(0.05, 0.11, 0.035), swatch=SHADOW, segments=6, rings=4, scale=(1.5, 1.0, 0.42))
foot_b = mirror_x(foot_a, name="foot_b")

# 2. Rig: the shield has its own bone so walk/eat can sway the door.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.44), "root"),
        ("head", (0.05, 0.0, 0.44), (0.05, 0.0, 0.74), "body"),
        ("jaw", (0.16, 0.0, 0.67), (0.22, 0.0, 0.62), "head"),
        ("shield", (0.20, 0.0, 0.50), (0.34, 0.0, 0.50), "body"),
        ("arm_free", (-0.02, -0.22, 0.46), (0.05, -0.28, 0.32), "body"),
        ("leg_a", (0.0, 0.11, 0.17), (0.0, 0.11, 0.02), "root"),
        ("leg_b", (0.0, -0.11, 0.17), (0.0, -0.11, 0.02), "root"),
    ]
)
bind(
    {
        "body": [
            body,
            hump,
            chest,
            neck,
            back_spike_a,
            back_spike_b,
            back_spike_c,
            shoulder_plate,
            shoulder_spike,
            arm_shield,
            hand_shield,
        ],
        "head": [head, helmet, helmet_ridge, brow, eye_a, eye_b, glint_a, glint_b],
        "jaw": [mouth, tooth_a, tooth_b, tooth_c],
        "shield": [
            shield_slab,
            plank_a,
            plank_b,
            plank_c,
            frame_top,
            frame_bottom,
            frame_side_a,
            frame_side_b,
            brace_a,
            brace_b,
            rune_ring,
            rune_disc,
            rune_pupil,
            rune_notch_a,
            rune_notch_b,
            *nails,
            nail_rust,
            shield_spike_a,
            shield_spike_b,
            shield_spike_c,
            shield_spike_d,
        ],
        "arm_free": [arm_free, fist_free, claw_a, claw_b],
        "leg_a": [leg_a, foot_a],
        "leg_b": [leg_b, foot_b],
    },
    armature,
)

# 3. Clips: a heavy 1.0 s stomp loop and a 0.5 s chomp that pushes the door forward.
clip(
    "walk",
    1.0,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(math.radians(7.0), 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, math.radians(-3.0))),
        key("shield", 0, rot=(0.0, 0.0, 0.0)),
        key("leg_a", 0, rot=(math.radians(16.0), 0.0, 0.0)),
        key("leg_b", 0, rot=(math.radians(-16.0), 0.0, 0.0)),
        key("arm_free", 0, rot=(math.radians(6.0), 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.02)),
        key("body", 15, rot=(math.radians(4.0), math.radians(-2.0), 0.0)),
        key("head", 15, rot=(0.0, 0.0, math.radians(3.0))),
        key("shield", 15, rot=(math.radians(-2.0), math.radians(3.0), 0.0)),
        key("leg_a", 15, rot=(math.radians(-16.0), 0.0, 0.0)),
        key("leg_b", 15, rot=(math.radians(16.0), 0.0, 0.0)),
        key("arm_free", 15, rot=(math.radians(-4.0), 0.0, 0.0)),
        key("root", 30, loc=(0.0, 0.0, 0.0)),
        key("body", 30, rot=(math.radians(7.0), 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, math.radians(-3.0))),
        key("shield", 30, rot=(0.0, 0.0, 0.0)),
        key("leg_a", 30, rot=(math.radians(16.0), 0.0, 0.0)),
        key("leg_b", 30, rot=(math.radians(-16.0), 0.0, 0.0)),
        key("arm_free", 30, rot=(math.radians(6.0), 0.0, 0.0)),
    ],
)
clip(
    "eat",
    0.5,
    [
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("jaw", 0, rot=(0.0, 0.0, 0.0)),
        key("shield", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 7, rot=(math.radians(5.0), 0.0, 0.0)),
        key("head", 7, rot=(math.radians(9.0), 0.0, 0.0)),
        key("jaw", 7, rot=(math.radians(24.0), 0.0, 0.0)),
        key("shield", 7, loc=(0.03, 0.0, 0.0)),
        key("body", 15, rot=(0.0, 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, 0.0)),
        key("jaw", 15, rot=(0.0, 0.0, 0.0)),
        key("shield", 15, loc=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.0)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
