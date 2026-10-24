"""Bat Swarm - Flying M2 enemy (spec 6.4, 12.4).

Three small chunky Gloom bats flying as one unit in a loose triangle: a leader in
front and above, two wingmen lower and behind, each with a dark purple body, a
pair of glowing cyan eyes, round ears and big jagged wings. A few shadow-smoke
wisps trail below the swarm so the silhouette reads as airborne (no feet) and the
lowest wisp sets the feet origin for the helpers. The wings flap in the 1.0 s
walk loop and flutter in the 0.5 s eat loop (spec 9.6, 12.5).

Built by `npm run assets -- bat_swarm` through Blender's bundled Python
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
from parts import blob, cone, mirror_x, sphere
from rig import bind, make_armature
from scene import reset_scene

OUT = sys.argv[sys.argv.index("--") + 2]
reset_scene()

# Palette swatches: ramp * 8 + slot, anchor on slot 3 (assets-src/palette/README.md).
DUSK = 132  # gloom dusk purple, bat body
DUSK_DARK = 131  # body shadow and wing bones
DUSK_LIGHT = 134  # fur highlight
SHADOW = 120  # wing membrane, ears and wing spikes
EYE = 139  # gloom eye cyan
EYE_LIGHT = 143
BONE = 236  # tiny fangs
INK = 243  # open mouths
VIOLET = 67  # spectral haze around the swarm
VIOLET_LIGHT = 69


def bat_parts(name, centre, size, tilt):
    """Build one bat at `centre`; returns its body parts and the +Y/-Y wings.

    Wings are flat elongated blobs with two claw spikes on the trailing edge so
    the silhouette stays jagged. `tilt` rotates the whole wing pair up or down.
    """
    x, y, z = centre
    scale = size
    body = sphere("%s_body" % name, radius=0.085 * scale, loc=(x, y, z), swatch=DUSK, segments=8, rings=5, scale=(1.15, 1.0, 0.9))
    chest = sphere("%s_chest" % name, radius=0.055 * scale, loc=(x + 0.06 * scale, y, z - 0.015), swatch=DUSK_LIGHT, segments=6, rings=4, scale=(0.9, 0.9, 0.8))
    head = sphere("%s_head" % name, radius=0.058 * scale, loc=(x + 0.10 * scale, y, z + 0.055 * scale), swatch=DUSK, segments=8, rings=5)
    ear_a = cone("%s_ear_a" % name, radius1=0.026 * scale, radius2=0.003, depth=0.075 * scale, loc=(x + 0.08 * scale, y + 0.045 * scale, z + 0.115 * scale), swatch=SHADOW, rot=(math.radians(-18), 0, 0), vertices=5)
    ear_b = mirror_x(ear_a, name="%s_ear_b" % name)
    eye_a = sphere("%s_eye_a" % name, radius=0.019 * scale, loc=(x + 0.145 * scale, y + 0.026 * scale, z + 0.07 * scale), swatch=EYE, segments=6, rings=4)
    eye_b = mirror_x(eye_a, name="%s_eye_b" % name)
    glint_a = sphere("%s_glint_a" % name, radius=0.007 * scale, loc=(x + 0.158 * scale, y + 0.028 * scale, z + 0.078 * scale), swatch=EYE_LIGHT, segments=5, rings=3)
    glint_b = mirror_x(glint_a, name="%s_glint_b" % name)
    mouth = blob("%s_mouth" % name, size=(0.035 * scale, 0.06 * scale, 0.022 * scale), loc=(x + 0.15 * scale, y, z + 0.012 * scale), swatch=INK, bevel=0.006, bevel_segments=1)
    fang = cone("%s_fang" % name, radius1=0.007 * scale, radius2=0.001, depth=0.022 * scale, loc=(x + 0.165 * scale, y + 0.02 * scale, z + 0.005 * scale), swatch=BONE, rot=(math.radians(100), 0, 0), vertices=4)

    wing_l = blob("%s_wing_l" % name, size=(0.10 * scale, 0.34 * scale, 0.026 * scale), loc=(x - 0.01 * scale, y + 0.20 * scale, z + 0.055 * scale), swatch=SHADOW, bevel=0.008, bevel_segments=1, rot=(math.radians(-16 + tilt), 0, math.radians(-24)))
    wing_r = mirror_x(wing_l, name="%s_wing_r" % name)
    spike_la = cone("%s_spike_la" % name, radius1=0.022 * scale, radius2=0.002, depth=0.09 * scale, loc=(x + 0.02 * scale, y + 0.35 * scale, z + 0.05 * scale), swatch=DUSK_DARK, rot=(math.radians(-30), math.radians(-40), 0), vertices=4)
    spike_lb = cone("%s_spike_lb" % name, radius1=0.018 * scale, radius2=0.002, depth=0.07 * scale, loc=(x - 0.03 * scale, y + 0.36 * scale, z + 0.01 * scale), swatch=DUSK_DARK, rot=(math.radians(-15), math.radians(-55), 0), vertices=4)
    spike_ra = mirror_x(spike_la, name="%s_spike_ra" % name)
    spike_rb = mirror_x(spike_lb, name="%s_spike_rb" % name)
    return {
        "body": [body, chest, head, ear_a, ear_b, eye_a, eye_b, glint_a, glint_b, mouth, fang],
        "wing_l": [wing_l, spike_la, spike_lb],
        "wing_r": [wing_r, spike_ra, spike_rb],
    }


# 1. Parts: leader in front and high, two wingmen lower and behind (a loose
# triangle, spec 6.4). Sizes in tiles; the swarm faces +X.
leader = bat_parts("leader", (0.10, 0.0, 0.69), 1.0, 0.0)
left_bat = bat_parts("left", (-0.06, 0.21, 0.555), 0.92, 6.0)
right_bat = bat_parts("right", (-0.09, -0.19, 0.495), 0.9, -6.0)

# Dotted shadow-smoke wisps drift under the swarm: the airborne trail also gives
# the model its feet origin at z = 0 (spec 12.5).
smoke_specs = ((0.01, 0.02, 0.31, 0.036), (-0.01, 0.04, 0.24, 0.031), (0.02, 0.01, 0.17, 0.027), (0.0, -0.01, 0.10, 0.024), (-0.01, -0.02, 0.035, 0.021))
smoke = [
    sphere("smoke_%d" % index, radius=radius, loc=(x, y, z), swatch=DUSK_DARK if index % 2 == 0 else SHADOW, segments=6, rings=4, scale=(1.1, 1.0, 0.9))
    for index, (x, y, z, radius) in enumerate(smoke_specs)
]
smoke_spark = sphere("smoke_spark", radius=0.015, loc=(-0.10, -0.04, 0.30), swatch=VIOLET_LIGHT, segments=5, rings=3)

# 2. Rig: root hover + body for the swarm + head for the leader's eye VFX, and one
# bone per wing so the walk loop can flap all six wings independently.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.12), None),
        ("body", (0.0, 0.0, 0.12), (0.0, 0.0, 0.58), "root"),
        ("head", (0.08, 0.0, 0.58), (0.10, 0.0, 0.80), "body"),
        ("wing_leader_l", (0.10, 0.06, 0.70), (0.10, 0.24, 0.74), "body"),
        ("wing_leader_r", (0.10, -0.06, 0.70), (0.10, -0.24, 0.74), "body"),
        ("wing_left_l", (-0.06, 0.27, 0.56), (-0.06, 0.44, 0.59), "body"),
        ("wing_left_r", (-0.06, 0.15, 0.56), (-0.06, -0.02, 0.59), "body"),
        ("wing_right_l", (-0.09, -0.13, 0.50), (-0.09, 0.04, 0.53), "body"),
        ("wing_right_r", (-0.09, -0.25, 0.50), (-0.09, -0.42, 0.53), "body"),
    ]
)
bind(
    {
        "body": [*leader["body"], *left_bat["body"], *right_bat["body"], *smoke, smoke_spark],
        "head": [],
        "wing_leader_l": leader["wing_l"],
        "wing_leader_r": leader["wing_r"],
        "wing_left_l": left_bat["wing_l"],
        "wing_left_r": left_bat["wing_r"],
        "wing_right_l": right_bat["wing_l"],
        "wing_right_r": right_bat["wing_r"],
    },
    armature,
)

# 3. Clips: two wingbeats per 1.0 s walk loop with a hover bob, and a quick
# flutter for the 0.5 s eat loop (bats have no attack, spec 6.1).
clip(
    "walk",
    1.0,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_l", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_r", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_left_l", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_left_r", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_right_l", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_right_r", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 7, loc=(0.0, 0.0, 0.035)),
        key("body", 7, rot=(math.radians(-4.0), 0.0, 0.0)),
        key("head", 7, rot=(math.radians(5.0), 0.0, 0.0)),
        key("wing_leader_l", 7, rot=(math.radians(34.0), 0.0, 0.0)),
        key("wing_leader_r", 7, rot=(math.radians(34.0), 0.0, 0.0)),
        key("wing_left_l", 7, rot=(math.radians(30.0), 0.0, 0.0)),
        key("wing_left_r", 7, rot=(math.radians(30.0), 0.0, 0.0)),
        key("wing_right_l", 7, rot=(math.radians(30.0), 0.0, 0.0)),
        key("wing_right_r", 7, rot=(math.radians(30.0), 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.0)),
        key("body", 15, rot=(0.0, 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_l", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_r", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_left_l", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_left_r", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_right_l", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_right_r", 15, rot=(0.0, 0.0, 0.0)),
        key("root", 22, loc=(0.0, 0.0, 0.035)),
        key("body", 22, rot=(math.radians(-4.0), 0.0, 0.0)),
        key("head", 22, rot=(math.radians(5.0), 0.0, 0.0)),
        key("wing_leader_l", 22, rot=(math.radians(34.0), 0.0, 0.0)),
        key("wing_leader_r", 22, rot=(math.radians(34.0), 0.0, 0.0)),
        key("wing_left_l", 22, rot=(math.radians(30.0), 0.0, 0.0)),
        key("wing_left_r", 22, rot=(math.radians(30.0), 0.0, 0.0)),
        key("wing_right_l", 22, rot=(math.radians(30.0), 0.0, 0.0)),
        key("wing_right_r", 22, rot=(math.radians(30.0), 0.0, 0.0)),
        key("root", 30, loc=(0.0, 0.0, 0.0)),
        key("body", 30, rot=(0.0, 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_l", 30, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_r", 30, rot=(0.0, 0.0, 0.0)),
        key("wing_left_l", 30, rot=(0.0, 0.0, 0.0)),
        key("wing_left_r", 30, rot=(0.0, 0.0, 0.0)),
        key("wing_right_l", 30, rot=(0.0, 0.0, 0.0)),
        key("wing_right_r", 30, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "eat",
    0.5,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_l", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_r", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_left_l", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_left_r", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_right_l", 0, rot=(0.0, 0.0, 0.0)),
        key("wing_right_r", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 4, loc=(0.0, 0.0, 0.02)),
        key("body", 4, rot=(math.radians(4.0), 0.0, 0.0)),
        key("head", 4, rot=(math.radians(-6.0), 0.0, 0.0)),
        key("wing_leader_l", 4, rot=(math.radians(-22.0), 0.0, 0.0)),
        key("wing_leader_r", 4, rot=(math.radians(-22.0), 0.0, 0.0)),
        key("wing_left_l", 4, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("wing_left_r", 4, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("wing_right_l", 4, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("wing_right_r", 4, rot=(math.radians(-18.0), 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.0)),
        key("body", 15, rot=(0.0, 0.0, 0.0)),
        key("head", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_l", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_leader_r", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_left_l", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_left_r", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_right_l", 15, rot=(0.0, 0.0, 0.0)),
        key("wing_right_r", 15, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.8, 1.0)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
