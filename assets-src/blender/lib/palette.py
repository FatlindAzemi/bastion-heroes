"""The single shared palette material every model samples (spec 9.3, 9.4, 12.3).

`assets-src/palette/palette.png` is a 256x256 image of 16x16 flat swatches. A face
that should use swatch `index` puts all of its UV loops on the swatch centre
(assets-src/palette/README.md), so the texture needs no filtering tricks beyond a
nearest-neighbour sampler.

The glTF exporter flips V for glTF's top-left UV origin (spec 12.5, README), so
the same swatch index is addressed in Blender and after export.
"""

from pathlib import Path

import bpy

# Spec 9.3: 256x256 image, 16 swatches per side.
GRID = 16
SWATCH_COUNT = GRID * GRID
MATERIAL_NAME = "palette"
IMAGE_NAME = "palette"
# assets-src/blender/lib/palette.py -> repository root.
REPO_ROOT = Path(__file__).resolve().parents[3]
PALETTE_PATH = REPO_ROOT / "assets-src" / "palette" / "palette.png"


def swatch(index):
    """The centre UV of palette swatch `index` (0-255), as (u, v)."""
    index = int(index)
    if not 0 <= index < SWATCH_COUNT:
        raise ValueError("palette index must be 0-%d, got %r" % (SWATCH_COUNT - 1, index))
    column = index % GRID
    row = index // GRID
    return ((column + 0.5) / GRID, (row + 0.5) / GRID)


def palette_image():
    """Load (once) and pack the shared palette image so exports embed it (spec 12.6)."""
    image = bpy.data.images.get(IMAGE_NAME)
    if image is not None:
        return image
    if not PALETTE_PATH.is_file():
        raise RuntimeError("palette texture is missing: %s (run npm run assets)" % PALETTE_PATH)
    image = bpy.data.images.load(str(PALETTE_PATH), check_existing=True)
    image.name = IMAGE_NAME
    image.colorspace_settings.name = "sRGB"
    # Packing keeps the material independent of the source path and makes the glTF
    # exporter embed the texture in the .glb instead of writing an external file.
    image.pack()
    return image


def palette_material():
    """The one shared material of every model (spec 12.5), created on first use."""
    material = bpy.data.materials.get(MATERIAL_NAME)
    if material is not None:
        return material
    image = palette_image()
    material = bpy.data.materials.new(MATERIAL_NAME)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "palette_texture"
    texture.image = image
    # Nearest sampling: a swatch centre never bleeds into a neighbouring swatch.
    texture.interpolation = "Closest"
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    return material


def assign_swatch(obj, index):
    """Give `obj` the shared palette material and map every face UV to one swatch."""
    if obj.type != "MESH":
        raise RuntimeError("assign_swatch expects a mesh, got %s (%s)" % (obj.name, obj.type))
    mesh = obj.data
    material = palette_material()
    if len(mesh.materials) == 0:
        mesh.materials.append(material)
    else:
        mesh.materials[0] = material
    for polygon in mesh.polygons:
        polygon.material_index = 0
    texture_coordinates = mesh.uv_layers.active
    if texture_coordinates is None:
        texture_coordinates = mesh.uv_layers.new(name="UVMap")
    u, v = swatch(index)
    for loop_uv in texture_coordinates.data:
        loop_uv.uv = (u, v)
    return obj
