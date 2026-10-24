"""Export one model as a glTF binary (spec 12.1, 12.3, 12.5).

The exporter writes only the shared model collection ("character", spec 12.3),
applies modifiers, keeps Y up and exports every NLA clip as its own glTF
animation. Characters export one skinned mesh with the shared palette material
(spec 12.5); environments (spec 9.3, issue #73) export their static meshes
through the same call, so the palette texture is always embedded in the .glb and
`public/models/<id>.glb` is self-contained.
"""

from pathlib import Path

import bpy

from scene import character_collection


def _select_model():
    """Select exactly the model collection and make a sensible object active."""
    bpy.ops.object.select_all(action="DESELECT")
    objects = list(character_collection().all_objects)
    if not objects:
        raise RuntimeError("export failed: the model collection is empty")
    for obj in objects:
        obj.select_set(True)
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    if len(armatures) > 1:
        raise RuntimeError("export failed: expected at most one armature, found %d" % len(armatures))
    # Characters are made active through their armature; a static environment
    # (no rig, issue #73) exports with its first mesh active.
    bpy.context.view_layer.objects.active = armatures[0] if armatures else objects[0]


def export_glb(path):
    """Export the current model to `path` (.glb) and return the written file path."""
    output = Path(path).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    _select_model()
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_skins=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_cameras=False,
        export_lights=False,
    )
    if not output.is_file():
        raise RuntimeError("glTF export failed: %s was not written" % output)
    print("export: wrote %s (%d bytes)" % (output, output.stat().st_size))
    return output
