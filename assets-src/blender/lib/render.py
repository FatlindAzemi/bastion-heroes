"""Render plumbing shared by preview.py and portrait.py (spec 12.8, 12.9).

Both scripts open an exported `.glb`, hide the helper objects the glTF importer
adds, put the armature on the idle clip at frame 0, light the scene and render
with EEVEE on a transparent background. Previews use the palette material as
exported; the silhouette swaps in a flat black override material (spec 9.5).
"""

import math
import pathlib
import sys

_LIB_DIR = pathlib.Path(__file__).resolve().parent
if str(_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_DIR))

import bpy
from mathutils import Vector

import scene as scene_helper
from scene import repo_root

RENDER_SIZE = 512
# Spec 9.1: fixed game camera FOV.
GAME_CAMERA_FOV_DEGREES = 32.0
# Spec 9.1 camera (4.5, 7.5, 10.5) looking at (4.5, 0, 2.6), converted from
# three.js Y-up to Blender Z-up: the look direction is (0, -7.9, 7.5).
GAME_CAMERA_DIRECTION = Vector((0.0, -7.9, 7.5)).normalized()
TRANSPARENT_FILM = True
RENDER_SAMPLES = 32
# Standard view transform keeps the palette colours as authored (no AgX tone map).
VIEW_TRANSFORM = "Standard"


def open_model(glb_path):
    """Start an empty scene, import `glb_path` and return (armature, meshes)."""
    scene_helper.reset_scene()
    glb = pathlib.Path(glb_path)
    if not glb.is_file():
        raise RuntimeError("model file not found: %s" % glb)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError("expected one armature in %s, found %d" % (glb, len(armatures)))
    armature = armatures[0]
    character = {armature, *armature.children_recursive}
    # The glTF importer adds display helpers (for example an Icosphere bone shape);
    # keep them out of the renders and out of the framing.
    for obj in bpy.data.objects:
        if obj not in character:
            obj.hide_render = True
    meshes = [obj for obj in character if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("no skinned mesh found in %s" % glb)
    return armature, meshes


def set_idle_pose(armature, frame=0):
    """Mute all NLA tracks, play the idle clip (if exported) and set `frame`."""
    animation_data = armature.animation_data or armature.animation_data_create()
    for track in animation_data.nla_tracks:
        track.mute = True
    idle = bpy.data.actions.get("idle")
    if idle is not None:
        animation_data.action = idle
    bpy.context.scene.frame_set(frame)


def evaluated_bounds(meshes):
    """World-space (minimum, maximum) corners of the posed model."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = Vector((float("inf"),) * 3)
    maximum = Vector((float("-inf"),) * 3)
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        for vertex in mesh.vertices:
            point = evaluated.matrix_world @ vertex.co
            minimum = Vector((min(minimum.x, point.x), min(minimum.y, point.y), min(minimum.z, point.z)))
            maximum = Vector((max(maximum.x, point.x), max(maximum.y, point.y), max(maximum.z, point.z)))
        evaluated.to_mesh_clear()
    return minimum, maximum


def setup_render(samples=RENDER_SAMPLES):
    """Configure EEVEE, a square transparent render and faithful colours."""
    scene = bpy.context.scene
    engines = [entry.identifier for entry in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    if "BLENDER_EEVEE_NEXT" in engines:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    elif "BLENDER_EEVEE" in engines:
        scene.render.engine = "BLENDER_EEVEE"
    else:
        raise RuntimeError("this Blender build has no EEVEE engine")
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = TRANSPARENT_FILM
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = VIEW_TRANSFORM
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = samples
    world = bpy.data.worlds.new("preview_world")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.05, 0.06, 0.09, 1.0)
    background.inputs["Strength"].default_value = 0.8
    scene.world = world
    return scene


def _add_sun(name, position, energy, color):
    """A sun aimed at the world origin from `position` (spec 9.2 key light colour)."""
    light_data = bpy.data.lights.new(name, "SUN")
    light_data.energy = energy
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    bpy.context.scene.collection.objects.link(light)
    direction = (Vector((0.0, 0.0, 0.0)) - Vector(position)).normalized()
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return light


def setup_lights():
    """Warm key, front fill, cool fill and a rim light so chunky shapes read clearly."""
    # Spec 9.2 key-light colour, from the upper left front of the character (+X).
    _add_sun("key", (2.2, -2.4, 3.2), 2.8, (1.0, 0.949, 0.851))
    _add_sun("front", (2.4, -2.2, 0.9), 1.0, (1.0, 0.97, 0.92))
    _add_sun("fill", (-1.8, -2.0, 1.2), 1.4, (0.749, 0.89, 1.0))
    _add_sun("rim", (-1.6, 2.4, 2.2), 1.8, (1.0, 1.0, 1.0))


def aim_at(camera, target):
    """Rotate `camera` so it looks at `target` (spec 12.8, 12.9)."""
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return camera


def add_camera(name, location, target, angle_degrees):
    """A camera at `location` looking at `target` with the given FOV."""
    camera_data = bpy.data.cameras.new(name)
    camera_data.angle = math.radians(angle_degrees)
    camera = bpy.data.objects.new(name, camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    return aim_at(camera, target)


def fit_distance(bounds_min, bounds_max, angle_degrees, margin=1.15):
    """Distance at which the largest model extent fills the frame with a small margin."""
    extent = bounds_max - bounds_min
    radius = max(extent.x, extent.y, extent.z) / 2.0
    return radius * margin / math.sin(math.radians(angle_degrees) / 2.0)


def render_to(path):
    """Render the active camera to `path` as a transparent PNG and return it."""
    output = pathlib.Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("render failed: %s was not written" % output)
    return output


def silhouette_material():
    """A flat black material for the spec 9.5 silhouette test."""
    material = bpy.data.materials.get("silhouette")
    if material is not None:
        return material
    material = bpy.data.materials.new("silhouette")
    material.use_nodes = True
    principled = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    principled.inputs["Roughness"].default_value = 1.0
    # No specular: a black diffuse surface is only black without highlights (spec 9.5).
    for input_name in ("Specular IOR Level", "Specular"):
        if input_name in principled.inputs:
            principled.inputs[input_name].default_value = 0.0
    return material


def save_webp(webp_path, quality=85):
    """Save the last render as WebP at `quality` with an alpha channel (spec 12.9)."""
    output = pathlib.Path(webp_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    settings = scene.render.image_settings
    settings.file_format = "WEBP"
    settings.color_mode = "RGBA"
    settings.quality = quality
    bpy.data.images["Render Result"].save_render(str(output), scene=scene)
    if not output.is_file() or output.read_bytes()[:4] != b"RIFF" or output.read_bytes()[8:12] != b"WEBP":
        raise RuntimeError("WebP conversion failed: %s is not a WebP file" % output)
    return output


def preview_directory(model_id):
    """Default output folder of the four review images (spec 12.8)."""
    return repo_root() / "assets-build" / "previews" / model_id


def portrait_png_path(model_id):
    """Intermediate transparent portrait PNG, kept out of git (spec 12.9)."""
    return repo_root() / "assets-build" / "portraits" / ("%s.png" % model_id)


def portrait_webp_path(model_id):
    """Committed card portrait path (spec 12.9)."""
    return repo_root() / "public" / "portraits" / ("%s.webp" % model_id)
