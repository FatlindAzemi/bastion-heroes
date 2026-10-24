"""Armature creation and rigid skinning (spec 12.3, 12.5).

Bones are given as `(name, head, tail, parent)` tuples. Each mesh part is bound
rigidly to exactly one bone: every vertex of the part gets weight 1.0 on that
bone, so no weight painting is needed. `bind()` joins the parts into one mesh
before skinning, which keeps a character at one draw call (spec 11.7) and one
material (spec 12.5).

Every rig must contain the bones `root` (knockback) and `head` (status VFX);
`make_armature()` and `bind()` refuse a rig without them (spec 12.5).
"""

import bpy

from scene import character_collection

REQUIRED_BONES = ("root", "head")
MESH_NAME = "character_mesh"


def _validate_bones(bones):
    names = []
    for entry in bones:
        if len(entry) != 4:
            raise RuntimeError("bone %r must be (name, head, tail, parent)" % (entry,))
        name, head, tail, parent = entry
        if not name:
            raise RuntimeError("every bone needs a name")
        if tuple(head) == tuple(tail):
            raise RuntimeError('bone "%s" is zero length' % name)
        if parent is not None and parent not in names:
            raise RuntimeError('bone "%s" has parent "%s" before it is defined' % (name, parent))
        names.append(name)
    for required in REQUIRED_BONES:
        if required not in names:
            raise RuntimeError('rig check failed: every rig needs a "%s" bone (spec 12.5)' % required)
    return names


def make_armature(bones, name="armature"):
    """Create the character armature from `(name, head, tail, parent)` tuples."""
    _validate_bones(bones)
    armature_data = bpy.data.armatures.new(name)
    armature = bpy.data.objects.new(name, armature_data)
    character_collection().objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = {}
    for bone_name, head, tail, parent in bones:
        edit_bone = armature_data.edit_bones.new(bone_name)
        edit_bone.head = head
        edit_bone.tail = tail
        edit_bone.use_connect = False
        if parent is not None:
            edit_bone.parent = edit_bones[parent]
        edit_bones[bone_name] = edit_bone
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def _apply_modifiers(obj):
    """Apply the bevel (and any other non-armature) modifiers of one part."""
    if not obj.modifiers:
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def _assign_part_to_bone(obj, bone_name):
    """Create the vertex group and give every vertex weight 1.0 on the bone."""
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")


def _join_parts(parts):
    """Join the prepared parts into one mesh object in the character collection."""
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = MESH_NAME
    joined.data.name = MESH_NAME
    return joined


def _assert_rigid_weights(mesh, bone_names):
    """Fail when a vertex is not bound 100 % to exactly one existing bone."""
    for vertex in mesh.data.vertices:
        if len(vertex.groups) != 1:
            raise RuntimeError("vertex %d has %d bone weights, expected exactly 1" % (vertex.index, len(vertex.groups)))
        group = mesh.vertex_groups[vertex.groups[0].group]
        if group.name not in bone_names:
            raise RuntimeError('vertex %d is bound to "%s", which is not a bone' % (vertex.index, group.name))
        if abs(vertex.groups[0].weight - 1.0) > 1e-4:
            raise RuntimeError("vertex %d has weight %.3f, expected 1.0" % (vertex.index, vertex.groups[0].weight))


def bind(mesh_parts, armature):
    """Rigidly skin every part to one bone and join the parts into one mesh.

    `mesh_parts` maps a bone name to the part or list of parts bound to it, e.g.
    `{"body": [body], "head": [head, cap], "hand_r": [staff]}` (spec 12.4).
    """
    if armature.type != "ARMATURE":
        raise RuntimeError("bind() needs an armature, got %s" % armature.type)
    bone_names = {bone.name for bone in armature.data.bones}
    for required in REQUIRED_BONES:
        if required not in bone_names:
            raise RuntimeError('rig check failed: armature has no "%s" bone (spec 12.5)' % required)
    part_bones = {}
    for bone_name, objects in mesh_parts.items():
        if bone_name not in bone_names:
            raise RuntimeError('bind() names bone "%s", which the armature does not have' % bone_name)
        for part in objects:
            if part.type != "MESH":
                raise RuntimeError("bind() got %s (%s), expected mesh parts" % (part.name, part.type))
            if part in part_bones:
                raise RuntimeError('part "%s" is bound to both "%s" and "%s"' % (part.name, part_bones[part], bone_name))
            part_bones[part] = bone_name
    if not part_bones:
        raise RuntimeError("bind() needs at least one mesh part")
    for part, bone_name in part_bones.items():
        _apply_modifiers(part)
        _assign_part_to_bone(part, bone_name)
    mesh = _join_parts(list(part_bones))
    modifier = mesh.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    mesh.parent = armature
    _assert_rigid_weights(mesh, bone_names)
    return mesh


def reset_pose(armature):
    """Put every pose bone back to rest, ready for the next clip."""
    for pose_bone in armature.pose.bones:
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
