"""Render the four review images of one exported model (spec 12.8).

Run it headless through Blender after the model script exported its raw .glb:

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P assets-src/blender/lib/preview.py -- \
        --glb assets-build/raw/<id>.glb --id <id> [--out assets-build/previews/<id>]
        [--width 512] [--height 512] [--background 9FD8FF]

The default images are 512x512 with a transparent background: front
three-quarter view, right side view, the fixed game camera angle of spec 9.1 and
the solid black silhouette of spec 9.5. Environments (spec 9.3, issue #73) run
through the same script; a solid sRGB background hex keeps the diorama readable
in the opaque beauty renders used for the PR review.
"""

import math
import pathlib
import sys

_LIB_DIR = pathlib.Path(__file__).resolve().parent
if str(_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_DIR))

import bpy
from mathutils import Vector

import render
import scene as scene_helper

# Spec 9.5: the silhouette is rendered solid black.
SILHOUETTE_VIEW = "front_three_quarter"


def view_directions():
    """Unit directions from the model centre towards the front/side/game cameras."""
    azimuth = math.radians(35.0)
    elevation = math.radians(18.0)
    front = Vector(
        (
            math.cos(elevation) * math.cos(azimuth),
            -math.cos(elevation) * math.sin(azimuth),
            math.sin(elevation),
        )
    )
    side_elevation = math.radians(10.0)
    side = Vector((0.0, -math.cos(side_elevation), math.sin(side_elevation)))
    return (
        ("front_three_quarter", front),
        ("side", side),
        ("game_camera", render.GAME_CAMERA_DIRECTION),
    )


def render_previews(
    glb_path,
    model_id,
    out_dir=None,
    width=render.RENDER_SIZE,
    height=render.RENDER_SIZE,
    background=None,
    frame_bounds=None,
):
    """Render the four spec 12.8 images and return their paths.

    `frame_bounds` overrides the framing box as
    `((min_x, min_y, min_z), (max_x, max_y, max_z))` in Blender coordinates. A
    large environment (issue #73) includes a painted backdrop, so the playfield
    is framed through an explicit box instead of the whole-model bounds.
    """
    output_dir = pathlib.Path(out_dir) if out_dir else render.preview_directory(model_id)
    armature, meshes = render.open_model(glb_path)
    render.set_idle_pose(armature)
    scene = render.setup_render(width=width, height=height, background=background)
    render.setup_lights()
    render.apply_toon_materials(meshes)
    if frame_bounds is None:
        bounds_min, bounds_max = render.evaluated_bounds(meshes)
    else:
        lower, upper = frame_bounds
        bounds_min = Vector(lower)
        bounds_max = Vector(upper)
    centre = (bounds_min + bounds_max) / 2.0
    aspect = width / height
    distance = render.fit_distance(
        bounds_min, bounds_max, render.GAME_CAMERA_FOV_DEGREES, aspect=aspect
    )
    paths = []
    for name, direction in view_directions():
        scene.camera = render.add_camera(
            name, centre + direction * distance, centre, render.GAME_CAMERA_FOV_DEGREES
        )
        paths.append(render.render_to(output_dir / ("%s.png" % name)))
    bpy.context.view_layer.material_override = render.silhouette_material()
    scene.camera = bpy.data.objects[SILHOUETTE_VIEW]
    paths.append(render.render_to(output_dir / "silhouette.png"))
    bpy.context.view_layer.material_override = None
    print("preview: %s - wrote 4 images to %s" % (model_id, output_dir))
    for path in paths:
        print("preview: %s" % path)
    return paths


def _bounds_argument(arguments, name):
    """Read an optional frame box `minx,miny,minz,maxx,maxy,maxz` (Blender coordinates)."""
    raw = scene_helper.argument_value(arguments, name, None)
    if raw is None:
        return None
    parts = raw.split(",")
    if len(parts) != 6:
        raise RuntimeError("%s must be six comma-separated numbers, got %r" % (name, raw))
    try:
        values = [float(part) for part in parts]
    except ValueError:
        raise RuntimeError("%s must be six numbers, got %r" % (name, raw))
    return (tuple(values[:3]), tuple(values[3:]))


def _integer_argument(arguments, name, default):
    """Read a positive integer CLI option like --width (spec 12.8 review size)."""
    raw = scene_helper.argument_value(arguments, name, None)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise RuntimeError("%s must be an integer, got %r" % (name, raw))
    if value <= 0:
        raise RuntimeError("%s must be positive, got %d" % (name, value))
    return value


def main():
    """CLI entry point used by npm run assets (spec 12.2)."""
    arguments = scene_helper.script_arguments()
    glb_path = scene_helper.argument_value(arguments, "--glb")
    model_id = scene_helper.argument_value(arguments, "--id")
    if not glb_path or not model_id:
        raise RuntimeError(
            "usage: preview.py -- --glb <model.glb> --id <model id> "
            "[--out <folder>] [--width 512] [--height 512] [--background 9FD8FF] "
            "[--frame-bounds minx,miny,minz,maxx,maxy,maxz]"
        )
    render_previews(
        glb_path,
        model_id,
        scene_helper.argument_value(arguments, "--out"),
        _integer_argument(arguments, "--width", render.RENDER_SIZE),
        _integer_argument(arguments, "--height", render.RENDER_SIZE),
        scene_helper.argument_value(arguments, "--background"),
        _bounds_argument(arguments, "--frame-bounds"),
    )


if __name__ == "__main__":
    main()
