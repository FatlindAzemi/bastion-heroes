"""Skeletal clips, keyed at 30 fps and exported through the NLA (spec 9.6, 12.3).

`clip()` creates one action per clip and pushes it onto its own muted NLA track.
`export_glb()` exports the tracks, so every clip becomes a separate glTF
animation with exactly the name given here (spec 12.5).

    clip('idle', 2.0, [
        key('body', 0, scale=(1, 1, 1)),
        key('body', 30, scale=(1.03, 1.03, 0.97)),
        key('body', 60, scale=(1, 1, 1)),
    ])

A clip must key frame 0. When its last key is earlier than `length_s * 30` (the
spec 12.4 template ends `victory` on frame 24 although 1.2 s is frame 36), the
last authored pose is held to the clip end so the spec 9.6 length stays exact.
"""

import bpy

from rig import reset_pose
from scene import FPS, character_armature


def key(bone, frame, rot=None, loc=None, scale=None):
    """One keyframe of one bone: rotation (radians), location and scale are optional."""
    return {"bone": bone, "frame": int(frame), "rot": rot, "loc": loc, "scale": scale}


def _apply_key(armature, entry):
    pose_bone = armature.pose.bones.get(entry["bone"])
    if pose_bone is None:
        raise RuntimeError('clip keys bone "%s", which the armature does not have' % entry["bone"])
    pose_bone.rotation_mode = "XYZ"
    frame = entry["frame"]
    if entry["rot"] is not None:
        pose_bone.rotation_euler = entry["rot"]
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
    if entry["loc"] is not None:
        pose_bone.location = entry["loc"]
        pose_bone.keyframe_insert(data_path="location", frame=frame)
    if entry["scale"] is not None:
        pose_bone.scale = entry["scale"]
        pose_bone.keyframe_insert(data_path="scale", frame=frame)


def _check_frames(name, keys, last_frame):
    frames = {entry["frame"] for entry in keys}
    if 0 not in frames:
        raise RuntimeError('clip "%s" must key frame 0' % name)
    if any(frame < 0 or frame > last_frame for frame in frames):
        raise RuntimeError('clip "%s" has a key outside frames 0-%d' % (name, last_frame))


def _hold_last_pose(armature, keys, last_frame):
    """Key the final value at `last_frame` when the last key comes earlier.

    The spec 12.4 template ends `victory` (1.2 s at 30 fps = frame 36) on frame 24,
    so the helper holds the last authored pose to the clip end: the clip keeps the
    spec 9.6 length and keeps the template a valid character script.
    """
    last_keys = {}
    for entry in keys:
        for channel in ("rot", "loc", "scale"):
            if entry[channel] is not None:
                last_keys[(entry["bone"], channel)] = entry
    data_paths = {"rot": "rotation_euler", "loc": "location", "scale": "scale"}
    for (bone_name, channel), entry in last_keys.items():
        if entry["frame"] >= last_frame:
            continue
        pose_bone = armature.pose.bones[bone_name]
        setattr(pose_bone, data_paths[channel], entry[channel])
        pose_bone.keyframe_insert(data_path=data_paths[channel], frame=last_frame)


def clip(name, length_s, keys):
    """Create one action from `keys`, push it to the NLA and return the action."""
    if length_s <= 0:
        raise RuntimeError('clip "%s" needs a positive length' % name)
    armature = character_armature()
    last_frame = max(1, int(round(length_s * FPS)))
    _check_frames(name, keys, last_frame)
    reset_pose(armature)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    animation_data = armature.animation_data or armature.animation_data_create()
    animation_data.action = action
    for entry in keys:
        _apply_key(armature, entry)
    _hold_last_pose(armature, keys, last_frame)
    reset_pose(armature)
    track = animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    # Muted so a later clip (or the preview import) is not a blend of all clips;
    # the glTF exporter still exports every NLA track (spec 12.5).
    track.mute = True
    animation_data.action = None
    return action
