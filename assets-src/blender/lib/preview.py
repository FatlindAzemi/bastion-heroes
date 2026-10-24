"""Render the four review images of one exported model (spec 12.8).

Run it headless through Blender after the model script exported its raw .glb:

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P assets-src/blender/lib/preview.py -- \
        --glb assets-build/raw/<id>.glb --id <id> [--out assets-build/previews/<id>]

The images are 512x512 with a transparent background: front three-quarter view,
right side view, the fixed game camera angle of spec 9.1 and the solid black
silhouette of spec 9.5. #64 calls this for every model after building it.
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


def render_previews(glb_path, model_id, out_dir=None):
    """Render the four spec 12.8 images and return their paths."""
    output_dir = pathlib.Path(out_dir) if out_dir else render.preview_directory(model_id)
    armature, meshes = render.open_model(glb_path)
    render.set_idle_pose(armature)
    scene = render.setup_render()
    render.setup_lights()
    bounds_min, bounds_max = render.evaluated_bounds(meshes)
    centre = (bounds_min + bounds_max) / 2.0
    distance = render.fit_distance(bounds_min, bounds_max, render.GAME_CAMERA_FOV_DEGREES)
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


def main():
    """CLI entry point used by npm run assets (spec 12.2)."""
    arguments = scene_helper.script_arguments()
    glb_path = scene_helper.argument_value(arguments, "--glb")
    model_id = scene_helper.argument_value(arguments, "--id")
    if not glb_path or not model_id:
        raise RuntimeError("usage: preview.py -- --glb <model.glb> --id <model id> [--out <folder>]")
    render_previews(glb_path, model_id, scene_helper.argument_value(arguments, "--out"))


if __name__ == "__main__":
    main()
