"""Gloomling - The Gloom's baseline enemy (spec 6.4, 12.4).

A small, hunched, spiky shadow-purple imp: two horns, jagged back spikes, big
glowing cyan eyes, an open grin with bone teeth and tiny claws. Waddles on
stubby legs. Built facing +X like every character; the renderer rotates enemies
180 degrees (spec 9.1, 12.5).

Built by `npm run assets -- gloomling` through Blender's bundled Python
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
DUSK = 132  # gloom dusk purple, body (readable but still dark)
DUSK_DARK = 131
BELLY = 133  # lighter dusk belly
SHADOW = 120  # gloom shadow, horns and spikes
EYE = 139  # gloom eye cyan
EYE_LIGHT = 143
BONE = 235  # teeth and claws
INK = 243  # mouth

# 1. Parts (sizes in tiles, character stands hunched at the origin and faces +X).
body = sphere("body", radius=0.22, loc=(0.0, 0.0, 0.36), swatch=DUSK, segments=12, rings=8, scale=(1.0, 0.95, 0.95))
hump = sphere("hump", radius=0.15, loc=(-0.10, 0.0, 0.49), swatch=DUSK_DARK, segments=10, rings=6, scale=(0.9, 1.0, 1.0))
belly = sphere("belly", radius=0.14, loc=(0.12, 0.0, 0.32), swatch=BELLY, segments=10, rings=6, scale=(0.75, 1.1, 1.05))
head = sphere("head", radius=0.17, loc=(0.07, 0.0, 0.55), swatch=DUSK, segments=12, rings=8, scale=(1.0, 1.0, 0.95))

# Angry brow ridges over the glowing eyes.
brow_a = blob("brow_a", size=(0.06, 0.11, 0.04), loc=(0.205, 0.075, 0.645), swatch=SHADOW, bevel=0.012, bevel_segments=1)
brow_b = mirror_x(brow_a, name="brow_b")
eye_a = sphere("eye_a", radius=0.055, loc=(0.225, 0.075, 0.60), swatch=EYE, segments=10, rings=7)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.018, loc=(0.272, 0.075, 0.615), swatch=EYE_LIGHT, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")

# Two jagged horns and a ridge of back spikes.
horn_a = cone("horn_a", radius1=0.05, radius2=0.006, depth=0.20, loc=(0.02, 0.10, 0.73), swatch=SHADOW, rot=(math.radians(-20), math.radians(-15), 0), vertices=7)
horn_b = mirror_x(horn_a, name="horn_b")
spike_top = cone("spike_top", radius1=0.045, radius2=0.006, depth=0.16, loc=(-0.17, 0.0, 0.54), swatch=SHADOW, rot=(0.0, math.radians(-68), 0), vertices=6)
spike_mid = cone("spike_mid", radius1=0.04, radius2=0.005, depth=0.15, loc=(-0.20, 0.0, 0.41), swatch=SHADOW, rot=(0.0, math.radians(-72), 0), vertices=6)
spike_low = cone("spike_low", radius1=0.035, radius2=0.005, depth=0.12, loc=(-0.18, 0.0, 0.29), swatch=SHADOW, rot=(0.0, math.radians(-76), 0), vertices=6)
shoulder_spike_a = cone("shoulder_spike_a", radius1=0.04, radius2=0.005, depth=0.14, loc=(0.0, 0.20, 0.49), swatch=SHADOW, rot=(math.radians(-58), 0, 0), vertices=6)
shoulder_spike_b = mirror_x(shoulder_spike_a, name="shoulder_spike_b")

# Open grin with bone teeth and two upward fangs.
mouth = sphere("mouth", radius=0.075, loc=(0.215, 0.0, 0.475), swatch=INK, segments=10, rings=6, scale=(0.32, 1.35, 0.75))
tooth_a = blob("tooth_a", size=(0.022, 0.024, 0.028), loc=(0.245, -0.035, 0.505), swatch=BONE, bevel=0.006, bevel_segments=1)
tooth_b = blob("tooth_b", size=(0.022, 0.024, 0.028), loc=(0.248, 0.0, 0.508), swatch=BONE, bevel=0.006, bevel_segments=1)
tooth_c = mirror_x(tooth_a, name="tooth_c")
fang_a = cone("fang_a", radius1=0.018, radius2=0.004, depth=0.055, loc=(0.24, 0.048, 0.49), swatch=BONE, rot=(math.radians(96), 0, 0), vertices=6)
fang_b = mirror_x(fang_a, name="fang_b")

# Stubby arms with tiny claws.
arm_a = capsule("arm_a", radius=0.05, depth=0.12, loc=(0.10, 0.205, 0.36), swatch=DUSK, rot=(0.0, math.radians(38), 0), segments=8)
arm_b = mirror_x(arm_a, name="arm_b")
hand_a = sphere("hand_a", radius=0.045, loc=(0.17, 0.225, 0.305), swatch=DUSK, segments=8, rings=6)
hand_b = mirror_x(hand_a, name="hand_b")
claw_a = cone("claw_a", radius1=0.012, radius2=0.002, depth=0.05, loc=(0.205, 0.215, 0.285), swatch=BONE, rot=(0.0, math.radians(100), 0), vertices=5)
claw_b = cone("claw_b", radius1=0.012, radius2=0.002, depth=0.05, loc=(0.20, 0.245, 0.285), swatch=BONE, rot=(0.0, math.radians(100), math.radians(-14)), vertices=5)
claw_c = mirror_x(claw_a, name="claw_c")
claw_d = mirror_x(claw_b, name="claw_d")

# Stubby legs and flat feet.
leg_a = capsule("leg_a", radius=0.06, depth=0.10, loc=(0.0, 0.10, 0.11), swatch=DUSK_DARK, segments=8)
leg_b = mirror_x(leg_a, name="leg_b")
foot_a = sphere("foot_a", radius=0.065, loc=(0.035, 0.10, 0.032), swatch=SHADOW, segments=8, rings=5, scale=(1.5, 1.0, 0.45))
foot_b = mirror_x(foot_a, name="foot_b")

# 2. Rig: jaw for the chomp, shoulders for the waddle; every rig needs root and head.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.42), "root"),
        ("head", (0.05, 0.0, 0.42), (0.05, 0.0, 0.68), "body"),
        ("jaw", (0.20, 0.0, 0.50), (0.26, 0.0, 0.46), "head"),
        ("arm_a", (0.10, 0.18, 0.39), (0.18, 0.23, 0.31), "body"),
        ("arm_b", (0.10, -0.18, 0.39), (0.18, -0.23, 0.31), "body"),
        ("leg_a", (0.0, 0.10, 0.16), (0.0, 0.10, 0.02), "root"),
        ("leg_b", (0.0, -0.10, 0.16), (0.0, -0.10, 0.02), "root"),
    ]
)
bind(
    {
        "body": [body, hump, belly, spike_top, spike_mid, spike_low, shoulder_spike_a, shoulder_spike_b],
        "head": [head, brow_a, brow_b, eye_a, eye_b, glint_a, glint_b, horn_a, horn_b],
        "jaw": [mouth, tooth_a, tooth_b, tooth_c, fang_a, fang_b],
        "arm_a": [arm_a, hand_a, claw_a, claw_b],
        "arm_b": [arm_b, hand_b, claw_c, claw_d],
        "leg_a": [leg_a, foot_a],
        "leg_b": [leg_b, foot_b],
    },
    armature,
)

# 3. Clips: a 1.0 s waddling walk loop and a 0.5 s chomp matching the 0.5 s bite interval.
clip(
    "walk",
    1.0,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(math.radians(5.0), 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, math.radians(-3.0))),
        key("leg_a", 0, rot=(math.radians(18.0), 0.0, 0.0)),
        key("leg_b", 0, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.025)),
        key("body", 15, rot=(math.radians(-5.0), 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, math.radians(3.0))),
        key("leg_a", 15, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("leg_b", 15, rot=(math.radians(18.0), 0.0, 0.0)),
        key("root", 30, loc=(0.0, 0.0, 0.0)),
        key("body", 30, rot=(math.radians(5.0), 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, math.radians(-3.0))),
        key("leg_a", 30, rot=(math.radians(18.0), 0.0, 0.0)),
        key("leg_b", 30, rot=(math.radians(-18.0), 0.0, 0.0)),
    ],
)
clip(
    "eat",
    0.5,
    [
        key("head", 0, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)),
        key("jaw", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 7, loc=(0.03, 0.0, -0.015), rot=(math.radians(8.0), 0.0, 0.0)),
        key("jaw", 7, rot=(math.radians(22.0), 0.0, 0.0)),
        key("head", 15, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)),
        key("jaw", 15, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.0)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
