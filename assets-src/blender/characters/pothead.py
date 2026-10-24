"""Pot-Head Gloomling - Armored M2 enemy (spec 6.4, 12.4).

A Gloomling wearing a dented cooking pot as a helmet; the pot is tipped over one
eye so the other big cyan eye and the lopsided grin still glow out from under it.
The dome, the riveted rim and the handle make a top-heavy, jagged silhouette that
reads "pot helmet" even in black, and the pot sits on its own bone so a later
patch can animate it falling off when the armor breaks at 200 hp (spec 6.2).

Built by `npm run assets -- pothead` through Blender's bundled Python
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
BELLY = 133  # lighter dusk belly
SHADOW = 120  # gloom shadow, spikes and claws
EYE = 139  # gloom eye cyan
EYE_LIGHT = 143
BONE = 235  # teeth and claws
INK = 243  # mouth and cracks
IRON = 218  # dented iron pot, main
IRON_DARK = 216  # pot under-shadow and rim
IRON_LIGHT = 220  # rivets and handle highlight
RUST = 9  # rust stain on the old cooking pot

# 1. Parts (sizes in tiles, character stands hunched at the origin and faces +X).
body = sphere("body", radius=0.22, loc=(-0.01, 0.0, 0.35), swatch=DUSK, segments=12, rings=8, scale=(1.0, 0.95, 0.98))
hump = sphere("hump", radius=0.15, loc=(-0.11, 0.0, 0.47), swatch=DUSK_DARK, segments=10, rings=6, scale=(0.9, 1.0, 1.0))
belly = sphere("belly", radius=0.14, loc=(0.11, 0.0, 0.31), swatch=BELLY, segments=10, rings=6, scale=(0.72, 1.1, 1.02))
head = sphere("head", radius=0.165, loc=(0.05, 0.0, 0.55), swatch=DUSK, segments=12, rings=8, scale=(1.0, 1.0, 0.92))

# Two-toothed overbite and a lopsided grin, pushed to the visible (+Y) cheek.
mouth = sphere("mouth", radius=0.075, loc=(0.205, 0.02, 0.475), swatch=INK, segments=10, rings=6, scale=(0.3, 1.25, 0.8))
tooth_a = blob("tooth_a", size=(0.022, 0.024, 0.03), loc=(0.238, 0.075, 0.503), swatch=BONE, bevel=0.006, bevel_segments=1)
tooth_b = blob("tooth_b", size=(0.02, 0.022, 0.026), loc=(0.24, 0.03, 0.498), swatch=BONE, bevel=0.006, bevel_segments=1)
fang = cone("fang", radius1=0.018, radius2=0.004, depth=0.06, loc=(0.235, -0.02, 0.49), swatch=BONE, rot=(math.radians(96), 0, 0), vertices=6)

# The one eye the pot does not cover: a big glowing cyan orb under a sharp brow.
brow = blob("brow", size=(0.06, 0.11, 0.04), loc=(0.195, 0.085, 0.645), swatch=SHADOW, bevel=0.012, bevel_segments=1, rot=(0, 0, math.radians(-10)))
eye = sphere("eye", radius=0.055, loc=(0.218, 0.085, 0.598), swatch=EYE, segments=10, rings=7)
glint = sphere("glint", radius=0.018, loc=(0.266, 0.088, 0.615), swatch=EYE_LIGHT, segments=6, rings=4)
# A sliver of the covered eye's glow leaks out from under the low pot rim.
eye_peek = sphere("eye_peek", radius=0.024, loc=(0.185, -0.105, 0.612), swatch=EYE, segments=6, rings=4, scale=(0.7, 1.0, 0.6))

# Dented iron cooking pot: pulled down over the -Y eye, with a riveted rim, a big
# rust stain, a crack across the dome and one handle ear on each side. The dome
# and the two side ears are the silhouette anchor. The pot has its own bone so a
# later patch can drop it when the armor breaks (spec 6.2).
pot = sphere("pot", radius=0.205, loc=(-0.005, -0.075, 0.735), swatch=IRON, segments=12, rings=7, scale=(0.98, 1.02, 0.82))
pot_rim = cone("pot_rim", radius1=0.238, radius2=0.205, depth=0.075, loc=(0.005, -0.075, 0.628), swatch=IRON_DARK, vertices=14, rot=(math.radians(-7), 0, 0))
pot_dent_a = blob("pot_dent_a", size=(0.085, 0.06, 0.05), loc=(0.175, -0.02, 0.765), swatch=IRON_DARK, bevel=0.015, bevel_segments=1, rot=(0, 0, math.radians(12)))
pot_dent_b = blob("pot_dent_b", size=(0.07, 0.055, 0.045), loc=(-0.12, 0.13, 0.755), swatch=IRON_LIGHT, bevel=0.012, bevel_segments=1)
pot_rust = blob("pot_rust", size=(0.10, 0.12, 0.035), loc=(0.055, -0.225, 0.775), swatch=RUST, bevel=0.012, bevel_segments=1, rot=(0, 0, math.radians(-8)))
crack = blob("crack", size=(0.13, 0.014, 0.014), loc=(0.14, -0.09, 0.815), swatch=INK, bevel=0.003, bevel_segments=1, rot=(0, math.radians(-22), math.radians(18)))
rivet_a = sphere("rivet_a", radius=0.016, loc=(0.19, 0.03, 0.675), swatch=IRON_LIGHT, segments=6, rings=4)
rivet_b = sphere("rivet_b", radius=0.016, loc=(0.18, -0.18, 0.665), swatch=IRON_LIGHT, segments=6, rings=4)
rivet_c = sphere("rivet_c", radius=0.016, loc=(-0.17, 0.04, 0.695), swatch=IRON_LIGHT, segments=6, rings=4)
rivet_d = sphere("rivet_d", radius=0.016, loc=(-0.16, -0.19, 0.69), swatch=IRON_LIGHT, segments=6, rings=4)
handle_a = cylinder("handle_a", radius=0.026, depth=0.09, loc=(-0.005, 0.21, 0.73), swatch=IRON_DARK, rot=(math.radians(90), 0, 0), vertices=6)
handle_b = mirror_x(handle_a, name="handle_b")

# Jagged back and shoulder spikes, as on every Gloom creature.
spike_top = cone("spike_top", radius1=0.045, radius2=0.006, depth=0.17, loc=(-0.18, 0.0, 0.52), swatch=SHADOW, rot=(0.0, math.radians(-68), 0), vertices=6)
spike_mid = cone("spike_mid", radius1=0.04, radius2=0.005, depth=0.15, loc=(-0.205, 0.0, 0.39), swatch=SHADOW, rot=(0.0, math.radians(-74), 0), vertices=6)
spike_low = cone("spike_low", radius1=0.033, radius2=0.005, depth=0.11, loc=(-0.18, 0.0, 0.28), swatch=SHADOW, rot=(0.0, math.radians(-78), 0), vertices=6)
shoulder_spike_a = cone("shoulder_spike_a", radius1=0.04, radius2=0.005, depth=0.14, loc=(0.0, 0.20, 0.48), swatch=SHADOW, rot=(math.radians(-58), 0, 0), vertices=6)
shoulder_spike_b = mirror_x(shoulder_spike_a, name="shoulder_spike_b")

# Arms: the +Y hand grips the pot rim, the other hangs in a claw.
arm_pot = capsule("arm_pot", radius=0.045, depth=0.15, loc=(0.10, 0.185, 0.47), swatch=DUSK, rot=(math.radians(-12), math.radians(52), 0), segments=8)
hand_pot = sphere("hand_pot", radius=0.05, loc=(0.18, 0.165, 0.60), swatch=DUSK, segments=8, rings=6)
arm_free = capsule("arm_free", radius=0.045, depth=0.14, loc=(0.10, -0.19, 0.36), swatch=DUSK, rot=(0.0, math.radians(38), 0), segments=8)
hand_free = sphere("hand_free", radius=0.045, loc=(0.16, -0.215, 0.305), swatch=DUSK, segments=8, rings=6)
claw_a = cone("claw_a", radius1=0.012, radius2=0.002, depth=0.05, loc=(0.195, -0.205, 0.285), swatch=BONE, rot=(0.0, math.radians(100), 0), vertices=5)
claw_b = cone("claw_b", radius1=0.012, radius2=0.002, depth=0.05, loc=(0.19, -0.24, 0.285), swatch=BONE, rot=(0.0, math.radians(100), math.radians(-14)), vertices=5)

# Stubby legs and flat claws.
leg_a = capsule("leg_a", radius=0.06, depth=0.10, loc=(0.0, 0.10, 0.11), swatch=DUSK_DARK, segments=8)
leg_b = mirror_x(leg_a, name="leg_b")
foot_a = sphere("foot_a", radius=0.065, loc=(0.035, 0.10, 0.032), swatch=SHADOW, segments=8, rings=5, scale=(1.5, 1.0, 0.45))
foot_b = mirror_x(foot_a, name="foot_b")

# 2. Rig: root, body, head and jaw carry the clips; the pot has its own bone so a
# later balance patch can drop it when the pot armor breaks (spec 6.2).
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.42), "root"),
        ("head", (0.05, 0.0, 0.42), (0.05, 0.0, 0.68), "body"),
        ("pot", (0.0, 0.0, 0.62), (0.0, 0.0, 0.95), "head"),
        ("jaw", (0.20, 0.0, 0.50), (0.26, 0.0, 0.46), "head"),
        ("arm_pot", (0.10, 0.16, 0.50), (0.18, 0.17, 0.62), "body"),
        ("arm_free", (0.10, -0.18, 0.40), (0.18, -0.23, 0.31), "body"),
        ("leg_a", (0.0, 0.10, 0.16), (0.0, 0.10, 0.02), "root"),
        ("leg_b", (0.0, -0.10, 0.16), (0.0, -0.10, 0.02), "root"),
    ]
)
bind(
    {
        "body": [body, hump, belly, spike_top, spike_mid, spike_low, shoulder_spike_a, shoulder_spike_b],
        "head": [head, brow, eye, glint, eye_peek],
        "pot": [
            pot,
            pot_rim,
            pot_dent_a,
            pot_dent_b,
            pot_rust,
            crack,
            rivet_a,
            rivet_b,
            rivet_c,
            rivet_d,
            handle_a,
            handle_b,
        ],
        "jaw": [mouth, tooth_a, tooth_b, fang],
        "arm_pot": [arm_pot, hand_pot],
        "arm_free": [arm_free, hand_free, claw_a, claw_b],
        "leg_a": [leg_a, foot_a],
        "leg_b": [leg_b, foot_b],
    },
    armature,
)

# 3. Clips: the waddle loop and the chomp matching the 0.5 s bite interval.
# The pot lags half a beat behind the head so it looks heavy and a little loose.
clip(
    "walk",
    1.0,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(math.radians(6.0), 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, math.radians(-4.0))),
        key("pot", 0, rot=(0.0, 0.0, math.radians(2.0))),
        key("leg_a", 0, rot=(math.radians(20.0), 0.0, 0.0)),
        key("leg_b", 0, rot=(math.radians(-20.0), 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.024)),
        key("body", 15, rot=(math.radians(-4.0), 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, math.radians(4.0))),
        key("pot", 15, rot=(0.0, math.radians(3.0), math.radians(-5.0))),
        key("leg_a", 15, rot=(math.radians(-20.0), 0.0, 0.0)),
        key("leg_b", 15, rot=(math.radians(20.0), 0.0, 0.0)),
        key("root", 30, loc=(0.0, 0.0, 0.0)),
        key("body", 30, rot=(math.radians(6.0), 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, math.radians(-4.0))),
        key("pot", 30, rot=(0.0, 0.0, math.radians(2.0))),
        key("leg_a", 30, rot=(math.radians(20.0), 0.0, 0.0)),
        key("leg_b", 30, rot=(math.radians(-20.0), 0.0, 0.0)),
    ],
)
clip(
    "eat",
    0.5,
    [
        key("head", 0, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)),
        key("jaw", 0, rot=(0.0, 0.0, 0.0)),
        key("pot", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 7, loc=(0.035, 0.0, -0.02), rot=(math.radians(10.0), 0.0, math.radians(-3.0))),
        key("jaw", 7, rot=(math.radians(24.0), 0.0, 0.0)),
        key("pot", 7, rot=(math.radians(-6.0), 0.0, 0.0)),
        key("head", 15, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)),
        key("jaw", 15, rot=(0.0, 0.0, 0.0)),
        key("pot", 15, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.0)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
