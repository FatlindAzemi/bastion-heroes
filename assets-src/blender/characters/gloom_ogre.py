"""Gloom Ogre - Armored M2 mini-boss enemy (spec 6.4, 12.4).

A huge hunched brute: tiny head low between enormous shoulders, a heavy belly,
thick stumpy legs, massive knuckled fists held forward and a small Gloomling riding
on its shoulder (spec 6.4). Bone and dented-iron scraps hang off its belt and
shoulder, back spikes break the silhouette and two small horns frame the tiny
head. The hulking shoulders + fists make the "big ogre" read in solid black.
Spec 9.3 gives the Ogre a 1.4 unit height inside the regular-enemy budget
(1,000-3,000 triangles), so the model is 1.4 tall and stays under 3,000.

Built by `npm run assets -- gloom_ogre` through Blender's bundled Python
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
DUSK = 132  # gloom dusk purple, skin
DUSK_DARK = 131  # skin shadow and hump
DUSK_LIGHT = 134  # belly and knuckle highlight
SHADOW = 120  # spikes, horns and claws
EYE = 139  # gloom eye cyan
EYE_LIGHT = 143
BONE = 235  # tusks, bone plates and the rider's eyes
INK = 243  # mouth and iron dents
IRON = 217  # dented armor scraps
IRON_DARK = 216
IRON_LIGHT = 220  # rivets and knuckle studs

# 1. Parts (sizes in tiles, the ogre stands at the origin and faces +X).
# Legs and feet: thick and stumpy so the body can hunch over them.
leg_a = capsule("leg_a", radius=0.13, depth=0.22, loc=(0.0, 0.17, 0.30), swatch=DUSK_DARK, segments=8)
leg_b = mirror_x(leg_a, name="leg_b")
foot_a = blob("foot_a", size=(0.30, 0.24, 0.13), loc=(0.06, 0.18, 0.065), swatch=SHADOW, bevel=0.045, bevel_segments=1)
foot_b = mirror_x(foot_a, name="foot_b")
toe_a = cone("toe_a", radius1=0.05, radius2=0.01, depth=0.10, loc=(0.24, 0.15, 0.055), swatch=BONE, rot=(0, math.radians(78), 0), vertices=5)
toe_b = mirror_x(toe_a, name="toe_b")
toe_c = cone("toe_c", radius1=0.045, radius2=0.01, depth=0.09, loc=(0.22, 0.23, 0.05), swatch=BONE, rot=(0, math.radians(78), math.radians(-12)), vertices=5)
toe_d = mirror_x(toe_c, name="toe_d")

# Heavy belly and hunched chest, with a bone belt and iron chest scrap.
belly = sphere("belly", radius=0.34, loc=(0.04, 0.0, 0.62), swatch=DUSK, segments=10, rings=7, scale=(1.0, 0.95, 0.9))
belly_light = sphere("belly_light", radius=0.26, loc=(0.14, 0.0, 0.58), swatch=DUSK_LIGHT, segments=10, rings=6, scale=(0.7, 0.9, 0.95))
chest = blob("chest", size=(0.55, 0.50, 0.42), loc=(0.02, 0.0, 0.97), swatch=DUSK, bevel=0.10, bevel_segments=1)
hump = sphere("hump", radius=0.26, loc=(-0.22, 0.0, 1.05), swatch=DUSK_DARK, segments=10, rings=7, scale=(0.9, 1.0, 0.95))
belt = blob("belt", size=(0.52, 0.44, 0.10), loc=(0.0, 0.0, 0.47), swatch=IRON_DARK, bevel=0.03, bevel_segments=1)
belt_bone = blob("belt_bone", size=(0.10, 0.12, 0.14), loc=(0.24, 0.0, 0.47), swatch=BONE, bevel=0.02, bevel_segments=1)
chest_plate = blob("chest_plate", size=(0.20, 0.30, 0.14), loc=(0.30, 0.0, 1.02), swatch=IRON, bevel=0.03, bevel_segments=1, rot=(0, math.radians(-16), 0))
plate_rivet_a = sphere("plate_rivet_a", radius=0.022, loc=(0.38, 0.10, 1.05), swatch=IRON_LIGHT, segments=6, rings=4)
plate_rivet_b = sphere("plate_rivet_b", radius=0.022, loc=(0.38, -0.10, 1.03), swatch=IRON_LIGHT, segments=6, rings=4)

# Enormous shoulders, spiked pauldron and three back spikes.
shoulder_a = sphere("shoulder_a", radius=0.21, loc=(0.02, 0.31, 1.08), swatch=DUSK, segments=10, rings=7)
shoulder_b = mirror_x(shoulder_a, name="shoulder_b")
pauldron = blob("pauldron", size=(0.20, 0.26, 0.13), loc=(-0.02, 0.36, 1.20), swatch=IRON, bevel=0.03, bevel_segments=1)
pauldron_spike_a = cone("pauldron_spike_a", radius1=0.05, radius2=0.006, depth=0.16, loc=(-0.04, 0.40, 1.30), swatch=SHADOW, rot=(math.radians(-38), 0, 0), vertices=5)
pauldron_spike_b = cone("pauldron_spike_b", radius1=0.04, radius2=0.005, depth=0.12, loc=(-0.10, 0.42, 1.26), swatch=SHADOW, rot=(math.radians(-46), 0, 0), vertices=5)
back_spike_a = cone("back_spike_a", radius1=0.06, radius2=0.006, depth=0.20, loc=(-0.30, 0.0, 1.22), swatch=SHADOW, rot=(0, math.radians(-52), 0), vertices=5)
back_spike_b = cone("back_spike_b", radius1=0.05, radius2=0.005, depth=0.16, loc=(-0.34, 0.0, 1.05), swatch=SHADOW, rot=(0, math.radians(-64), 0), vertices=5)
back_spike_c = cone("back_spike_c", radius1=0.04, radius2=0.005, depth=0.13, loc=(-0.32, 0.0, 0.89), swatch=SHADOW, rot=(0, math.radians(-72), 0), vertices=5)

# Tiny head squeezed between the shoulders: two cyan eyes, a wide jaw and tusks.
head = sphere("head", radius=0.105, loc=(0.27, 0.0, 1.08), swatch=DUSK, segments=10, rings=7, scale=(1.0, 1.0, 0.95))
jaw = blob("jaw", size=(0.13, 0.16, 0.07), loc=(0.32, 0.0, 1.02), swatch=DUSK_LIGHT, bevel=0.02, bevel_segments=1)
mouth = blob("mouth", size=(0.045, 0.12, 0.035), loc=(0.37, 0.0, 1.045), swatch=INK, bevel=0.008, bevel_segments=1)
tusk_a = cone("tusk_a", radius1=0.02, radius2=0.003, depth=0.075, loc=(0.375, 0.055, 1.065), swatch=BONE, rot=(math.radians(110), 0, 0), vertices=5)
tusk_b = mirror_x(tusk_a, name="tusk_b")
eye_a = sphere("eye_a", radius=0.028, loc=(0.355, 0.045, 1.105), swatch=EYE, segments=8, rings=5)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.01, loc=(0.376, 0.047, 1.114), swatch=EYE_LIGHT, segments=5, rings=3)
glint_b = mirror_x(glint_a, name="glint_b")
brow = blob("brow", size=(0.035, 0.15, 0.03), loc=(0.34, 0.0, 1.14), swatch=DUSK_DARK, bevel=0.01, bevel_segments=1)
horn_a = cone("horn_a", radius1=0.035, radius2=0.004, depth=0.11, loc=(0.22, 0.075, 1.19), swatch=SHADOW, rot=(math.radians(-24), 0, 0), vertices=5)
horn_b = mirror_x(horn_a, name="horn_b")

# Massive arms with oversized fists held forward; knuckle spikes break the outline.
arm_a = capsule("arm_a", radius=0.11, depth=0.40, loc=(0.24, 0.32, 0.72), swatch=DUSK, rot=(0.0, math.radians(-40), 0), segments=8)
arm_b = mirror_x(arm_a, name="arm_b")
fist_a = sphere("fist_a", radius=0.17, loc=(0.38, 0.33, 0.50), swatch=DUSK_LIGHT, segments=8, rings=6, scale=(1.0, 1.0, 0.9))
fist_b = mirror_x(fist_a, name="fist_b")
knuckle_a = cone("knuckle_a", radius1=0.038, radius2=0.005, depth=0.10, loc=(0.54, 0.36, 0.54), swatch=SHADOW, rot=(0, math.radians(82), 0), vertices=5)
knuckle_b = mirror_x(knuckle_a, name="knuckle_b")
knuckle_c = cone("knuckle_c", radius1=0.032, radius2=0.005, depth=0.08, loc=(0.52, 0.30, 0.46), swatch=SHADOW, rot=(0, math.radians(82), math.radians(-16)), vertices=5)
knuckle_d = mirror_x(knuckle_c, name="knuckle_d")

# The Gloomling rider on the left shoulder (spec 6.4): a tiny hunched imp with
# glowing eyes and two horns, holding onto the hump.
rider_body = sphere("rider_body", radius=0.095, loc=(-0.06, -0.26, 1.31), swatch=DUSK, segments=6, rings=4, scale=(1.0, 0.95, 0.95))
rider_head = sphere("rider_head", radius=0.075, loc=(0.015, -0.26, 1.385), swatch=DUSK, segments=6, rings=4, scale=(1.0, 1.0, 0.95))
rider_eye_a = sphere("rider_eye_a", radius=0.017, loc=(0.072, -0.23, 1.395), swatch=EYE, segments=5, rings=3)
rider_eye_b = mirror_x(rider_eye_a, name="rider_eye_b")
rider_horn_a = cone("rider_horn_a", radius1=0.019, radius2=0.002, depth=0.06, loc=(0.0, -0.235, 1.45), swatch=SHADOW, rot=(math.radians(-18), 0, 0), vertices=4)
rider_horn_b = mirror_x(rider_horn_a, name="rider_horn_b")
rider_arm_a = capsule("rider_arm_a", radius=0.02, depth=0.10, loc=(0.04, -0.30, 1.27), swatch=DUSK_DARK, rot=(0, math.radians(40), 0), segments=5)
rider_arm_b = capsule("rider_arm_b", radius=0.02, depth=0.10, loc=(0.04, -0.22, 1.27), swatch=DUSK_DARK, rot=(0, math.radians(40), 0), segments=5)

# 2. Rig: heavy body, separate fists for the smash, legs for the stomp and the
# rider's own bone so it can bounce while the ogre walks.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.16), None),
        ("body", (0.0, 0.0, 0.16), (0.0, 0.0, 0.80), "root"),
        ("head", (0.24, 0.0, 0.92), (0.30, 0.0, 1.18), "body"),
        ("arm_a", (0.12, 0.30, 0.92), (0.30, 0.33, 0.52), "body"),
        ("arm_b", (0.12, -0.30, 0.92), (0.30, -0.33, 0.52), "body"),
        ("leg_a", (0.0, 0.17, 0.42), (0.0, 0.17, 0.03), "root"),
        ("leg_b", (0.0, -0.17, 0.42), (0.0, -0.17, 0.03), "root"),
        ("rider", (-0.06, -0.26, 1.22), (-0.06, -0.26, 1.46), "body"),
    ]
)
bind(
    {
        "body": [
            belly,
            belly_light,
            chest,
            hump,
            belt,
            belt_bone,
            chest_plate,
            plate_rivet_a,
            plate_rivet_b,
            shoulder_a,
            shoulder_b,
            pauldron,
            pauldron_spike_a,
            pauldron_spike_b,
            back_spike_a,
            back_spike_b,
            back_spike_c,
            arm_a,
            arm_b,
        ],
        "head": [head, jaw, mouth, tusk_a, tusk_b, eye_a, eye_b, glint_a, glint_b, brow, horn_a, horn_b],
        "arm_a": [fist_a, knuckle_a, knuckle_c],
        "arm_b": [fist_b, knuckle_b, knuckle_d],
        "leg_a": [leg_a, foot_a, toe_a, toe_c],
        "leg_b": [leg_b, foot_b, toe_b, toe_d],
        "rider": [rider_body, rider_head, rider_eye_a, rider_eye_b, rider_horn_a, rider_horn_b, rider_arm_a, rider_arm_b],
    },
    armature,
)

# 3. Clips: a heavy 1.0 s stomp walk and a 1.0 s smash loop that matches the Ogre's
# 1.0 s attack interval (spec 6.1/9.6). The 50 %-health throw is sim state, not a
# model clip (spec 6.2).
clip(
    "walk",
    1.0,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(math.radians(8.0), 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, math.radians(-3.0))),
        key("leg_a", 0, rot=(math.radians(14.0), 0.0, 0.0)),
        key("leg_b", 0, rot=(math.radians(-14.0), 0.0, 0.0)),
        key("arm_a", 0, rot=(0.0, 0.0, 0.0)),
        key("arm_b", 0, rot=(0.0, 0.0, 0.0)),
        key("rider", 0, rot=(0.0, 0.0, 0.0)),
        key("root", 15, loc=(0.0, 0.0, 0.03)),
        key("body", 15, rot=(math.radians(3.0), math.radians(-2.0), 0.0)),
        key("head", 15, rot=(0.0, 0.0, math.radians(3.0))),
        key("leg_a", 15, rot=(math.radians(-14.0), 0.0, 0.0)),
        key("leg_b", 15, rot=(math.radians(14.0), 0.0, 0.0)),
        key("arm_a", 15, rot=(0.0, math.radians(6.0), 0.0)),
        key("arm_b", 15, rot=(0.0, math.radians(6.0), 0.0)),
        key("rider", 15, rot=(math.radians(-5.0), 0.0, 0.0)),
        key("root", 30, loc=(0.0, 0.0, 0.0)),
        key("body", 30, rot=(math.radians(8.0), 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, math.radians(-3.0))),
        key("leg_a", 30, rot=(math.radians(14.0), 0.0, 0.0)),
        key("leg_b", 30, rot=(math.radians(-14.0), 0.0, 0.0)),
        key("arm_a", 30, rot=(0.0, 0.0, 0.0)),
        key("arm_b", 30, rot=(0.0, 0.0, 0.0)),
        key("rider", 30, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "eat",
    1.0,
    [
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("arm_a", 0, rot=(0.0, 0.0, 0.0)),
        key("arm_b", 0, rot=(0.0, 0.0, 0.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("rider", 0, rot=(0.0, 0.0, 0.0)),
        key("body", 6, rot=(math.radians(-6.0), 0.0, 0.0)),
        key("arm_a", 6, rot=(0.0, math.radians(-58.0), 0.0)),
        key("arm_b", 6, rot=(0.0, math.radians(-58.0), 0.0)),
        key("head", 6, rot=(math.radians(-8.0), 0.0, 0.0)),
        key("rider", 6, rot=(math.radians(6.0), 0.0, 0.0)),
        key("body", 14, rot=(math.radians(12.0), 0.0, 0.0)),
        key("arm_a", 14, rot=(0.0, math.radians(18.0), 0.0)),
        key("arm_b", 14, rot=(0.0, math.radians(18.0), 0.0)),
        key("head", 14, rot=(math.radians(10.0), 0.0, 0.0)),
        key("rider", 14, rot=(math.radians(-8.0), 0.0, 0.0)),
        key("body", 30, rot=(0.0, 0.0, 0.0)),
        key("arm_a", 30, rot=(0.0, 0.0, 0.0)),
        key("arm_b", 30, rot=(0.0, 0.0, 0.0)),
        key("head", 30, rot=(0.0, 0.0, 0.0)),
        key("rider", 30, rot=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(1.3, 1.5)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
