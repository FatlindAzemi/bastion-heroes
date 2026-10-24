"""Beauty renders of the World 1 environment in the in-game camera (issue #73).

The spec 12.8 previews (lib/preview.py) frame the whole model, which includes the
backdrop, so they are far too wide to judge the playfield. This script renders
the environment through the renderer's fitted level camera (src/render/
cameraFit.ts: fixed 9.1 FOV and view direction, playfield bounds kept below the
top 14 % HUD strip) plus a three-quarter overview for the art review.

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P assets-src/blender/environment/preview_world1.py -- \
        --glb assets-build/raw/world1.glb --out assets-build/previews/world1/beauty
"""

import math
import pathlib
import sys

BLENDER_DIR = pathlib.Path(__file__).resolve().parent
sys.path.append(str(BLENDER_DIR.parent / "lib"))

import bpy
from mathutils import Vector

import render
from scene import argument_value, script_arguments

# Mirrors src/render/cameraFit.ts (spec 9.1, issue #82).
LEVEL_CAMERA_FOV = 32.0
LEVEL_CAMERA_TARGET = Vector((4.5, -2.6, 0.0))
LEVEL_CAMERA_DIRECTION = Vector((0.0, -7.9, 7.5)).normalized()
LEVEL_VIEW_BOUNDS = {
    "min_x": -2.7,
    "max_x": 11.7,
    "min_height": 0.0,
    "max_height": 1.8,
    "min_z": -0.9,
    "max_z": 5.9,
}
HUD_TOP_FRACTION = 0.14
HORIZONTAL_NDC_LIMIT = 0.97
BOTTOM_NDC_LIMIT = -0.97
VIEW_RAISE = 1.0
SKY_BACKGROUND = "9FD8FF"


def view_bounds_corners():
    """The eight world corners of the playfield view bounds, in Blender space."""
    corners = []
    for x in (LEVEL_VIEW_BOUNDS["min_x"], LEVEL_VIEW_BOUNDS["max_x"]):
        for height in (LEVEL_VIEW_BOUNDS["min_height"], LEVEL_VIEW_BOUNDS["max_height"]):
            for z in (LEVEL_VIEW_BOUNDS["min_z"], LEVEL_VIEW_BOUNDS["max_z"]):
                corners.append(Vector((x, -z, height)))
    return corners


def camera_basis():
    """Forwards/right/up basis of the fixed 9.1 view direction."""
    forward = -LEVEL_CAMERA_DIRECTION
    world_up = Vector((0.0, 0.0, 1.0))
    right = forward.cross(world_up).normalized()
    up = right.cross(forward).normalized()
    return forward, right, up


def fitted_camera(aspect, hud_top_fraction=HUD_TOP_FRACTION):
    """Camera position and look target that keep the playfield on screen (cameraFit.ts)."""
    tan_half_fov = math.tan(math.radians(LEVEL_CAMERA_FOV / 2.0))
    top_ndc = 1.0 - 2.0 * hud_top_fraction
    forward, right, up = camera_basis()
    distance = 1.0
    for corner in view_bounds_corners():
        offset = corner - LEVEL_CAMERA_TARGET
        depth_offset = offset.dot(LEVEL_CAMERA_DIRECTION)
        horizontal = offset.dot(right)
        vertical = offset.dot(up)
        required_depth_x = abs(horizontal) / (tan_half_fov * aspect * HORIZONTAL_NDC_LIMIT)
        required_depth_y = (
            vertical / (tan_half_fov * top_ndc)
            if vertical >= 0
            else -vertical / (tan_half_fov * abs(BOTTOM_NDC_LIMIT))
        )
        distance = max(distance, depth_offset + max(required_depth_x, required_depth_y))
    distance = max(1.0, distance + 0.05)
    look_target = LEVEL_CAMERA_TARGET + Vector((0.0, 0.0, VIEW_RAISE))
    return look_target + LEVEL_CAMERA_DIRECTION * distance, look_target


def add_vertical_camera(name, position, target, vertical_fov=LEVEL_CAMERA_FOV):
    """A perspective camera whose FOV is vertical, like three.js PerspectiveCamera.fov."""
    camera = render.add_camera(name, position, target, vertical_fov)
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle = math.radians(vertical_fov)
    return camera


def render_game_camera(scene, bpy_scene, width, height, out_dir):
    """Render the fitted in-game camera at a screen size and return the image path."""
    camera_position, look_target = fitted_camera(width / height)
    bpy_scene.render.resolution_x = width
    bpy_scene.render.resolution_y = height
    scene.camera = add_vertical_camera("game_camera_%dx%d" % (width, height), camera_position, look_target)
    return render.render_to(out_dir / ("game_camera_%dx%d.png" % (width, height)))


def render_overview(scene, bpy_scene, out_dir):
    """Render a three-quarter diorama overview for the art review (1280x720)."""
    width, height = 1280, 720
    bpy_scene.render.resolution_x = width
    bpy_scene.render.resolution_y = height
    target = Vector((4.5, -2.5, 0.9))
    azimuth = math.radians(32.0)
    elevation = math.radians(22.0)
    direction = Vector(
        (
            math.cos(elevation) * math.cos(azimuth),
            -math.cos(elevation) * math.sin(azimuth),
            math.sin(elevation),
        )
    )
    scene.camera = add_vertical_camera("overview", target + direction * 20.0, target)
    return render.render_to(out_dir / "overview_1280x720.png")


def main():
    """Open the exported environment and render the review images."""
    arguments = script_arguments()
    glb_path = argument_value(arguments, "--glb")
    out_dir = pathlib.Path(argument_value(arguments, "--out") or "assets-build/previews/world1/beauty")
    if glb_path is None:
        raise RuntimeError("usage: preview_world1.py -- --glb assets-build/raw/world1.glb [--out <folder>]")
    out_dir.mkdir(parents=True, exist_ok=True)

    armature, meshes = render.open_model(glb_path)
    render.set_idle_pose(armature)
    # Same toon preview material as the spec 12.8 previews (#66), so the art review
    # sees the environment with the renderer's 9.2 three-step shading.
    render.apply_toon_materials(meshes)
    scene = render.setup_render(width=1280, height=720, background=SKY_BACKGROUND)
    render.setup_lights()
    # The beauty renders show the model, not the lighting rig: disable sun shadows so
    # the painted sky panel stays a clean flat backdrop behind the diorama.
    for light in bpy.data.lights:
        light.use_shadow = False
    bpy_scene = bpy.context.scene
    paths = [
        render_game_camera(scene, bpy_scene, 844, 390, out_dir),
        render_game_camera(scene, bpy_scene, 1280, 720, out_dir),
        render_overview(scene, bpy_scene, out_dir),
    ]
    for path in paths:
        print("preview: %s" % path)
    print("preview: world1 beauty renders for %d meshes" % len(meshes))


if __name__ == "__main__":
    main()
