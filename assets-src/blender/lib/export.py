"""Export one model as a glTF binary (spec 12.1, 12.3, 12.5).

The exporter writes only the character collection, applies modifiers, keeps Y up
and exports every NLA clip as its own glTF animation. The mesh is a single
skinned mesh with the shared palette material (spec 12.5), and the palette
texture is embedded in the .glb, so `public/models/<id>.glb` is self-contained.
"""

from pathlib import Path

import bpy

from scene import character_armature, character_collection


def _select_character():
    """Select exactly the character collection and make its armature active."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in character_collection().all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = character_armature()


def export_glb(path):
    """Export the current model to `path` (.glb) and return the written file path."""
    output = Path(path).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    _select_character()
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
