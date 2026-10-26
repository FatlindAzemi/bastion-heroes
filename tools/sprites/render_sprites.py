"""Batch Blender renderer for the Bastion Heroes pixel-art sprite pipeline (issue #114).

The script imports the rigged character GLBs of ``public/models/`` (and the
generated environment prop GLBs), plays every animation clip and renders the
sampled frames from the fixed portrait game camera:

* orthographic, so the sprites are flat pixel-art images,
* on the ``-x`` side of the board looking along ``+x`` towards the portal,
* elevation 45 degrees above the horizontal (the portrait camera of
  ``src/render/cameraFit.ts``),
* centred on the character's vertical axis, feet at the bottom of the frame.

Every frame is rendered at ``RENDER_SCALE`` times the final sprite size so
``make_atlases.py`` can perform its nearest-neighbour downsample, palette
reduction and outline pass. Characters are rotated 180 degrees first when they
are enemies, because enemies face ``-x``: the enemy sprite must show the front
of the model exactly the way the in-game billboard will show it.

Character identity and clip lengths come from the GLB itself. The clip
sampling is deterministic, so re-running the script reproduces the same frames.

Run it through Blender (``build_sprites.py`` does this):

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \\
        -P tools/sprites/render_sprites.py -- \\
        --cache-dir /tmp/bastion-heroes-sprites [--only gloomling] \\
        [--props-dir /tmp/bastion-heroes-sprites/props]
"""

import json
import math
import pathlib
import sys
from collections import OrderedDict

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BLENDER_LIB_DIR = REPO_ROOT / "assets-src" / "blender" / "lib"
if str(BLENDER_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(BLENDER_LIB_DIR))

import bpy  # noqa: E402  (Blender's bundled module, imported after the sys.path setup)
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import render as render_lib  # noqa: E402  (shared render plumbing, spec 12.8)

# Spec 9.6: all character clips are authored at 30 frames per second.
FPS = 30
# Supersampling factor: the raw render is 4x the final sprite frame.
RENDER_SCALE = 4
# Final sprite resolution. 90 px per world unit keeps a regular unit in the
# 60-90 px readable band demanded by the task.
PIXELS_PER_UNIT = 90.0
# Props use the same texel density as the units so the whole 2.5D scene keeps
# one chunky pixel size when the render layer scales everything by worldHeight.
PROP_PIXELS_PER_UNIT = 90.0
# The portrait camera of the relaunch: the base side (-x) looking at the portal,
# 45 degrees above the horizontal (src/render/cameraFit.ts LEVEL_CAMERA_ELEVATION_DEG).
CAMERA_ELEVATION_DEGREES = 45.0
# Distance is irrelevant for an orthographic camera; keep every model in front.
CAMERA_DISTANCE = 20.0
# Transparent padding around the silhouette, in final sprite pixels.
SIDE_MARGIN_PX = 5
BOTTOM_MARGIN_PX = 3
TOP_MARGIN_PX = 3
# EEVEE anti-aliasing samples. The alpha mask is thresholded afterwards, so a
# low sample count is enough and keeps the batch fast.
RENDER_SAMPLES = 8
# Spec 9.2 key light plus warm/cool fills. Directions are given as the vector
# from the model towards the light: upper left front of the portrait camera
# (-x is towards the camera, +y is screen left, +z is up).
SUN_LIGHTS = (
    ("key", (-0.55, 0.65, 0.95), 2.2, (1.0, 0.949, 0.851)),
    ("front", (-0.70, 0.60, 0.25), 0.45, (1.0, 0.97, 0.92)),
    ("fill", (0.60, 0.50, 0.35), 0.50, (0.749, 0.89, 1.0)),
    ("rim", (0.35, -0.70, 0.60), 0.80, (1.0, 1.0, 1.0)),
)
# Spec 9.6 clip order. Clips missing in a GLB are omitted from its sheet.
CLIP_ORDER = ("idle", "attack", "walk", "eat", "produce", "victory")
# Sample counts chosen for a crisp 4-8 frame pixel-art animation per clip. The
# output fps keeps the authored clip duration, so playback speed matches 3D.
CLIP_SAMPLING = OrderedDict(
    (
        ("idle", {"samples": 8, "loop": True}),
        ("attack", {"samples": 4, "loop": False}),
        ("walk", {"samples": 6, "loop": True}),
        ("eat", {"samples": 5, "loop": True}),
        ("produce", {"samples": 4, "loop": False}),
        ("victory", {"samples": 5, "loop": False}),
    )
)
# Card portraits (issue #114 follow-up): a head-and-shoulders shot for the
# collection cards. It is rendered on the same pixel grid as the sprites: a
# 64x64 logical pixel grid at 4x, upscaled 2x by make_atlases.py to 128x128.
PORTRAIT_GRID = 64
PORTRAIT_OUTPUT_SIZE = 128
PORTRAIT_AZIMUTH_DEGREES = 22.0
PORTRAIT_ELEVATION_DEGREES = 12.0
# Portrait crop: from a little above the head down to the shoulders. The neck
# comes from the rig's head bone; the head always reaches the top of the bounds.
PORTRAIT_TOP_PADDING_FRACTION = 0.05
PORTRAIT_SHOULDER_DROP_FRACTION = 0.12
PORTRAIT_MIN_CROP_FRACTION = 0.32
PORTRAIT_HEAD_WIDTH_FILL = 0.86
# Enemies face -x (spec 9.1); their GLBs are authored facing +x like defenders.
ENEMY_FACING_ROTATION_DEGREES = 180.0
# Characters whose GLB has no idle clip hold this clip's first frame instead.
IDLE_FALLBACK_CLIPS = ("walk", "eat", "attack")
# The full roster, in the order the render layer and the contact sheet use.
CHARACTERS = OrderedDict(
    (
        ("glowshroom_monk", "defender"),
        ("sparkbolt_gremlin", "defender"),
        ("boomcap_brewer", "defender"),
        ("snowpup_yeti", "defender"),
        ("rune_archer", "defender"),
        ("pyro_fox", "defender"),
        ("iron_granny", "defender"),
        ("frost_witch", "defender"),
        ("gloomling", "enemy"),
        ("shade_wisp", "enemy"),
        ("bat_swarm", "enemy"),
        ("gloom_priest", "enemy"),
        ("gloom_ogre", "enemy"),
        ("pothead", "enemy"),
        ("shieldbearer", "enemy"),
    )
)
ELEVATION = math.radians(CAMERA_ELEVATION_DEGREES)
# Orthonormal camera basis in Blender coordinates (Z up, characters face +x).
CAMERA_FORWARD = Vector((math.cos(ELEVATION), 0.0, -math.sin(ELEVATION)))
SCREEN_RIGHT = Vector((0.0, -1.0, 0.0))
SCREEN_UP = Vector((math.sin(ELEVATION), 0.0, math.cos(ELEVATION)))


def log(message):
    """Print one pipeline progress line with a stable prefix."""
    print("sprites: %s" % message, flush=True)


def script_arguments():
    """The arguments after the ``--`` separator, as passed by build_sprites.py."""
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def argument_value(arguments, name, default=None):
    """Value after ``name`` in the argument list, or ``default`` when absent."""
    if name not in arguments:
        return default
    position = arguments.index(name)
    if position + 1 >= len(arguments):
        raise RuntimeError("argument %s needs a value" % name)
    return arguments[position + 1]


def ceil_to_multiple(value, multiple):
    """Smallest multiple of ``multiple`` that is not below ``value``."""
    return int(math.ceil(value / float(multiple))) * multiple


def screen_coordinates(point):
    """(horizontal, vertical) screen coordinates of a world point, in world units."""
    return point.dot(SCREEN_RIGHT), point.dot(SCREEN_UP)


def world_point(horizontal, vertical, depth):
    """Inverse of screen_coordinates for a given camera depth."""
    return SCREEN_RIGHT * horizontal + SCREEN_UP * vertical + CAMERA_FORWARD * depth


def model_objects(armature, meshes):
    """The imported model objects, including the parent chain of each one."""
    objects = set(meshes)
    if armature is not None:
        objects.add(armature)
    for obj in list(objects):
        parent = obj.parent
        while parent is not None:
            objects.add(parent)
            parent = parent.parent
    return objects


def rotate_for_faction(armature, meshes, faction):
    """Rotate an enemy model 180 degrees so it faces -x, towards the camera."""
    if faction != "enemy":
        return
    roots = [obj for obj in model_objects(armature, meshes) if obj.parent is None]
    if not roots:
        raise RuntimeError("enemy model has no root object to rotate")
    angle = math.radians(ENEMY_FACING_ROTATION_DEGREES)
    for root in roots:
        root.rotation_mode = "XYZ"
        root.rotation_euler[2] += angle
    bpy.context.view_layer.update()


def apply_pose(armature, action, frame):
    """Play ``action`` on the armature and jump to ``frame`` (spec 12.5)."""
    if armature is None:
        bpy.context.scene.frame_set(0)
        return
    animation_data = armature.animation_data or armature.animation_data_create()
    for track in animation_data.nla_tracks:
        track.mute = True
    animation_data.action = action
    # Blender 4.4+ actions have slots; the glTF importer stores one per model.
    slots = getattr(action, "slots", None)
    if slots and hasattr(animation_data, "action_slot"):
        animation_data.action_slot = slots[0]
    bpy.context.scene.frame_set(int(frame))


def clip_positions(action, sampling):
    """The source frames to sample for one clip and its output fps."""
    start, end = action.frame_range
    length = float(end - start)
    samples = int(sampling["samples"])
    if length <= 0.0:
        return [int(round(start))], 1.0
    samples = max(1, min(samples, int(round(length)) + 1))
    if sampling["loop"]:
        # Loop clips drop the duplicate end frame: the last sample wraps to the first.
        positions = [start + length * index / samples for index in range(samples)]
        output_fps = samples * FPS / length
    elif samples > 1:
        # One-shot clips include both ends so the pose ends at the authored frame.
        positions = [start + length * index / (samples - 1) for index in range(samples)]
        output_fps = (samples - 1) * FPS / length
    else:
        positions = [start]
        output_fps = float(FPS)
    frames = []
    for position in positions:
        frame = int(round(position))
        if not frames or frames[-1] != frame:
            frames.append(frame)
    return frames, round(output_fps, 2)


def clip_plans(armature):
    """Plan every clip of the model: sampled source frames, fps and loop flag.

    ``idle`` is mandatory in the manifest (spec contract of issue #114). A
    character GLB without an idle clip holds the first frame of a fallback clip,
    which is recorded as ``fallback: true`` in the metadata.
    """
    plans = []
    for clip in CLIP_ORDER:
        action = bpy.data.actions.get(clip)
        if action is None:
            continue
        frames, output_fps = clip_positions(action, CLIP_SAMPLING[clip])
        plans.append(
            {
                "clip": clip,
                "action": action,
                "frames": frames,
                "fps": output_fps,
                "loop": bool(CLIP_SAMPLING[clip]["loop"]),
                "fallback": False,
            }
        )
    if not any(plan["clip"] == "idle" for plan in plans):
        fallback = next(
            (bpy.data.actions.get(name) for name in IDLE_FALLBACK_CLIPS if bpy.data.actions.get(name)),
            None,
        )
        if fallback is None:
            raise RuntimeError("model has no animation clip usable as idle fallback")
        start = int(round(fallback.frame_range[0]))
        plans.insert(
            0,
            {
                "clip": "idle",
                "action": fallback,
                "frames": [start],
                "fps": 1.0,
                "loop": True,
                "fallback": True,
            },
        )
    return plans


def evaluated_points(meshes):
    """World-space positions of every evaluated vertex of the posed model."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        matrix = evaluated.matrix_world
        points.extend(matrix @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError("the model has no evaluated vertices")
    return points


def world_bounds(points):
    """Axis-aligned world bounds of a point cloud."""
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return minimum, maximum


def sprite_extents(points):
    """Screen-space extents of a point cloud as [min, max] pairs per axis.

    Projecting every vertex is tighter (and thus more accurate for framing) than
    projecting the corners of an axis-aligned bounding box.
    """
    horizontal = [float("inf"), float("-inf")]
    vertical = [float("inf"), float("-inf")]
    for point in points:
        horizontal_value, vertical_value = screen_coordinates(point)
        horizontal[0] = min(horizontal[0], horizontal_value)
        horizontal[1] = max(horizontal[1], horizontal_value)
        vertical[0] = min(vertical[0], vertical_value)
        vertical[1] = max(vertical[1], vertical_value)
    return horizontal, vertical


def collect_projection_bounds(armature, meshes, plans):
    """Screen-space bounds over all sampled poses plus the reference pose bounds."""
    horizontal = [float("inf"), float("-inf")]
    vertical = [float("inf"), float("-inf")]
    reference_bounds = None
    for plan in plans:
        for frame in plan["frames"]:
            apply_pose(armature, plan["action"], frame)
            points = evaluated_points(meshes)
            pose_horizontal, pose_vertical = sprite_extents(points)
            horizontal[0] = min(horizontal[0], pose_horizontal[0])
            horizontal[1] = max(horizontal[1], pose_horizontal[1])
            vertical[0] = min(vertical[0], pose_vertical[0])
            vertical[1] = max(vertical[1], pose_vertical[1])
            if reference_bounds is None:
                reference_bounds = world_bounds(points)
    if reference_bounds is None:
        raise RuntimeError("model has no rendered pose")
    return horizontal, vertical, reference_bounds


def compute_framing(horizontal, vertical, bounds_min, bounds_max, pixels_per_unit):
    """Sprite frame size in pixels and the camera placement that fills it.

    The frame is centred on the character's vertical axis: the projected world
    origin (x = 0, y = 0) must land on the horizontal centre of the frame, so the
    bottom-centre anchor of the sprite is the unit's position on the board. The
    bottom of the frame sits a few pixels below the lowest silhouette point.
    """
    half_width_world = max(abs(horizontal[0]), abs(horizontal[1]))
    frame_width = ceil_to_multiple(2.0 * half_width_world * pixels_per_unit + 2 * SIDE_MARGIN_PX, 4)
    frame_height = ceil_to_multiple(
        (vertical[1] - vertical[0]) * pixels_per_unit + BOTTOM_MARGIN_PX + TOP_MARGIN_PX, 4
    )
    frame_width = max(frame_width, 4 * SIDE_MARGIN_PX + 16)
    frame_height = max(frame_height, BOTTOM_MARGIN_PX + TOP_MARGIN_PX + 16)
    frame_width_world = frame_width / pixels_per_unit
    frame_height_world = frame_height / pixels_per_unit
    bottom = vertical[0] - BOTTOM_MARGIN_PX / pixels_per_unit
    centre_vertical = bottom + frame_height_world / 2.0
    depth = ((bounds_min + bounds_max) / 2.0).dot(CAMERA_FORWARD)
    return {
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "frameWidthWorld": frame_width_world,
        "frameHeightWorld": frame_height_world,
        "pixelsPerUnit": pixels_per_unit,
        "centreHorizontal": 0.0,
        "centreVertical": centre_vertical,
        "centreDepth": depth,
        "frameBottom": bottom,
    }


def create_sprite_camera(framing):
    """Orthographic camera exactly along the portrait game view direction."""
    camera_data = bpy.data.cameras.new("sprite_camera")
    camera_data.type = "ORTHO"
    # Vertical sensor fit makes ortho_scale the world height of the frame.
    camera_data.sensor_fit = "VERTICAL"
    camera_data.ortho_scale = framing["frameHeightWorld"]
    camera_data.clip_start = 0.1
    camera_data.clip_end = 200.0
    camera = bpy.data.objects.new("sprite_camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    target = world_point(
        framing["centreHorizontal"], framing["centreVertical"], framing["centreDepth"]
    )
    camera.location = target - CAMERA_FORWARD * CAMERA_DISTANCE
    camera.rotation_euler = CAMERA_FORWARD.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    # world_to_camera_view reads matrix_world, so force the dependency graph update.
    bpy.context.view_layer.update()
    return camera, target


def assert_frame_projection(scene, camera, framing):
    """Fail loudly if the camera does not map the frame to the render exactly."""
    target = world_point(
        framing["centreHorizontal"], framing["centreVertical"], framing["centreDepth"]
    )
    half_width = framing["frameWidthWorld"] / 2.0
    half_height = framing["frameHeightWorld"] / 2.0
    checks = (
        ("bottom centre", target - SCREEN_UP * half_height, 0.5, 0.0),
        ("top centre", target + SCREEN_UP * half_height, 0.5, 1.0),
        ("left centre", target - SCREEN_RIGHT * half_width, 0.0, 0.5),
        ("right centre", target + SCREEN_RIGHT * half_width, 1.0, 0.5),
    )
    for name, point, expected_u, expected_v in checks:
        projected = world_to_camera_view(scene, camera, point)
        if abs(projected.x - expected_u) > 0.005 or abs(projected.y - expected_v) > 0.005:
            raise RuntimeError(
                "sprite camera framing is wrong at %s: got (%.4f, %.4f), expected (%.2f, %.2f)"
                % (name, projected.x, projected.y, expected_u, expected_v)
            )


def add_sun_light(name, towards_light, energy, color):
    """One shadowless sun aimed at the model from ``towards_light`` (spec 9.2)."""
    light_data = bpy.data.lights.new(name, "SUN")
    light_data.energy = energy
    light_data.color = color
    # Shadows off: the sprite shading must quantise to the three palette bands.
    light_data.use_shadow = False
    light = bpy.data.objects.new(name, light_data)
    bpy.context.scene.collection.objects.link(light)
    direction = Vector(towards_light).normalized()
    light.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()


def setup_sprite_lights():
    """Warm key from the upper left front plus toon-friendly fills (spec 9.2)."""
    for name, direction, energy, color in SUN_LIGHTS:
        add_sun_light("sprite_%s" % name, direction, energy, color)


def camera_screen_axes(forward):
    """Screen right and up unit vectors for a camera looking along ``forward``."""
    right = forward.cross(Vector((0.0, 0.0, 1.0)))
    if right.length < 1e-6:
        right = Vector((1.0, 0.0, 0.0))
    right.normalize()
    up = right.cross(forward).normalized()
    return right, up


def setup_scene_for_render(framing, samples=RENDER_SAMPLES):
    """Configure EEVEE, resolution, lights and the sprite camera."""
    scene = render_lib.setup_render(
        samples=samples,
        width=framing["frameWidth"] * RENDER_SCALE,
        height=framing["frameHeight"] * RENDER_SCALE,
    )
    setup_sprite_lights()
    camera, target = create_sprite_camera(framing)
    assert_frame_projection(scene, camera, framing)
    return scene


def render_frame(path):
    """Render the current pose to ``path`` and return the written file."""
    return render_lib.render_to(path)


def measured_model_height(bounds_min, bounds_max):
    """The model height in world units as authored (spec 9.3 budgets)."""
    return round(float(bounds_max.z - bounds_min.z), 4)


def model_reference(path):
    """The model path for the metadata: repo relative when possible, absolute otherwise."""
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def character_metadata(char_id, faction, glb_path, framing, height, projected_height, plans):
    """The raw per-character record consumed by make_atlases.py."""
    clips = OrderedDict()
    frames = []
    index = 0
    for plan in plans:
        clips[plan["clip"]] = {
            "samples": len(plan["frames"]),
            "fps": plan["fps"],
            "loop": plan["loop"],
            "fallback": plan["fallback"],
        }
        for sample_index, source_frame in enumerate(plan["frames"]):
            frames.append(
                {
                    "clip": plan["clip"],
                    "index": sample_index,
                    "file": "%s_%03d.png" % (plan["clip"], sample_index),
                    "sourceFrame": source_frame,
                    "gridIndex": index,
                }
            )
            index += 1
    return OrderedDict(
        (
            ("version", 1),
            ("kind", "character"),
            ("id", char_id),
            ("faction", faction),
            ("model", model_reference(glb_path)),
            ("modelHeight", round(float(height), 4)),
            ("projectedHeight", round(float(projected_height), 4)),
            ("pixelsPerUnit", framing["pixelsPerUnit"]),
            ("renderScale", RENDER_SCALE),
            ("frameWidth", framing["frameWidth"]),
            ("frameHeight", framing["frameHeight"]),
            ("frameBottom", round(framing["frameBottom"], 4)),
            ("frameHeightWorld", round(framing["frameHeightWorld"], 4)),
            ("clips", clips),
            ("frames", frames),
        )
    )


def render_character(char_id, faction, cache_dir):
    """Render all sampled clip frames of one character and write its metadata."""
    glb_path = REPO_ROOT / "public" / "models" / ("%s.glb" % char_id)
    if not glb_path.is_file():
        raise RuntimeError("model file is missing: %s" % glb_path)
    out_dir = cache_dir / "raw" / "chars" / char_id
    out_dir.mkdir(parents=True, exist_ok=True)
    armature, meshes = render_lib.open_model(glb_path)
    if armature is None:
        raise RuntimeError("character %s has no armature" % char_id)
    rotate_for_faction(armature, meshes, faction)
    render_lib.apply_toon_materials(meshes)
    plans = clip_plans(armature)
    horizontal, vertical, reference = collect_projection_bounds(armature, meshes, plans)
    framing = compute_framing(horizontal, vertical, reference[0], reference[1], PIXELS_PER_UNIT)
    projected_height = vertical[1] - vertical[0]
    setup_scene_for_render(framing)
    for plan in plans:
        for sample_index, source_frame in enumerate(plan["frames"]):
            apply_pose(armature, plan["action"], source_frame)
            render_frame(out_dir / ("%s_%03d.png" % (plan["clip"], sample_index)))
    height = measured_model_height(reference[0], reference[1])
    metadata = character_metadata(
        char_id, faction, glb_path, framing, height, projected_height, plans
    )
    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    log(
        "%s (%s): %d frames, %dx%d px, height %.3f, projected %.3f"
        % (
            char_id,
            faction,
            len(metadata["frames"]),
            framing["frameWidth"],
            framing["frameHeight"],
            height,
            projected_height,
        )
    )
    return metadata


def render_prop(prop_id, glb_path, cache_dir):
    """Render one static environment prop and write its metadata."""
    out_dir = cache_dir / "raw" / "props"
    out_dir.mkdir(parents=True, exist_ok=True)
    armature, meshes = render_lib.open_model(glb_path)
    if armature is not None:
        raise RuntimeError("prop %s must be a static model without an armature" % prop_id)
    render_lib.apply_toon_materials(meshes)
    apply_pose(None, None, 0)
    points = evaluated_points(meshes)
    bounds_min, bounds_max = world_bounds(points)
    horizontal, vertical = sprite_extents(points)
    framing = compute_framing(horizontal, vertical, bounds_min, bounds_max, PROP_PIXELS_PER_UNIT)
    setup_scene_for_render(framing)
    file_name = "prop_%s.png" % prop_id
    render_frame(out_dir / file_name)
    height = measured_model_height(bounds_min, bounds_max)
    metadata = OrderedDict(
        (
            ("version", 1),
            ("kind", "prop"),
            ("id", prop_id),
            ("model", model_reference(glb_path)),
            ("modelHeight", round(float(height), 4)),
            ("projectedHeight", round(float(vertical[1] - vertical[0]), 4)),
            ("pixelsPerUnit", framing["pixelsPerUnit"]),
            ("renderScale", RENDER_SCALE),
            ("frameWidth", framing["frameWidth"]),
            ("frameHeight", framing["frameHeight"]),
            ("frameBottom", round(framing["frameBottom"], 4)),
            ("frameHeightWorld", round(framing["frameHeightWorld"], 4)),
            ("frame", file_name),
        )
    )
    (out_dir / ("%s.json" % prop_id)).write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    log(
        "prop %s: %dx%d px, height %.3f"
        % (prop_id, framing["frameWidth"], framing["frameHeight"], height)
    )
    return metadata


def portrait_camera_basis():
    """Camera direction and screen axes of the card portrait shot.

    The portrait looks at the character's front with a gentle three-quarter
    angle, so all models are rendered as authored (they face +x): a green
    three-quarter portrait for defenders and enemies alike.
    """
    elevation = math.radians(PORTRAIT_ELEVATION_DEGREES)
    azimuth = math.radians(PORTRAIT_AZIMUTH_DEGREES)
    to_camera = Vector(
        (
            math.cos(elevation) * math.cos(azimuth),
            -math.cos(elevation) * math.sin(azimuth),
            math.sin(elevation),
        )
    )
    forward = -to_camera
    right, up = camera_screen_axes(forward)
    return to_camera, forward, right, up


def setup_portrait_lights(to_camera, right, up):
    """Portrait lighting relative to the portrait camera (upper left front)."""
    screen_left = -right
    specs = (
        ("key", to_camera + screen_left * 0.45 + up * 0.75, 2.2, (1.0, 0.949, 0.851)),
        ("front", to_camera + up * 0.25, 0.45, (1.0, 0.97, 0.92)),
        ("fill", screen_left * -1.0 + up * 0.5 + to_camera * 0.3, 0.5, (0.749, 0.89, 1.0)),
        ("rim", -to_camera + up * 0.8, 0.8, (1.0, 1.0, 1.0)),
    )
    for name, direction, energy, color in specs:
        add_sun_light("portrait_%s" % name, direction, energy, color)


def portrait_framing(points, height, neck_height):
    """Crop rectangle and camera placement for a head-and-shoulders portrait.

    The crop starts just above the top of the silhouette (which includes hats and
    horns) and reaches down to a point below the rig's neck bone, so the head
    plus shoulders fill most of the square frame. The crop grows when a wide head,
    hat or raised weapon would otherwise leave the frame.
    """
    to_camera, forward, right, up = portrait_camera_basis()
    elevation = math.radians(PORTRAIT_ELEVATION_DEGREES)
    vertical = [point.dot(up) for point in points]
    screen_top = max(vertical)
    top_height = max(point.z for point in points)
    if neck_height is None:
        neck_height = top_height - PORTRAIT_MIN_CROP_FRACTION * height
    bottom_height = min(
        neck_height - PORTRAIT_SHOULDER_DROP_FRACTION * height,
        top_height - PORTRAIT_MIN_CROP_FRACTION * height,
    )
    world_crop_height = top_height - bottom_height
    # A vertical world segment projects by cos(elevation) along the screen up axis.
    crop_height = world_crop_height * math.cos(elevation)
    head_points = [point for point in points if point.z >= neck_height]
    if not head_points:
        head_points = points
    head_horizontal = [point.dot(right) for point in head_points]
    centre_horizontal = (min(head_horizontal) + max(head_horizontal)) / 2.0
    head_width = max(head_horizontal) - min(head_horizontal)
    crop_height = max(crop_height, head_width / PORTRAIT_HEAD_WIDTH_FILL)
    screen_top += PORTRAIT_TOP_PADDING_FRACTION * crop_height
    centre_vertical = screen_top - crop_height / 2.0
    depth = sum(point.dot(forward) for point in points) / float(len(points))
    return {
        "toCamera": to_camera,
        "forward": forward,
        "right": right,
        "up": up,
        "orthoScale": crop_height,
        "centreHorizontal": centre_horizontal,
        "centreVertical": centre_vertical,
        "centreDepth": depth,
    }


def create_portrait_camera(framing):
    """Orthographic portrait camera facing the model's front."""
    camera_data = bpy.data.cameras.new("portrait_camera")
    camera_data.type = "ORTHO"
    camera_data.sensor_fit = "VERTICAL"
    camera_data.ortho_scale = framing["orthoScale"]
    camera_data.clip_start = 0.1
    camera_data.clip_end = 200.0
    camera = bpy.data.objects.new("portrait_camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    target = (
        framing["right"] * framing["centreHorizontal"]
        + framing["up"] * framing["centreVertical"]
        + framing["forward"] * framing["centreDepth"]
    )
    camera.location = target - framing["forward"] * CAMERA_DISTANCE
    camera.rotation_euler = framing["forward"].to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    bpy.context.view_layer.update()
    return camera, target


def assert_portrait_projection(scene, camera, framing, target):
    """Fail loudly if the portrait camera does not map the frame exactly."""
    half = framing["orthoScale"] / 2.0
    checks = (
        ("bottom centre", target - framing["up"] * half, 0.5, 0.0),
        ("top centre", target + framing["up"] * half, 0.5, 1.0),
        ("left centre", target - framing["right"] * half, 0.0, 0.5),
        ("right centre", target + framing["right"] * half, 1.0, 0.5),
    )
    for name, point, expected_u, expected_v in checks:
        projected = world_to_camera_view(scene, camera, point)
        if abs(projected.x - expected_u) > 0.005 or abs(projected.y - expected_v) > 0.005:
            raise RuntimeError(
                "portrait camera framing is wrong at %s: got (%.4f, %.4f), expected (%.2f, %.2f)"
                % (name, projected.x, projected.y, expected_u, expected_v)
            )


def render_portrait(char_id, cache_dir):
    """Render the 4x card portrait of one character and write its metadata."""
    glb_path = REPO_ROOT / "public" / "models" / ("%s.glb" % char_id)
    if not glb_path.is_file():
        raise RuntimeError("model file is missing: %s" % glb_path)
    out_dir = cache_dir / "raw" / "portraits"
    out_dir.mkdir(parents=True, exist_ok=True)
    armature, meshes = render_lib.open_model(glb_path)
    if armature is None:
        raise RuntimeError("character %s has no armature" % char_id)
    render_lib.apply_toon_materials(meshes)
    plans = clip_plans(armature)
    reference = plans[0]
    apply_pose(armature, reference["action"], reference["frames"][0])
    points = evaluated_points(meshes)
    bounds_min, bounds_max = world_bounds(points)
    height = measured_model_height(bounds_min, bounds_max)
    head_bone = armature.pose.bones.get("head")
    neck_height = (armature.matrix_world @ head_bone.head).z if head_bone is not None else None
    framing = portrait_framing(points, height, neck_height)
    scene = render_lib.setup_render(
        samples=RENDER_SAMPLES, width=PORTRAIT_GRID * RENDER_SCALE, height=PORTRAIT_GRID * RENDER_SCALE
    )
    setup_portrait_lights(framing["toCamera"], framing["right"], framing["up"])
    camera, target = create_portrait_camera(framing)
    assert_portrait_projection(scene, camera, framing, target)
    file_name = "%s.png" % char_id
    render_frame(out_dir / file_name)
    metadata = OrderedDict(
        (
            ("version", 1),
            ("kind", "portrait"),
            ("id", char_id),
            ("model", model_reference(glb_path)),
            ("gridSize", PORTRAIT_GRID),
            ("outputSize", PORTRAIT_OUTPUT_SIZE),
            ("renderScale", RENDER_SCALE),
            ("modelHeight", round(float(height), 4)),
            ("file", file_name),
        )
    )
    (out_dir / ("%s.json" % char_id)).write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    log("portrait %s: %dx%d px (4x render)" % (char_id, PORTRAIT_GRID, PORTRAIT_GRID))
    return metadata


def parse_only(arguments):
    """The comma separated ``--only`` character ids, or the full roster."""
    raw = argument_value(arguments, "--only")
    if raw is None:
        return list(CHARACTERS)
    requested = [part.strip() for part in raw.split(",") if part.strip()]
    unknown = [char_id for char_id in requested if char_id not in CHARACTERS]
    if unknown:
        raise RuntimeError("unknown character id(s) in --only: %s" % ", ".join(unknown))
    return requested


def main():
    """Render the requested characters and/or props into the cache directory."""
    arguments = script_arguments()
    cache_argument = argument_value(arguments, "--cache-dir")
    if cache_argument is None:
        raise RuntimeError("usage: render_sprites.py -- --cache-dir <dir> [--only id1,id2] [--props-dir <dir>]")
    cache_dir = pathlib.Path(cache_argument)
    cache_dir.mkdir(parents=True, exist_ok=True)
    props_only = "--props-only" in arguments
    portraits_only = "--portraits-only" in arguments
    render_portraits = "--portraits" in arguments or portraits_only
    if not props_only and not portraits_only:
        for char_id in parse_only(arguments):
            render_character(char_id, CHARACTERS[char_id], cache_dir)
    if render_portraits:
        for char_id in parse_only(arguments):
            render_portrait(char_id, cache_dir)
    props_dir = None if portraits_only else argument_value(arguments, "--props-dir")
    if props_dir is not None:
        prop_paths = sorted(pathlib.Path(props_dir).glob("*.glb"))
        if not prop_paths:
            raise RuntimeError("no prop GLB found in %s (run assets-src/blender/sprites/props.py)" % props_dir)
        for prop_path in prop_paths:
            render_prop(prop_path.stem, prop_path, cache_dir)
    log("done")


if __name__ == "__main__":
    main()
