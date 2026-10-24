"""World 1 environment: Sunny Meadow diorama (spec 9.1, 9.3, 9.4, 12.1; issue #73).

Builds the final scripted environment as one glTF model: the 5 x 9 grass
checkerboard playfield, dirt border, stone base platform and gate, the enemy
portal, edge decor (trees, rocks, flowers, mushrooms) and a layered backdrop
(sky, hills, clouds). The helpers of assets-src/blender/lib/ do the primitives,
palette swatches, checks and export.

Coordinate mapping (spec 9.1): one tile = 1 unit, sim x maps to world x, lane l
maps to world z = l + 0.5, world y is up. Blender is Z-up, and `export_glb`
rotates +Y-up at export time, mapping Blender (x, y, z) to glTF (x, z, -y). So
Blender y = -three.js z: `to_blender()` converts every authored three.js
position, which keeps the field exactly on the spec mapping after export.

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P assets-src/blender/environment/world1.py -- --out assets-build/raw/world1.glb
"""

import math
import pathlib
import sys

BLENDER_DIR = pathlib.Path(__file__).resolve().parent
sys.path.append(str(BLENDER_DIR.parent / "lib"))

import bpy

from checks import assert_tris, triangle_count
from export import export_glb
from parts import blob, cone, cylinder, sphere
from scene import argument_value, character_bounds, character_meshes, reset_scene, script_arguments

# Palette swatch indices: anchor slots of assets-src/palette/README.md (spec 9.4).
SW_GRASS_LIGHT = 171  # World 1 grass #7ED957
SW_GRASS_DARK = 179  # World 1 grass #6CC644
SW_GRASS_DIVIDER = 177  # dark grass shade between the tiles
SW_PATH = 187  # World 1 path dirt #D9A066
SW_PATH_DARK = 186
SW_STONE = 203
SW_STONE_LIGHT = 204
SW_STONE_DARK = 201
SW_WOOD = 227
SW_WOOD_DARK = 226
SW_LEAF = 27
SW_LEAF_LIGHT = 28
SW_MOSS = 43
SW_MOSS_LIGHT = 44
SW_MUSHROOM = 35
SW_SKY = 195
SW_SKY_LIGHT = 196
SW_VIOLET = 67
SW_VIOLET_BRIGHT = 68
SW_VIOLET_DARK = 66
SW_EYE_CYAN = 139
SW_ESSENCE = 155
SW_ESSENCE_CORE = 167
SW_WARM_WHITE = 255
SW_FROST_DEEP = 91
SW_FORGE_ORANGE = 11

LANE_COUNT = 5
COLUMN_COUNT = 9
TILE_SIZE = 1.0
# The playfield tiles are inset by this much so the darker divider slab below
# shows as the spec 9.1/9.4 lane and column lines without visual noise.
TILE_INSET = 0.04
TILE_HEIGHT = 0.12
DIVIDER_TOP = 0.08
PLAYFIELD_CENTRE_X = COLUMN_COUNT / 2.0
PLAYFIELD_CENTRE_Z = LANE_COUNT / 2.0


def to_blender(x, z, height=0.0):
    """Authored three.js position (x, up=height, z) -> Blender (x, -z, height)."""
    return (x, -z, height)


def tile_centre(col, lane):
    """Centre of a playfield tile in authored coordinates (spec 9.1 mapping)."""
    return (col + 0.5) * TILE_SIZE, (lane + 0.5) * TILE_SIZE


def assert_tile_alignment(tile, col, lane):
    """Fail loudly if a tile does not sit exactly on its spec 9.1 cell."""
    xs = [corner[0] for corner in tile.bound_box]
    ys = [corner[1] for corner in tile.bound_box]
    centre_x = (min(xs) + max(xs)) / 2.0
    centre_z = -(min(ys) + max(ys)) / 2.0
    expected_x, expected_z = tile_centre(col, lane)
    if abs(centre_x - expected_x) > 0.01 or abs(centre_z - expected_z) > 0.01:
        raise RuntimeError(
            "tile alignment failed (spec 9.1): tile (%d, %d) is at (%.3f, %.3f), expected (%.3f, %.3f)"
            % (col, lane, centre_x, centre_z, expected_x, expected_z)
        )
    if abs((max(ys) - min(ys)) - (TILE_SIZE - 2 * TILE_INSET)) > 0.01:
        raise RuntimeError("tile alignment failed (spec 9.1): tile (%d, %d) is not one unit apart" % (col, lane))


def join_meshes(objects, name):
    """Apply the bevel modifiers and join a list of palette parts into one mesh."""
    if not objects:
        raise RuntimeError("cannot join an empty part list for %s" % name)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    joined.data.name = name
    return joined


def build_ground():
    """The dirt apron, divider slab and the 5 x 9 grass checkerboard (spec 9.1, 9.4)."""
    parts = [
        blob(
            "dirt_trim",
            size=(16.4, 8.8, 0.3),
            loc=to_blender(4.6, 2.5, -0.25),
            swatch=SW_PATH_DARK,
            bevel=0.08,
        ),
        blob(
            "dirt_apron",
            size=(16.0, 8.4, 0.4),
            loc=to_blender(4.6, 2.5, -0.2),
            swatch=SW_PATH,
            bevel=0.09,
        ),
        blob(
            "tile_divider",
            size=(COLUMN_COUNT, LANE_COUNT, DIVIDER_TOP),
            loc=to_blender(PLAYFIELD_CENTRE_X, PLAYFIELD_CENTRE_Z, DIVIDER_TOP / 2.0),
            swatch=SW_GRASS_DIVIDER,
            bevel=0.0,
        ),
    ]
    tile_height = TILE_HEIGHT
    for lane in range(LANE_COUNT):
        for col in range(COLUMN_COUNT):
            swatch = SW_GRASS_LIGHT if (col + lane) % 2 == 0 else SW_GRASS_DARK
            centre_x, centre_z = tile_centre(col, lane)
            tile = blob(
                "tile_%d_%d" % (col, lane),
                size=(TILE_SIZE - 2 * TILE_INSET, TILE_SIZE - 2 * TILE_INSET, tile_height),
                loc=to_blender(centre_x, centre_z, DIVIDER_TOP + tile_height / 2.0),
                swatch=swatch,
                bevel=0.02,
            )
            assert_tile_alignment(tile, col, lane)
            parts.append(tile)
    return join_meshes(parts, "world1_ground")


def build_base_gate():
    """Stone base platform and the wooden village gate at x = -0.8 (spec 9.1, 9.4)."""
    parts = [
        blob("base_platform", size=(1.8, 5.4, 0.36), loc=to_blender(-0.95, 2.5, 0.18), swatch=SW_STONE, bevel=0.06),
        blob("base_step", size=(0.5, 5.2, 0.2), loc=to_blender(-0.15, 2.5, 0.1), swatch=SW_STONE_LIGHT, bevel=0.04),
        blob("base_trim", size=(0.2, 5.4, 0.16), loc=to_blender(-0.05, 2.5, 0.42), swatch=SW_STONE_DARK, bevel=0.03),
        blob("gate_lintel", size=(0.5, 5.2, 0.34), loc=to_blender(-0.85, 2.5, 2.55), swatch=SW_WOOD_DARK, bevel=0.05),
        blob(
            "gate_roof_left",
            size=(0.8, 5.5, 0.14),
            loc=to_blender(-1.16, 2.5, 2.84),
            swatch=SW_WOOD_DARK,
            bevel=0.03,
            rot=(0.0, math.radians(22.0), 0.0),
        ),
        blob(
            "gate_roof_right",
            size=(0.8, 5.5, 0.14),
            loc=to_blender(-0.54, 2.5, 2.84),
            swatch=SW_WOOD_DARK,
            bevel=0.03,
            rot=(0.0, math.radians(-22.0), 0.0),
        ),
        blob("gate_ridge", size=(0.18, 5.5, 0.2), loc=to_blender(-0.85, 2.5, 2.96), swatch=SW_WOOD, bevel=0.02),
        blob("gate_banner", size=(0.06, 1.3, 1.0), loc=to_blender(-0.55, 2.5, 1.7), swatch=SW_FROST_DEEP, bevel=0.02),
        blob("gate_banner_trim", size=(0.07, 1.42, 0.14), loc=to_blender(-0.54, 2.5, 2.22), swatch=SW_ESSENCE, bevel=0.01),
        sphere("gate_gem", radius=0.17, loc=to_blender(-0.5, 2.5, 1.55), swatch=SW_ESSENCE_CORE),
    ]
    for post_z in (0.22, 4.78):
        parts.append(
            cylinder(
                "gate_post_%d" % round(post_z * 100),
                radius=0.16,
                depth=2.2,
                loc=to_blender(-0.85, post_z, 1.46),
                swatch=SW_WOOD,
                bevel=0.02,
                vertices=10,
            )
        )
        parts.append(
            cylinder(
                "torch_%d" % round(post_z * 100),
                radius=0.06,
                depth=0.34,
                loc=to_blender(-0.52, post_z, 1.82),
                swatch=SW_WOOD_DARK,
                vertices=8,
            )
        )
        parts.append(sphere("flame_%d" % round(post_z * 100), radius=0.15, loc=to_blender(-0.52, post_z, 2.06), swatch=SW_FORGE_ORANGE))
        parts.append(sphere("flame_core_%d" % round(post_z * 100), radius=0.07, loc=to_blender(-0.52, post_z, 2.08), swatch=SW_WARM_WHITE))
    return parts


def build_portal():
    """The enemy portal at the spawn point x = 9.6 (spec 3.1, 9.4, 9.5)."""
    parts = []
    for pillar_z in (0.24, 4.76):
        parts.append(
            blob("portal_pillar_%d" % round(pillar_z * 100), size=(0.66, 0.66, 3.1), loc=to_blender(9.75, pillar_z, 1.55), swatch=SW_STONE_DARK, bevel=0.07)
        )
        parts.append(
            blob("portal_pillar_cap_%d" % round(pillar_z * 100), size=(0.86, 0.86, 0.26), loc=to_blender(9.75, pillar_z, 3.18), swatch=SW_VIOLET_DARK, bevel=0.04)
        )
        parts.append(
            cone("portal_crystal_%d" % round(pillar_z * 100), radius1=0.16, radius2=0.02, depth=0.5, loc=to_blender(9.75, pillar_z, 3.55), swatch=SW_VIOLET_BRIGHT)
        )
    parts.append(blob("portal_lintel", size=(0.7, 5.2, 0.55), loc=to_blender(9.75, 2.5, 3.0), swatch=SW_STONE_DARK, bevel=0.06))
    parts.append(
        cylinder("portal_surface", radius=1.7, depth=0.14, loc=to_blender(9.72, 2.5, 1.8), swatch=SW_VIOLET, rot=(0.0, math.radians(90.0), 0.0), vertices=32)
    )
    parts.append(
        cylinder("portal_glow", radius=1.25, depth=0.2, loc=to_blender(9.64, 2.5, 1.8), swatch=SW_VIOLET_BRIGHT, rot=(0.0, math.radians(90.0), 0.0), vertices=32)
    )
    parts.append(
        cylinder("portal_core", radius=0.85, depth=0.24, loc=to_blender(9.56, 2.5, 1.8), swatch=SW_EYE_CYAN, rot=(0.0, math.radians(90.0), 0.0), vertices=24)
    )
    parts.append(
        cylinder("portal_spark", radius=0.42, depth=0.28, loc=to_blender(9.5, 2.5, 1.8), swatch=SW_ESSENCE_CORE, rot=(0.0, math.radians(90.0), 0.0), vertices=16)
    )
    # A ring of violet motes around the portal mouth suggests the swirling energy.
    for mote_index in range(8):
        angle = mote_index * math.tau / 8.0
        mote_z = 2.5 + math.cos(angle) * 1.75
        mote_height = 1.8 + math.sin(angle) * 1.75
        parts.append(sphere("portal_mote_%d" % mote_index, radius=0.1, loc=to_blender(9.4, mote_z, mote_height), swatch=SW_VIOLET_BRIGHT))
    parts.append(
        cylinder("portal_floor_rune", radius=1.3, depth=0.04, loc=to_blender(9.35, 2.5, 0.04), swatch=SW_VIOLET_DARK, vertices=32)
    )
    for shard_index, (shard_z, shard_height) in enumerate(((0.9, 1.4), (4.1, 1.7), (2.5, 2.4))):
        parts.append(
            cone(
                "portal_shard_%d" % shard_index,
                radius1=0.11,
                radius2=0.0,
                depth=0.4,
                loc=to_blender(9.05, shard_z, shard_height),
                swatch=SW_VIOLET_BRIGHT,
                rot=(math.radians(20.0), 0.0, 0.0),
            )
        )
    return parts


def build_tree(name, x, z, scale, leaf_swatch=SW_LEAF):
    """One chunky stylized tree: wooden trunk and three overlapping foliage blobs."""
    return [
        cylinder(name + "_trunk", radius=0.14 * scale, depth=0.85 * scale, loc=to_blender(x, z, 0.42 * scale), swatch=SW_WOOD, bevel=0.02, vertices=9),
        sphere(name + "_crown", radius=0.62 * scale, loc=to_blender(x, z, 1.2 * scale), swatch=leaf_swatch),
        sphere(name + "_crown_light", radius=0.46 * scale, loc=to_blender(x + 0.24 * scale, z - 0.16 * scale, 1.46 * scale), swatch=SW_LEAF_LIGHT),
        sphere(name + "_crown_dark", radius=0.38 * scale, loc=to_blender(x - 0.2 * scale, z + 0.22 * scale, 1.55 * scale), swatch=SW_MOSS),
    ]


def build_bush(name, x, z, scale, swatch=SW_MOSS_LIGHT):
    """One round edge bush."""
    return [
        sphere(name + "_a", radius=0.34 * scale, loc=to_blender(x, z, 0.26 * scale), swatch=swatch),
        sphere(name + "_b", radius=0.26 * scale, loc=to_blender(x + 0.28 * scale, z + 0.12 * scale, 0.22 * scale), swatch=SW_LEAF),
        sphere(name + "_c", radius=0.22 * scale, loc=to_blender(x - 0.22 * scale, z - 0.16 * scale, 0.2 * scale), swatch=SW_MOSS),
    ]


def build_rock(name, x, z, size, swatch=SW_STONE):
    """A rounded faceted boulder for the field edges."""
    return [blob(name, size=size, loc=to_blender(x, z, size[2] / 2.0), swatch=swatch, bevel=0.1)]


def build_flower_cluster(name, x, z):
    """A tiny flower cluster: green stems and warm or cool petal heads."""
    parts = []
    petals = (SW_MUSHROOM, SW_WARM_WHITE, SW_FROST_DEEP, SW_FORGE_ORANGE)
    offsets = ((-0.16, 0.05), (0.02, -0.03), (0.17, 0.06))
    for index, (offset_x, offset_z) in enumerate(offsets):
        parts.append(
            cylinder(name + "_stem_%d" % index, radius=0.022, depth=0.18, loc=to_blender(x + offset_x, z + offset_z, 0.09), swatch=SW_LEAF, vertices=5)
        )
        parts.append(
            sphere(name + "_head_%d" % index, radius=0.075, loc=to_blender(x + offset_x, z + offset_z, 0.2), swatch=petals[index % len(petals)])
        )
    return parts


def build_mushroom(name, x, z, scale=1.0):
    """One chunky red-cap mushroom with a cream stem (World 1 Wildgrove prop)."""
    return [
        cylinder(name + "_stem", radius=0.07 * scale, depth=0.2 * scale, loc=to_blender(x, z, 0.1 * scale), swatch=SW_WARM_WHITE, vertices=8),
        cone(name + "_cap", radius1=0.24 * scale, radius2=0.06 * scale, depth=0.18 * scale, loc=to_blender(x, z, 0.28 * scale), swatch=SW_MUSHROOM),
        sphere(name + "_spot_a", radius=0.045 * scale, loc=to_blender(x + 0.1 * scale, z + 0.05 * scale, 0.35 * scale), swatch=SW_WARM_WHITE),
        sphere(name + "_spot_b", radius=0.035 * scale, loc=to_blender(x - 0.09 * scale, z - 0.06 * scale, 0.33 * scale), swatch=SW_WARM_WHITE),
    ]


def build_edges():
    """Trees, bushes, rocks, flowers and mushrooms around the playfield (spec 9.3, 9.4)."""
    parts = []
    # Far tree line just behind the field; tall enough to peek over the far edge.
    for name, x, z, scale in (
        ("tree_back_left", 0.55, -1.25, 1.35),
        ("tree_back_mid", 3.0, -1.5, 1.7),
        ("tree_back_right", 5.6, -1.15, 1.5),
        ("tree_back_far", 7.9, -1.7, 1.8),
    ):
        parts.extend(build_tree(name, x, z, scale))
    # Side framing trees next to the base and the portal.
    parts.extend(build_tree("tree_base", -2.85, 0.7, 1.45))
    parts.extend(build_tree("tree_portal", 12.4, 5.5, 1.25))
    # Bushes and boulders softening the corners and the borders.
    for name, x, z, scale in (
        ("bush_back_a", 1.7, -0.9, 1.0),
        ("bush_back_b", 4.4, -0.95, 0.8),
        ("bush_back_c", 7.0, -0.9, 1.1),
        ("bush_left", -2.35, 2.3, 0.9),
        ("bush_right", 11.1, 1.2, 1.0),
    ):
        parts.extend(build_bush(name, x, z, scale))
    for name, x, z, size, swatch in (
        ("rock_back_left", 1.15, -1.9, (0.75, 0.5, 0.42), SW_STONE),
        ("rock_back_right", 6.9, -1.85, (0.6, 0.45, 0.36), SW_STONE_LIGHT),
        ("rock_left", -3.0, 4.4, (0.9, 0.55, 0.5), SW_STONE_DARK),
        ("rock_right", 10.6, 5.3, (0.55, 0.4, 0.34), SW_STONE),
        ("rock_front_a", 2.1, 5.75, (0.5, 0.36, 0.3), SW_STONE_LIGHT),
        ("rock_front_b", 6.4, 5.8, (0.62, 0.4, 0.34), SW_STONE),
    ):
        parts.extend(build_rock(name, x, z, size, swatch))
    # Low front-border flowers and mushrooms stay below the playfield sight line.
    for index, (x, z) in enumerate(((1.1, 5.65), (3.2, 5.9), (4.9, 5.6), (7.4, 5.85), (8.6, 5.55))):
        parts.extend(build_flower_cluster("flower_front_%d" % index, x, z))
    for name, x, z, scale in (
        ("mushroom_a", 0.3, 5.35, 1.1),
        ("mushroom_b", 5.6, 6.0, 0.9),
        ("mushroom_c", 9.4, 5.5, 1.0),
        ("mushroom_back", 2.2, -0.75, 1.2),
    ):
        parts.extend(build_mushroom(name, x, z, scale))
    # A few flat stepping stones read as the dirt path across the front border.
    for index, x in enumerate((1.6, 3.4, 5.2, 7.0, 8.8)):
        parts.append(cylinder("path_stone_%d" % index, radius=0.34, depth=0.05, loc=to_blender(x, 6.15, 0.03), swatch=SW_STONE_LIGHT, vertices=8))
    return parts


def build_backdrop():
    """Layered backdrop: painted sky band, low hills and clouds behind the tree line.

    The spec 9.1 level camera looks down steeply, so only a shallow strip behind
    the field is on screen. The sky band and clouds therefore sit right behind the
    tree line (three.js z about -3.5..-4.2): they read above the hills and through
    the trees without needing a tall distant wall.
    """
    parts = [
        blob("sky_panel", size=(120.0, 0.4, 40.0), loc=to_blender(4.5, -4.3, 20.0), swatch=SW_SKY, bevel=0.0),
        blob("sky_horizon", size=(120.0, 0.3, 1.4), loc=to_blender(4.5, -4.15, 0.7), swatch=SW_SKY_LIGHT, bevel=0.0),
        blob("far_meadow", size=(40.0, 3.2, 0.3), loc=to_blender(4.5, -2.55, -0.17), swatch=SW_MOSS, bevel=0.06),
        sphere("sun", radius=0.8, loc=to_blender(14.2, -3.9, 2.9), swatch=SW_WARM_WHITE),
    ]
    for name, x, z, radius, height, swatch in (
        ("hill_left", -1.6, -2.8, 3.0, 1.05, SW_MOSS),
        ("hill_right", 9.8, -2.9, 2.8, 0.95, SW_MOSS_LIGHT),
        ("hill_mid_left", 1.7, -3.05, 2.6, 1.15, SW_MOSS_LIGHT),
        ("hill_mid_right", 6.6, -3.0, 2.7, 1.0, SW_MOSS),
        ("hill_far_left", -5.5, -3.4, 3.4, 1.25, SW_LEAF),
        ("hill_far_right", 14.5, -3.45, 3.2, 1.15, SW_LEAF),
    ):
        parts.append(
            cone(
                name,
                radius1=radius,
                radius2=radius * 0.35,
                depth=height,
                loc=to_blender(x, z, height / 2.0 - 0.02),
                swatch=swatch,
                vertices=16,
            )
        )
    cloud_clusters = (
        (0.6, -3.95, 2.55, 0.95),
        (4.3, -4.0, 2.95, 1.1),
        (8.2, -3.9, 2.6, 0.9),
        (11.6, -3.95, 3.1, 0.85),
        (-3.2, -3.95, 2.8, 0.9),
    )
    for cluster_index, (cluster_x, cluster_z, cluster_height, scale) in enumerate(cloud_clusters):
        for puff_index, (offset_x, offset_z, offset_height, puff_scale) in enumerate(
            ((0.0, 0.0, 0.0, 1.0), (0.7, 0.05, -0.08, 0.78), (-0.68, -0.05, -0.06, 0.7), (0.15, 0.05, 0.16, 0.6))
        ):
            parts.append(
                sphere(
                    "cloud_%d_%d" % (cluster_index, puff_index),
                    radius=0.62 * scale * puff_scale,
                    loc=to_blender(cluster_x + offset_x * scale, cluster_z + offset_z * scale, cluster_height + offset_height * scale),
                    swatch=SW_WARM_WHITE,
                )
            )
    return parts


def check_environment_budget():
    """Run the spec 9.3 environment budget and report the measured bounds."""
    assert_tris(30000)
    bounds_min, bounds_max = character_bounds()
    size = bounds_max - bounds_min
    print(
        "check: environment bounds x %.2f..%.2f, z %.2f..%.2f, height %.2f"
        % (bounds_min.x, bounds_max.x, -bounds_max.y, -bounds_min.y, size.z)
    )
    if len(character_meshes()) > 4:
        raise RuntimeError("environment should merge into at most 4 meshes, found %d" % len(character_meshes()))


def main():
    """Build, check and export the World 1 environment model."""
    arguments = script_arguments()
    output = argument_value(arguments, "--out")
    if output is None:
        raise RuntimeError('usage: world1.py -- --out assets-build/raw/world1.glb')
    reset_scene()
    ground = build_ground()
    structures = join_meshes(build_base_gate() + build_portal() + build_edges(), "world1_structures")
    backdrop = join_meshes(build_backdrop(), "world1_backdrop")
    print(
        "world1: %d triangles in %d meshes (ground, %s, %s)"
        % (triangle_count(), len(character_meshes()), structures.name, backdrop.name)
    )
    check_environment_budget()
    export_glb(output)


if __name__ == "__main__":
    main()
