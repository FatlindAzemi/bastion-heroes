"""Early, loud model checks (spec 9.3, 12.3, 12.5).

A character script calls these after `bind()` and before `export_glb()`, so a
model that breaks a budget fails in Blender instead of in review:

    assert_height(0.7, 0.9)
    assert_tris(3000)
    assert_origin_at_feet()

Each check raises `RuntimeError` with a message that says what was measured and
which spec rule it broke. `--python-exit-code 1` makes the Blender process fail.
"""

import bpy

from scene import character_armature, character_bounds, character_meshes

# A model stands on the ground plane; this much small over/under-shoot is allowed.
GROUND_TOLERANCE = 0.02
# The origin must sit at the centre of the feet; this is hand-authored geometry.
ORIGIN_TOLERANCE = 1e-3


def triangle_count():
    """Triangle count of the whole model, with modifiers applied (spec 9.3)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in character_meshes():
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def assert_height(minimum, maximum):
    """Fail unless the model's bounding-box height is inside the spec 9.3 range."""
    bounds_min, bounds_max = character_bounds()
    height = bounds_max.z - bounds_min.z
    if not minimum <= height <= maximum:
        raise RuntimeError(
            "height check failed (spec 9.3): model is %.3f tall, expected %.2f-%.2f" % (height, minimum, maximum)
        )
    print("check: height %.3f in %.2f-%.2f" % (height, minimum, maximum))


def assert_tris(maximum):
    """Fail when the model has more triangles than the spec 9.3 budget."""
    total = triangle_count()
    if total > maximum:
        raise RuntimeError("triangle check failed (spec 9.3): model has %d triangles, budget is %d" % (total, maximum))
    print("check: %d triangles, budget %d" % (total, maximum))


def assert_origin_at_feet():
    """Fail unless the origin is at the centre of the feet on the ground (12.5)."""
    armature = character_armature()
    origin = armature.matrix_world.translation
    for axis in range(3):
        if abs(origin[axis]) > ORIGIN_TOLERANCE:
            raise RuntimeError("origin check failed (spec 12.5): armature origin is %r, expected (0, 0, 0)" % (tuple(origin),))
    bounds_min, _ = character_bounds()
    if abs(bounds_min.z) > GROUND_TOLERANCE:
        raise RuntimeError(
            "origin check failed (spec 12.5): lowest vertex is at z=%.3f, expected the ground (0.000)" % bounds_min.z
        )
    print("check: origin at feet, lowest vertex z=%.3f" % bounds_min.z)
