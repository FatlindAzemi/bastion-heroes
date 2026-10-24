"""End-to-end smoke test for the shared Blender helper library (spec 12.3, 12.8, 12.9).

This is not a game character: it builds a throwaway blocky figure to exercise
scene.py, palette.py, parts.py, rig.py, anim.py, export.py, checks.py, preview.py
and portrait.py, then verifies the exported .glb contract with a small GLB reader.
All output goes to `assets-build/` (gitignored); no model id is involved.

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P assets-src/blender/smoke_test.py

Run it after changing the helper library or the Blender runtime. It must finish
in well under 60 seconds (spec 12.2) and fails loudly on any broken helper.
"""

import json
import math
import pathlib
import struct
import sys

import bpy

BLENDER_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = BLENDER_DIR.parents[1]
sys.path.append(str(BLENDER_DIR / "lib"))

from anim import clip, key
from checks import assert_height, assert_origin_at_feet, assert_tris
from export import export_glb
from parts import blob, capsule, cone, mirror_x, sphere
from rig import bind, make_armature
from scene import reset_scene
import portrait
import preview

MODEL_ID = "smoke_test"
# Swatch indices from assets-src/palette/README.md (ramp * 8 + slot, anchor on slot 3).
SWATCH_FORGE_COPPER = 3
SWATCH_SKIN = 211
SWATCH_WILDGROVE_LEAF = 27
SWATCH_INK = 243
SWATCH_GLOOM_EYE_CYAN = 139
EXPECTED_CLIPS = ["idle", "attack"]


def build_figure():
    """Build the throwaway blocky figure and return its parts."""
    reset_scene()
    body = blob("body", size=(0.34, 0.30, 0.32), loc=(0.0, 0.0, 0.30), swatch=SWATCH_FORGE_COPPER)
    head = sphere("head", radius=0.17, loc=(0.0, 0.0, 0.58), swatch=SWATCH_SKIN)
    cap = cone("cap", radius1=0.20, radius2=0.04, depth=0.14, loc=(0.0, 0.0, 0.77), swatch=SWATCH_WILDGROVE_LEAF)
    eye_left = sphere("eye_left", radius=0.035, loc=(0.15, 0.06, 0.59), swatch=SWATCH_GLOOM_EYE_CYAN)
    eye_right = mirror_x(eye_left, name="eye_right")
    leg_left = capsule("leg_left", radius=0.055, depth=0.10, loc=(0.0, 0.10, 0.11), swatch=SWATCH_INK)
    leg_right = mirror_x(leg_left, name="leg_right")
    arm_left = capsule("arm_left", radius=0.05, depth=0.16, loc=(0.0, 0.22, 0.34), swatch=SWATCH_FORGE_COPPER)
    arm_right = mirror_x(arm_left, name="arm_right")
    return {
        "body": body,
        "head": head,
        "cap": cap,
        "eye_left": eye_left,
        "eye_right": eye_right,
        "leg_left": leg_left,
        "leg_right": leg_right,
        "arm_left": arm_left,
        "arm_right": arm_right,
    }


def build_rig(parts):
    """Create the armature and bind every part rigidly to one bone."""
    armature = make_armature(
        [
            ("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.08), None),
            ("body", (0.0, 0.0, 0.08), (0.0, 0.0, 0.42), "root"),
            ("head", (0.0, 0.0, 0.42), (0.0, 0.0, 0.66), "body"),
            ("leg_left", (0.0, 0.10, 0.16), (0.0, 0.10, 0.02), "root"),
            ("leg_right", (0.0, -0.10, 0.16), (0.0, -0.10, 0.02), "root"),
            ("arm_left", (0.0, 0.22, 0.42), (0.0, 0.22, 0.26), "body"),
            ("arm_right", (0.0, -0.22, 0.42), (0.0, -0.22, 0.26), "body"),
        ]
    )
    bind(
        {
            "body": [parts["body"]],
            "head": [parts["head"], parts["cap"], parts["eye_left"], parts["eye_right"]],
            "leg_left": [parts["leg_left"]],
            "leg_right": [parts["leg_right"]],
            "arm_left": [parts["arm_left"]],
            "arm_right": [parts["arm_right"]],
        },
        armature,
    )
    return armature


def build_clips():
    """Key the two clips the smoke test exports at 30 fps."""
    clip(
        "idle",
        2.0,
        [
            key("body", 0, scale=(1.0, 1.0, 1.0)),
            key("head", 0, rot=(0.0, 0.0, 0.0)),
            key("body", 30, scale=(1.03, 1.03, 0.97)),
            key("head", 30, rot=(0.0, math.radians(4.0), 0.0)),
            key("body", 60, scale=(1.0, 1.0, 1.0)),
            key("head", 60, rot=(0.0, 0.0, 0.0)),
        ],
    )
    clip(
        "attack",
        0.4,
        [
            key("arm_left", 0, rot=(0.0, 0.0, 0.0)),
            key("arm_left", 6, rot=(math.radians(-60.0), 0.0, 0.0)),
            key("arm_left", 12, rot=(0.0, 0.0, 0.0)),
        ],
    )


def read_glb_json(path):
    """Read the JSON chunk of a .glb without third-party modules."""
    data = path.read_bytes()
    magic, _version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise RuntimeError("smoke test failed: %s is not a GLB file" % path)
    offset = 12
    while offset < length:
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        if chunk_type == 0x4E4F534A:
            return json.loads(data[offset : offset + chunk_length].decode("utf-8"))
        offset += chunk_length
    raise RuntimeError("smoke test failed: %s has no JSON chunk" % path)


def check_glb(path):
    """Verify the exported model contract preview/optimization depend on."""
    gltf = read_glb_json(path)
    animations = [animation.get("name") for animation in gltf.get("animations", [])]
    if animations != EXPECTED_CLIPS:
        raise RuntimeError("smoke test failed: glTF animations are %r, expected %r" % (animations, EXPECTED_CLIPS))
    if len(gltf.get("skins", [])) != 1:
        raise RuntimeError("smoke test failed: expected one skin, found %d" % len(gltf.get("skins", [])))
    if len(gltf.get("meshes", [])) != 1:
        raise RuntimeError("smoke test failed: expected one joined mesh, found %d" % len(gltf.get("meshes", [])))
    if not gltf.get("images") or not gltf.get("materials"):
        raise RuntimeError("smoke test failed: the palette material or its texture is missing")
    node_names = {node.get("name") for node in gltf.get("nodes", [])}
    for bone in ("root", "head"):
        if bone not in node_names:
            raise RuntimeError('smoke test failed: glTF has no "%s" joint node' % bone)
    print("smoke: glb animations %r, 1 skin, 1 mesh, palette texture embedded" % animations)


def check_render(path, size, silhouette=False):
    """Verify one review image: 512x512, transparent background, black silhouette."""
    image = bpy.data.images.load(str(path), check_existing=False)
    if tuple(image.size) != (size, size):
        raise RuntimeError("smoke test failed: %s is %r, expected %dx%d" % (path, tuple(image.size), size, size))
    buffer = [0.0] * (size * size * 4)
    image.pixels.foreach_get(buffer)
    opaque = [index for index in range(0, len(buffer), 4) if buffer[index + 3] > 0.5]
    if not opaque:
        raise RuntimeError("smoke test failed: %s has no opaque pixels" % path)
    if len(opaque) == size * size:
        raise RuntimeError("smoke test failed: %s has no transparent background" % path)
    if silhouette and max(max(buffer[index], buffer[index + 1], buffer[index + 2]) for index in opaque) > 0.02:
        raise RuntimeError("smoke test failed: %s is not a solid black silhouette" % path)
    print("smoke: %s - %dx%d, %d opaque pixels%s" % (path.name, size, size, len(opaque), ", solid black" if silhouette else ""))


def main():
    """Build, rig, animate, check, export and render the smoke figure."""
    parts = build_figure()
    build_rig(parts)
    build_clips()
    assert_height(0.7, 0.9)
    assert_tris(3000)
    assert_origin_at_feet()
    raw_glb = export_glb(REPO_ROOT / "assets-build" / "raw" / ("%s.glb" % MODEL_ID))
    check_glb(raw_glb)
    previews = preview.render_previews(raw_glb, MODEL_ID)
    for preview_path in previews:
        check_render(preview_path, 512, silhouette=preview_path.name == "silhouette.png")
    webp, png = portrait.render_portrait(
        raw_glb,
        MODEL_ID,
        webp_path=REPO_ROOT / "assets-build" / "smoke" / ("%s.webp" % MODEL_ID),
        png_path=REPO_ROOT / "assets-build" / "smoke" / ("%s.png" % MODEL_ID),
    )
    check_render(png, 512)
    check_render(webp, 512)
    print("smoke: ok - %d preview images, portrait %s and %s" % (len(previews), webp, png))


if __name__ == "__main__":
    main()
