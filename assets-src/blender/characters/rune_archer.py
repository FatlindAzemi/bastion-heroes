"""Rune Archer - Neon Arcana rare straight shooter (spec 5.2, 5.3, 12.4).

A slim hooded elf archer: the glowing rune bow held forward (+X) with a nocked
arrow is the silhouette anchor, a pointed violet hood and flowing cloak tails
give the elegant shape, neon cyan rune tattoos, a floating rune ring and magenta
trim add the Arcana accent.

Built by `npm run assets -- rune_archer` through Blender's bundled Python
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
from parts import blob, capsule, cone, cylinder, mirror_x, rod, sphere
from rig import bind, make_armature
from scene import reset_scene

OUT = sys.argv[sys.argv.index("--") + 2]
reset_scene()

# Palette swatches: ramp * 8 + slot, anchor on slot 3 (assets-src/palette/README.md).
CLOAK = 66  # neon violet, one step up for the toon shadow band
CLOAK_DARK = 65
CLOAK_LIGHT = 68
TRIM = 60  # neon magenta accent
TRIM_DARK = 58
RUNE = 52  # neon cyan runes
RUNE_LIGHT = 53
EYE_GLOW = 143  # bright cyan glowing eyes
GLINT = 255
SKIN = 212  # hands
BOOT = 64
HOOD_INSIDE = 243

# 1. Parts (sizes in tiles; the archer faces +X).
leg_a = capsule("leg_a", radius=0.045, depth=0.22, loc=(0.0, 0.08, 0.19), swatch=CLOAK_DARK, segments=6)
leg_b = mirror_x(leg_a, name="leg_b")
boot_a = blob("boot_a", size=(0.13, 0.10, 0.08), loc=(0.03, 0.08, 0.04), swatch=BOOT, bevel=0.02, bevel_segments=1)
boot_b = mirror_x(boot_a, name="boot_b")

torso = sphere("torso", radius=0.11, loc=(0.0, 0.0, 0.44), swatch=CLOAK, segments=10, rings=6, scale=(0.9, 0.8, 1.25))
belt = blob("belt", size=(0.20, 0.17, 0.045), loc=(0.0, 0.0, 0.345), swatch=TRIM_DARK, bevel=0.012, bevel_segments=1)
buckle = blob("buckle", size=(0.04, 0.045, 0.045), loc=(0.1, 0.0, 0.345), swatch=RUNE, bevel=0.008, bevel_segments=1)
cape = blob("cape", size=(0.16, 0.13, 0.32), loc=(-0.11, 0.0, 0.38), swatch=CLOAK_DARK, bevel=0.04, bevel_segments=1, rot=(0.0, math.radians(-8), 0.0))
cape_tail_a = blob("cape_tail_a", size=(0.10, 0.08, 0.26), loc=(-0.16, 0.06, 0.22), swatch=CLOAK, bevel=0.03, bevel_segments=1, rot=(math.radians(6), math.radians(-14), math.radians(6)))
cape_tail_b = mirror_x(cape_tail_a, name="cape_tail_b")
shoulder_a = sphere("shoulder_a", radius=0.05, loc=(0.01, 0.115, 0.52), swatch=CLOAK_LIGHT, segments=6, rings=4)
shoulder_b = mirror_x(shoulder_a, name="shoulder_b")

# Hood: pointed back peak over a dark face opening with glowing eyes.
hood = sphere("hood", radius=0.14, loc=(-0.01, 0.0, 0.68), swatch=CLOAK_DARK, segments=10, rings=6, scale=(1.0, 1.0, 1.05))
hood_peak = cone("hood_peak", radius1=0.06, radius2=0.008, depth=0.17, loc=(-0.06, 0.0, 0.80), swatch=CLOAK_DARK, rot=(0.0, math.radians(-20), 0), vertices=7)
face_shadow = sphere("face_shadow", radius=0.10, loc=(0.075, 0.0, 0.66), swatch=HOOD_INSIDE, segments=8, rings=5, scale=(0.42, 1.0, 1.0))
eye_a = sphere("eye_a", radius=0.021, loc=(0.132, 0.042, 0.678), swatch=EYE_GLOW, segments=6, rings=4)
eye_b = mirror_x(eye_a, name="eye_b")
glint_a = sphere("glint_a", radius=0.008, loc=(0.145, 0.042, 0.684), swatch=GLINT, segments=6, rings=4)
glint_b = mirror_x(glint_a, name="glint_b")
hood_trim = sphere("hood_trim", radius=0.142, loc=(-0.01, 0.0, 0.60), swatch=TRIM_DARK, segments=10, rings=5, scale=(1.0, 1.0, 0.16))

# Rune tattoos on the cloak and arms.
tattoo_a = blob("tattoo_a", size=(0.035, 0.02, 0.05), loc=(0.055, 0.135, 0.52), swatch=RUNE, bevel=0.005, bevel_segments=1)
tattoo_b = mirror_x(tattoo_a, name="tattoo_b")
tattoo_c = blob("tattoo_c", size=(0.03, 0.02, 0.045), loc=(-0.13, 0.07, 0.42), swatch=RUNE_LIGHT, bevel=0.005, bevel_segments=1)

# Arms: the bow hand reaches forward, the string hand draws the arrow.
arm_bow = capsule("arm_bow", radius=0.038, depth=0.22, loc=(0.13, 0.11, 0.545), swatch=CLOAK, rot=(0.0, math.radians(88), 0.0), segments=6)
hand_bow = sphere("hand_bow", radius=0.045, loc=(0.25, 0.10, 0.55), swatch=SKIN, segments=6, rings=4)
arm_string = capsule("arm_string", radius=0.036, depth=0.18, loc=(0.09, -0.125, 0.55), swatch=CLOAK, rot=(0.0, math.radians(72), math.radians(18)), segments=6)
hand_string = sphere("hand_string", radius=0.042, loc=(0.19, -0.11, 0.555), swatch=SKIN, segments=6, rings=4)

# Glowing rune bow: vertical arc in front (+X) with a straight string and a nocked arrow.
bow_top = sphere("bow_top", radius=0.02, loc=(0.26, 0.08, 0.80), swatch=RUNE_LIGHT, segments=6, rings=4)
bow_bottom = sphere("bow_bottom", radius=0.02, loc=(0.26, 0.08, 0.30), swatch=RUNE_LIGHT, segments=6, rings=4)
bow_upper = rod("bow_upper", (0.26, 0.08, 0.80), (0.36, 0.08, 0.55), 0.013, RUNE)
bow_lower = rod("bow_lower", (0.36, 0.08, 0.55), (0.26, 0.08, 0.30), 0.013, RUNE)
bow_grip = cylinder("bow_grip", radius=0.019, depth=0.09, loc=(0.36, 0.08, 0.55), swatch=RUNE_LIGHT, vertices=6)
bow_string = rod("bow_string", (0.26, 0.08, 0.80), (0.26, 0.08, 0.30), 0.005, GLINT, vertices=5)
arrow_shaft = rod("arrow_shaft", (0.26, 0.08, 0.55), (0.48, 0.08, 0.55), 0.009, RUNE_LIGHT, vertices=5)
arrow_head = cone("arrow_head", radius1=0.028, radius2=0.003, depth=0.08, loc=(0.52, 0.08, 0.55), swatch=RUNE_LIGHT, rot=(0.0, math.radians(90), 0.0), vertices=6)
fletch_a = blob("fletch_a", size=(0.025, 0.015, 0.05), loc=(0.30, 0.08, 0.58), swatch=TRIM, bevel=0.004, bevel_segments=1)
fletch_b = blob("fletch_b", size=(0.025, 0.015, 0.05), loc=(0.30, 0.08, 0.52), swatch=TRIM, bevel=0.004, bevel_segments=1)

# Floating rune ring around the shoulders.
rune_ring = []
for index in range(6):
    angle = math.radians(index * 60.0)
    radius = 0.22
    rune_ring.append(
        blob(
            "rune_%d" % index,
            size=(0.04, 0.014, 0.05),
            loc=(radius * math.cos(angle), radius * math.sin(angle), 0.79),
            swatch=RUNE if index % 2 == 0 else RUNE_LIGHT,
            bevel=0.004,
            bevel_segments=1,
            rot=(0.0, 0.0, angle),
        )
    )

# 2. Rig: bow and string hands animate separately; the rune ring spins on its own bone.
armature = make_armature(
    [
        ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
        ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.52), "root"),
        ("head", (0.03, 0.0, 0.52), (0.03, 0.0, 0.78), "body"),
        ("runes", (0.0, 0.0, 0.72), (0.0, 0.0, 0.86), "head"),
        ("hand_bow", (0.14, 0.10, 0.52), (0.26, 0.10, 0.56), "body"),
        ("hand_string", (0.12, -0.10, 0.52), (0.21, -0.11, 0.56), "body"),
        ("leg_a", (0.0, 0.08, 0.16), (0.0, 0.08, 0.02), "root"),
        ("leg_b", (0.0, -0.08, 0.16), (0.0, -0.08, 0.02), "root"),
    ]
)
bind(
    {
        "body": [torso, belt, buckle, cape, cape_tail_a, cape_tail_b, shoulder_a, shoulder_b, tattoo_a, tattoo_b, tattoo_c, hood_trim],
        "head": [hood, hood_peak, face_shadow, eye_a, eye_b, glint_a, glint_b],
        "runes": rune_ring,
        "hand_bow": [arm_bow, hand_bow, bow_top, bow_bottom, bow_upper, bow_lower, bow_grip, bow_string],
        "hand_string": [arm_string, hand_string, arrow_shaft, arrow_head, fletch_a, fletch_b],
        "leg_a": [leg_a, boot_a],
        "leg_b": [leg_b, boot_b],
    },
    armature,
)

# 3. Clips: drifting cloak and spinning runes, a 0.4 s draw-and-release, a victory hop.
clip(
    "idle",
    2.0,
    [
        key("body", 0, scale=(1.0, 1.0, 1.0)),
        key("head", 0, rot=(0.0, 0.0, 0.0)),
        key("runes", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_string", 0, loc=(0.0, 0.0, 0.0)),
        key("body", 30, scale=(1.02, 1.02, 0.985)),
        key("head", 30, rot=(0.0, math.radians(3.0), 0.0)),
        key("runes", 30, rot=(0.0, 0.0, math.pi)),
        key("hand_string", 30, loc=(-0.006, 0.0, 0.0)),
        key("body", 60, scale=(1.0, 1.0, 1.0)),
        key("head", 60, rot=(0.0, 0.0, 0.0)),
        key("runes", 60, rot=(0.0, 0.0, math.tau)),
        key("hand_string", 60, loc=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "attack",
    0.4,
    [
        key("hand_string", 0, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)),
        key("body", 0, rot=(0.0, 0.0, 0.0)),
        key("hand_string", 3, loc=(-0.09, 0.0, 0.0), rot=(0.0, 0.0, math.radians(10.0))),
        key("body", 3, rot=(0.0, math.radians(4.0), 0.0)),
        key("hand_string", 6, loc=(0.02, 0.0, 0.0), rot=(0.0, 0.0, math.radians(-6.0))),
        key("body", 6, rot=(0.0, math.radians(-3.0), 0.0)),
        key("hand_string", 12, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)),
        key("body", 12, rot=(0.0, 0.0, 0.0)),
    ],
)
clip(
    "victory",
    1.2,
    [
        key("root", 0, loc=(0.0, 0.0, 0.0)),
        key("runes", 0, rot=(0.0, 0.0, 0.0)),
        key("runes", 24, rot=(0.0, 0.0, math.tau)),
        key("root", 12, loc=(0.0, 0.0, 0.20)),
        key("root", 24, loc=(0.0, 0.0, 0.0)),
    ],
)

# 4. Checks and export.
assert_height(0.7, 0.9)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
