"""Low-poly primitives that every character is built from (spec 12.3).

All sizes are in tiles (spec 9.1) and a primitive's `loc` is the centre of its
bounding box, so the numbers in a character script are easy to reason about. The
primitives bake their object transform, carry the shared palette material and add
a bevel modifier: `bind()` (rig.py) applies the bevel, joins the parts and skins
them to the armature.

Characters stand at the origin and face +X (spec 12.5), so their left/right
symmetry plane is the XZ plane; `mirror_x()` mirrors a part across that plane.
"""

import math

import bmesh
import bpy
from mathutils import Euler, Vector

from palette import assign_swatch
from scene import CHARACTER_COLLECTION

DEFAULT_BEVEL_SEGMENTS = 2
CYLINDER_SEGMENTS = 12
SPHERE_SEGMENTS = 12
SPHERE_RINGS = 8


def _character_collection():
    return bpy.data.collections[CHARACTER_COLLECTION]


def _prepare(obj, name, swatch, bevel, smooth, bevel_segments=DEFAULT_BEVEL_SEGMENTS):
    """Link a fresh primitive to the character collection and finish it."""
    obj.name = name
    obj.data.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    _character_collection().objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Bake location/rotation/scale so the mesh already lives in character space:
    # join and rigid skinning then cannot fight over object transforms.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    if bevel > 0.0:
        modifier = obj.modifiers.new("bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = bevel_segments
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(60.0)
        modifier.use_clamp_overlap = True
    assign_swatch(obj, swatch)
    return obj


def blob(name, size, loc, swatch, bevel=0.08, rot=(0.0, 0.0, 0.0), bevel_segments=DEFAULT_BEVEL_SEGMENTS):
    """A rounded box; `size` is the full (x, y, z) extent of the body."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.scale = size
    return _prepare(obj, name, swatch, bevel, smooth=False, bevel_segments=bevel_segments)


def cylinder(name, radius, depth, loc, swatch, rot=(0.0, 0.0, 0.0), vertices=CYLINDER_SEGMENTS, bevel=0.0):
    """A low-poly cylinder with flat facets; `depth` is along local Z."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    return _prepare(bpy.context.object, name, swatch, bevel, smooth=False)


def cone(name, radius1, radius2, depth, loc, swatch, rot=(0.0, 0.0, 0.0), vertices=CYLINDER_SEGMENTS, bevel=0.0):
    """A low-poly cone/frustum; `depth` is along local Z."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rot
    )
    return _prepare(bpy.context.object, name, swatch, bevel, smooth=False)


def sphere(name, radius, loc, swatch, segments=SPHERE_SEGMENTS, rings=SPHERE_RINGS, scale=(1.0, 1.0, 1.0)):
    """A smooth low-poly sphere; `scale` squashes it into domes, ears and caps."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    return _prepare(obj, name, swatch, 0.0, smooth=True)


def capsule(name, radius, depth, loc, swatch, rot=(0.0, 0.0, 0.0), segments=CYLINDER_SEGMENTS):
    """A rounded capsule: cylinder of `depth` plus two hemispherical caps."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=depth, location=loc, rotation=rot)
    cylinder_obj = bpy.context.object
    # The caps sit at both ends of the local Z axis, rotated with the cylinder.
    offset = Euler(rot, "XYZ").to_matrix() @ Vector((0.0, 0.0, depth / 2.0))
    sphere_objects = []
    for direction in (1.0, -1.0):
        centre = Vector(loc) + direction * offset
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=6, radius=radius, location=centre)
        sphere_objects.append(bpy.context.object)
    for sphere_obj in sphere_objects:
        for polygon in sphere_obj.data.polygons:
            polygon.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    for part in [cylinder_obj, *sphere_objects]:
        part.select_set(True)
    bpy.context.view_layer.objects.active = cylinder_obj
    bpy.ops.object.join()
    return _prepare(cylinder_obj, name, swatch, 0.0, smooth=True)


def mirror_x(obj, name=None):
    """Duplicate `obj` mirrored across the character's left/right symmetry plane.

    Characters face +X (spec 12.5) with Z up, so the symmetry plane is the XZ
    plane and the mirrored copy differs in Y. The copy keeps the material, bevel
    modifier, UVs and smooth flags of the original.
    """
    duplicate = obj.copy()
    duplicate.data = obj.data.copy()
    _character_collection().objects.link(duplicate)
    duplicate.name = name or "%s_mirrored" % obj.name
    duplicate.data.name = duplicate.name
    bpy.ops.object.select_all(action="DESELECT")
    duplicate.select_set(True)
    bpy.context.view_layer.objects.active = duplicate
    duplicate.scale.y *= -1.0
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Negative scaling inverts the normals; recalculate them so lighting is right.
    mesh = duplicate.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return duplicate
