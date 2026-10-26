"""Build the environment prop GLBs for the pixel-art sprite pipeline (issue #114).

The six World 1 decor props (round tree, pine tree, bush, rock, mushroom and a
flower cluster) are authored with the shared helpers and palette of the World 1
environment (``assets-src/blender/environment/world1.py``), so their shape
language and colours match the diorama of spec 9.3/9.4. Each prop is exported as
one static glTF model without an armature; ``tools/sprites/render_sprites.py``
renders it from the portrait game camera and ``tools/sprites/make_atlases.py``
packs the result into ``public/sprites/prop_<id>.png``.

The generated GLBs are build intermediates: they are written into the sprite
cache directory, never into ``public/models/``.

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \\
        -P assets-src/blender/sprites/props.py -- \\
        --out-dir /tmp/bastion-heroes-sprites/props
"""

import importlib.util
import math
import pathlib
import sys

BLENDER_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BLENDER_DIR / "lib") not in sys.path:
    sys.path.insert(0, str(BLENDER_DIR / "lib"))

from mathutils import Vector  # noqa: E402

from export import export_glb  # noqa: E402
from parts import blob, cone, cylinder, sphere  # noqa: E402
from scene import argument_value, reset_scene, script_arguments  # noqa: E402

WORLD1_PATH = BLENDER_DIR / "environment" / "world1.py"


def load_world1():
    """Import the World 1 environment script so the props reuse its prop builders."""
    specification = importlib.util.spec_from_file_location("world1", WORLD1_PATH)
    if specification is None or specification.loader is None:
        raise RuntimeError("cannot load the World 1 environment script: %s" % WORLD1_PATH)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


world1 = load_world1()


def build_tree_round():
    """The chunky round tree of the World 1 tree line (~2.6 units tall)."""
    return world1.build_tree("tree_round", 0.0, 0.0, 1.35)


def build_tree_pine():
    """A tall cone-stacked conifer, built from the same foliage palette ramps (~2.5 units)."""
    return [
        cylinder(
            "pine_tree_trunk",
            radius=0.13,
            depth=0.6,
            loc=(0.0, 0.0, 0.3),
            swatch=world1.SW_WOOD,
            vertices=8,
            bevel=0.02,
        ),
        cone(
            "pine_tree_layer_low",
            radius1=0.78,
            radius2=0.08,
            depth=0.95,
            loc=(0.0, 0.0, 0.95),
            swatch=world1.SW_MOSS,
            vertices=10,
        ),
        cone(
            "pine_tree_layer_mid",
            radius1=0.62,
            radius2=0.06,
            depth=0.85,
            loc=(0.0, 0.0, 1.55),
            swatch=world1.SW_LEAF,
            vertices=10,
        ),
        cone(
            "pine_tree_layer_top",
            radius1=0.44,
            radius2=0.04,
            depth=0.75,
            loc=(0.0, 0.0, 2.1),
            swatch=world1.SW_LEAF_LIGHT,
            vertices=10,
        ),
    ]


def build_bush():
    """A round edge bush, the World 1 decoration of spec 9.4."""
    return world1.build_bush("bush", 0.0, 0.0, 1.4)


def build_rock():
    """A boulder cluster: a main rock plus two chipped stones, three stone shades."""
    return [
        blob(
            "rock_main",
            size=(0.92, 0.72, 0.62),
            loc=(0.0, 0.0, 0.31),
            swatch=world1.SW_STONE,
            bevel=0.16,
            rot=(0.0, 0.0, math.radians(12.0)),
        ),
        blob(
            "rock_chip_light",
            size=(0.5, 0.44, 0.36),
            loc=(0.62, -0.18, 0.18),
            swatch=world1.SW_STONE_LIGHT,
            bevel=0.1,
            rot=(0.0, 0.0, math.radians(-18.0)),
        ),
        blob(
            "rock_chip_dark",
            size=(0.46, 0.4, 0.3),
            loc=(-0.55, 0.16, 0.15),
            swatch=world1.SW_STONE_DARK,
            bevel=0.1,
            rot=(0.0, 0.0, math.radians(24.0)),
        ),
    ]


def build_mushroom():
    """One chunky red-cap mushroom with a cream stem (~0.4 units tall)."""
    return world1.build_mushroom("mushroom", 0.0, 0.0, 1.0)


def build_flower_cluster():
    """A small patch of wildflowers (~0.3 units): green stems and four petal heads."""
    petals = (world1.SW_MUSHROOM, world1.SW_WARM_WHITE, world1.SW_FROST_DEEP, world1.SW_FORGE_ORANGE)
    offsets = ((-0.17, 0.05), (0.04, -0.04), (0.2, 0.06), (-0.03, 0.16))
    parts = []
    for index, (offset_x, offset_z) in enumerate(offsets):
        parts.append(
            cylinder(
                "flower_cluster_stem_%d" % index,
                radius=0.02,
                depth=0.19,
                loc=(offset_x, -offset_z, 0.095),
                swatch=world1.SW_LEAF,
                vertices=5,
            )
        )
        parts.append(
            sphere(
                "flower_cluster_head_%d" % index,
                radius=0.08,
                loc=(offset_x, -offset_z, 0.22),
                swatch=petals[index % len(petals)],
            )
        )
    return parts


def build_grass_tuft_a():
    """An upright grass tuft with three blades (~0.3 units)."""
    return [
        cone(
            "grass_tuft_a_blade_0",
            radius1=0.05,
            radius2=0.0,
            depth=0.34,
            loc=(0.0, 0.0, 0.17),
            swatch=world1.SW_LEAF,
            vertices=6,
        ),
        cone(
            "grass_tuft_a_blade_1",
            radius1=0.04,
            radius2=0.0,
            depth=0.28,
            loc=(0.12, -0.04, 0.14),
            swatch=world1.SW_LEAF_LIGHT,
            rot=(math.radians(-14.0), 0.0, 0.0),
            vertices=6,
        ),
        cone(
            "grass_tuft_a_blade_2",
            radius1=0.04,
            radius2=0.0,
            depth=0.24,
            loc=(-0.12, 0.05, 0.12),
            swatch=world1.SW_MOSS,
            rot=(math.radians(18.0), 0.0, 0.0),
            vertices=6,
        ),
    ]


def build_grass_tuft_b():
    """A wider grass tuft with a white flower bud (~0.35 units)."""
    placements = (
        (0.0, 0.0, 0.36, world1.SW_LEAF, 0.0),
        (0.17, 0.05, 0.3, world1.SW_LEAF_LIGHT, -22.0),
        (-0.16, -0.04, 0.28, world1.SW_MOSS, 24.0),
        (0.08, -0.14, 0.25, world1.SW_LEAF, 12.0),
        (-0.09, 0.16, 0.24, world1.SW_LEAF_LIGHT, -12.0),
    )
    parts = []
    for index, (offset_x, offset_y, depth, swatch, tilt) in enumerate(placements):
        parts.append(
            cone(
                "grass_tuft_b_blade_%d" % index,
                radius1=0.04,
                radius2=0.0,
                depth=depth,
                loc=(offset_x, offset_y, depth / 2.0),
                swatch=swatch,
                rot=(math.radians(tilt), 0.0, 0.0),
                vertices=6,
            )
        )
    parts.append(
        sphere(
            "grass_tuft_b_bud",
            radius=0.055,
            loc=(0.0, 0.0, 0.38),
            swatch=world1.SW_WARM_WHITE,
        )
    )
    return parts


def build_grass_tuft_c():
    """A low, wide grass clump (~0.2 units) with two mossy base blobs."""
    return [
        blob(
            "grass_tuft_c_base",
            size=(0.42, 0.34, 0.12),
            loc=(0.0, 0.0, 0.06),
            swatch=world1.SW_MOSS,
            bevel=0.03,
        ),
        blob(
            "grass_tuft_c_base_light",
            size=(0.26, 0.22, 0.1),
            loc=(0.16, -0.08, 0.05),
            swatch=world1.SW_MOSS_LIGHT,
            bevel=0.03,
        ),
        cone(
            "grass_tuft_c_blade_0",
            radius1=0.04,
            radius2=0.0,
            depth=0.22,
            loc=(-0.1, 0.04, 0.14),
            swatch=world1.SW_LEAF,
            rot=(math.radians(20.0), 0.0, 0.0),
            vertices=6,
        ),
        cone(
            "grass_tuft_c_blade_1",
            radius1=0.035,
            radius2=0.0,
            depth=0.18,
            loc=(0.05, -0.03, 0.12),
            swatch=world1.SW_LEAF_LIGHT,
            rot=(math.radians(-16.0), 0.0, 0.0),
            vertices=6,
        ),
    ]


# Prop id -> builder. The ids are the manifest keys of public/sprites/manifest.json.
PROPS = (
    ("tree_round", build_tree_round),
    ("tree_pine", build_tree_pine),
    ("bush", build_bush),
    ("rock", build_rock),
    ("mushroom", build_mushroom),
    ("flower_cluster", build_flower_cluster),
    ("grass_tuft_a", build_grass_tuft_a),
    ("grass_tuft_b", build_grass_tuft_b),
    ("grass_tuft_c", build_grass_tuft_c),
)


def build_prop(prop_id, builder, out_dir):
    """Build one prop from its parts, join it into a single mesh and export it."""
    reset_scene()
    parts = builder()
    if not parts:
        raise RuntimeError("prop %s built no geometry" % prop_id)
    model = world1.join_meshes(parts, prop_id)
    bounds = [model.matrix_world @ Vector(corner) for corner in model.bound_box]
    height = max(corner.z for corner in bounds) - min(corner.z for corner in bounds)
    if height <= 0.0:
        raise RuntimeError("prop %s has no height" % prop_id)
    output = out_dir / ("%s.glb" % prop_id)
    export_glb(output)
    print("prop %s: height %.3f, wrote %s" % (prop_id, height, output), flush=True)
    return output


def main():
    """Build and export every prop into ``--out-dir``."""
    arguments = script_arguments()
    out_argument = argument_value(arguments, "--out-dir")
    if out_argument is None:
        raise RuntimeError("usage: props.py -- --out-dir <dir>")
    out_dir = pathlib.Path(out_argument)
    out_dir.mkdir(parents=True, exist_ok=True)
    for prop_id, builder in PROPS:
        build_prop(prop_id, builder, out_dir)
    print("props: wrote %d props to %s" % (len(PROPS), out_dir), flush=True)


if __name__ == "__main__":
    main()
