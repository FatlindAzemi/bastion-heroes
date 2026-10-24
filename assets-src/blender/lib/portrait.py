"""Render the card portrait of one exported model (spec 12.9).

Run it headless through Blender after the model script exported its raw .glb:

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P assets-src/blender/lib/portrait.py -- \
        --glb assets-build/raw/<id>.glb --id <id> [--out public/portraits/<id>.webp]

It renders a 512x512 transparent PNG of the idle pose at frame 0 into
`assets-build/portraits/<id>.png` (gitignored, useful for review) and converts it
to `public/portraits/<id>.webp` at quality 85 (committed, drawn behind the
rarity frame of spec 9.8). The camera sits at head height and the head and
shoulders fill 80 % of the frame.
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

PORTRAIT_LENS_MM = 50.0
PORTRAIT_AZIMUTH_DEGREES = 18.0
# Head plus shoulders (and a little torso) are about this share of the model height.
SUBJECT_HEIGHT_SHARE = 0.60
# Spec 12.9: the head and shoulders fill 80 % of the frame.
SUBJECT_FILL = 0.8
# The camera sits at head height: the head centre is this share below the top.
HEAD_HEIGHT_SHARE = 0.18
# And aims at the middle of the head-and-shoulders region.
LOOK_AT_HEIGHT_SHARE = 0.30


def _portrait_camera(bounds_min, bounds_max):
    """A camera at head height framing the head and shoulders at 80 % (spec 12.9)."""
    height = bounds_max.z - bounds_min.z
    centre = (bounds_min + bounds_max) / 2.0
    camera_height = bounds_max.z - HEAD_HEIGHT_SHARE * height
    head = Vector((centre.x, centre.y, camera_height))
    look_at = Vector((centre.x, centre.y, bounds_max.z - LOOK_AT_HEIGHT_SHARE * height))
    azimuth = math.radians(PORTRAIT_AZIMUTH_DEGREES)
    direction = Vector((math.cos(azimuth), -math.sin(azimuth), 0.0))
    camera = render.add_camera("portrait", head, look_at, render.GAME_CAMERA_FOV_DEGREES)
    camera.data.lens = PORTRAIT_LENS_MM
    visible_height = SUBJECT_HEIGHT_SHARE * height / SUBJECT_FILL
    distance = visible_height / (2.0 * math.tan(camera.data.angle / 2.0))
    camera.location = head + direction * distance
    render.aim_at(camera, look_at)
    return camera


def render_portrait(glb_path, model_id, webp_path=None, png_path=None):
    """Render the portrait PNG and the committed WebP; return both paths."""
    webp = pathlib.Path(webp_path) if webp_path else render.portrait_webp_path(model_id)
    png = pathlib.Path(png_path) if png_path else render.portrait_png_path(model_id)
    armature, meshes = render.open_model(glb_path)
    render.set_idle_pose(armature)
    scene = render.setup_render()
    render.setup_lights()
    bounds_min, bounds_max = render.evaluated_bounds(meshes)
    scene.camera = _portrait_camera(bounds_min, bounds_max)
    png_file = render.render_to(png)
    _check_size(png_file)
    webp_file = render.save_webp(webp, quality=85)
    print("portrait: %s - wrote %s (%d bytes)" % (model_id, webp_file, webp_file.stat().st_size))
    print("portrait: review PNG %s" % png_file)
    return webp_file, png_file


def _check_size(path):
    """Fail when the rendered portrait is not 512x512 (spec 12.9)."""
    image = bpy.data.images.load(str(path), check_existing=False)
    if tuple(image.size) != (render.RENDER_SIZE, render.RENDER_SIZE):
        raise RuntimeError(
            "portrait check failed (spec 12.9): %s is %r, expected %dx%d"
            % (path, tuple(image.size), render.RENDER_SIZE, render.RENDER_SIZE)
        )


def main():
    """CLI entry point used by npm run assets (spec 12.2)."""
    arguments = scene_helper.script_arguments()
    glb_path = scene_helper.argument_value(arguments, "--glb")
    model_id = scene_helper.argument_value(arguments, "--id")
    if not glb_path or not model_id:
        raise RuntimeError("usage: portrait.py -- --glb <model.glb> --id <model id> [--out <file.webp>]")
    render_portrait(
        glb_path,
        model_id,
        webp_path=scene_helper.argument_value(arguments, "--out"),
        png_path=scene_helper.argument_value(arguments, "--png"),
    )


if __name__ == "__main__":
    main()
