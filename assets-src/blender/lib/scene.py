"""Scene setup shared by every Bastion Heroes Blender script (spec 12.3).

The helpers run inside Blender's bundled Python only (spec 10.2) and are started
headless, for example:

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P assets-src/blender/characters/<id>.py -- --out assets-build/raw/<id>.glb

`--python-exit-code 1` is mandatory: Blender 4.x and 5.x both exit with status 0
when a `-P` script raises, so without the flag a failed check would look green.
"""

import sys
from pathlib import Path

import bpy
from mathutils import Vector

# Spec 12.3 and 9.1: metric units, one Blender unit is one game tile.
TILE_SIZE = 1.0
# Spec 9.6 and 12.3: all character clips are keyed at 30 frames per second.
FPS = 30
# Every model lives in this collection; export_glb (spec 12.3) exports only it.
CHARACTER_COLLECTION = "character"


def repo_root():
    """Absolute path of the repository root, derived from this file's location."""
    return Path(__file__).resolve().parents[3]


def reset_scene():
    """Delete everything and return an empty metric scene with a character collection."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    collection = bpy.data.collections.new(CHARACTER_COLLECTION)
    scene.collection.children.link(collection)
    return scene


def character_collection():
    """The collection that holds the model being built (spec 12.1, 12.3)."""
    collection = bpy.data.collections.get(CHARACTER_COLLECTION)
    if collection is None:
        raise RuntimeError('scene is not set up: call reset_scene() first')
    return collection


def character_objects():
    """Every object in the character collection, armature and meshes included."""
    return list(character_collection().all_objects)


def character_meshes():
    """The mesh objects of the model being built, in collection order."""
    return [obj for obj in character_objects() if obj.type == "MESH"]


def character_armature():
    """The single armature of the model being built (spec 12.5)."""
    armatures = [obj for obj in character_objects() if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError("expected exactly one armature in the character collection, found %d" % len(armatures))
    return armatures[0]


def character_bounds():
    """World-space (minimum, maximum) corners of the model's meshes."""
    meshes = character_meshes()
    if not meshes:
        raise RuntimeError("the character collection has no meshes")
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = Vector((min(corner.x for corner in corners), min(corner.y for corner in corners), min(corner.z for corner in corners)))
    maximum = Vector((max(corner.x for corner in corners), max(corner.y for corner in corners), max(corner.z for corner in corners)))
    return minimum, maximum


def script_arguments():
    """The arguments after the `--` separator, as passed by spec 12.2."""
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def argument_value(arguments, name, default=None):
    """Value after `name` in the argument list, or default when it is absent."""
    if name not in arguments:
        return default
    position = arguments.index(name)
    if position + 1 >= len(arguments):
        raise RuntimeError("argument %s needs a value" % name)
    return arguments[position + 1]
