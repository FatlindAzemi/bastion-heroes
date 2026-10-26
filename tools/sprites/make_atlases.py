"""Turn the raw Blender renders into pixel-art sprite atlases (issue #114).

Reads the high-resolution frame renders and the per-model metadata written by
``tools/sprites/render_sprites.py``, then for every frame:

1. picks the most opaque pixel of each 4x4 block (crisp nearest-neighbour
   downsample that keeps the real material colours, no blended edge pixels),
2. thresholds the alpha mask so the silhouette has hard pixel edges,
3. maps every colour onto the game palette (``assets-src/palette/palette.png``,
   expanded with the three spec 9.2 shading bands),
4. draws a 1px ``#1B1B2F`` outline around the silhouette,
5. packs the frames row-major into one transparent grid atlas.

It writes:

* ``public/sprites/<id>.png`` - the 15 unit atlases (all animation clips),
* ``public/sprites/props_<id>.png`` - the environment prop atlases,
* ``public/sprites/portraits/<id>.png`` - the 128x128 card portraits (a 64x64
  pixel grid nearest-upscaled 2x, same palette and outline),
* ``public/sprites/manifest.json`` - the contract consumed by the sprite
  render layer,
* ``docs/screenshots/m3b-sprites-contact-sheet.png`` - the review contact sheet.

Run it with the system Python (Pillow and numpy):

    python3 tools/sprites/make_atlases.py --cache-dir /tmp/bastion-heroes-sprites
"""

import argparse
import functools
import json
import pathlib
import sys
from collections import OrderedDict

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
PALETTE_PATH = REPO_ROOT / "assets-src" / "palette" / "palette.png"
SPRITES_DIR = REPO_ROOT / "public" / "sprites"
CONTACT_SHEET_PATH = REPO_ROOT / "docs" / "screenshots" / "m3b-sprites-contact-sheet.png"
# Spec 9.2: the toon light ramp turns every palette colour into these three
# brightness bands (linear multipliers). The sprite palette is the game palette
# expanded by them so the baked toon shading survives the reduction.
TOON_BANDS = (0.55, 0.8, 1.0)
# Spec 9.2 / 9.8 outline and UI ink colour.
OUTLINE_HEX = "#1B1B2F"
# Manifest order of clips (spec 9.6); the render of a clip is contiguous.
CLIP_ORDER = ("idle", "attack", "walk", "eat", "produce", "victory")
# The roster in the order the contact sheet groups it (see render_sprites.py).
CHARACTER_ORDER = (
    "glowshroom_monk",
    "sparkbolt_gremlin",
    "boomcap_brewer",
    "snowpup_yeti",
    "rune_archer",
    "pyro_fox",
    "iron_granny",
    "frost_witch",
    "gloomling",
    "shade_wisp",
    "bat_swarm",
    "gloom_priest",
    "gloom_ogre",
    "pothead",
    "shieldbearer",
)
PROP_ORDER = (
    "tree_round",
    "tree_pine",
    "bush",
    "rock",
    "mushroom",
    "flower_cluster",
    "grass_tuft_a",
    "grass_tuft_b",
    "grass_tuft_c",
)
# Card portraits are a 64x64 pixel grid nearest-upscaled 2x to 128x128.
PORTRAIT_GRID = 64
PORTRAIT_OUTPUT_SIZE = 128
PORTRAIT_SCALE = PORTRAIT_OUTPUT_SIZE // PORTRAIT_GRID
# Contact sheet style.
SHEET_BACKGROUND = (18, 15, 32)
SHEET_PANEL = (52, 43, 78)
SHEET_TEXT = (239, 230, 210)
SHEET_DIM_TEXT = (150, 140, 170)
SHEET_DEFENDER = (126, 217, 87)
SHEET_ENEMY = (224, 64, 251)
SHEET_PROP = (155, 231, 255)
SHEET_PORTRAIT = (255, 204, 0)
SHEET_SILHOUETTE_BACK = (239, 230, 210)
SHEET_SILHOUETTE_INK = (10, 9, 18)
# Silhouette readability size of spec 9.5.
SILHOUETTE_HEIGHT = 80
# Atlas budget of the task: max 512 px wide, 1024 px tall.
MAX_ATLAS_WIDTH = 512
MAX_ATLAS_HEIGHT = 1024
# Contact sheet layout constants.
SHEET_MARGIN = 22
LABEL_WIDTH = 190
SILHOUETTE_WIDTH = 130
FRAME_GAP = 2
CLIP_GAP = 14
ROW_GAP = 10
SECTION_GAP = 18
PROP_GAP = 26
PORTRAIT_GAP = 14


def srgb_to_linear(values):
    """Convert sRGB channels in 0..1 to the linear values Blender renders with."""
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(values):
    """Convert linear channels in 0..1 to sRGB."""
    return np.where(values <= 0.0031308, values * 12.92, 1.055 * np.power(values, 1.0 / 2.4) - 0.055)


def hex_to_rgb(hex_color):
    """Convert ``#RRGGBB`` to an (r, g, b) tuple."""
    text = hex_color.lstrip("#")
    return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))


@functools.lru_cache(maxsize=1)
def build_palette():
    """The quantisation palette: game palette colours times the toon bands + ink.

    Returns an (N, 3) int32 array. Every rendered pixel of the toon material is a
    palette swatch multiplied by one of the three linear ramp bands, so the
    expanded palette reproduces the render colours exactly and keeps the chunky
    16-bit shading.
    """
    image = Image.open(PALETTE_PATH).convert("RGB")
    if image.size != (256, 256):
        raise RuntimeError("palette.png must be 256x256, got %s" % (image.size,))
    # One sample per 16x16 swatch, flattened in the palette's index order.
    pixels = np.asarray(image, dtype=np.uint8).reshape(16, 16, 16, 16, 3)
    swatches = pixels[:, 8, :, 8, :]
    colors = swatches.reshape(-1, 3)
    linear = srgb_to_linear(colors.astype(np.float64) / 255.0)
    expanded = []
    for band in TOON_BANDS:
        encoded = linear_to_srgb(linear * band)
        expanded.append(np.clip(np.round(encoded * 255.0), 0, 255).astype(np.uint8))
    palette = np.unique(np.vstack(expanded + [colors.reshape(-1, 3)]), axis=0)
    ink = np.array([hex_to_rgb(OUTLINE_HEX)], dtype=np.uint8)
    # int32 keeps the squared-distance quantisation below from overflowing.
    return np.unique(np.vstack([palette, ink]), axis=0).astype(np.int32)


def load_font(size, bold=False):
    """A TrueType font for the contact sheet, with a bitmap fallback."""
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Verdana.ttf",
    )
    for candidate in candidates:
        if pathlib.Path(candidate).is_file():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def reduce_frame(path, frame_width, frame_height, render_scale):
    """Downsample one 4x render into a crisp, paletted, outlined RGBA frame."""
    render = Image.open(path)
    if render.mode != "RGBA":
        render = render.convert("RGBA")
    expected = (frame_width * render_scale, frame_height * render_scale)
    if render.size != expected:
        raise RuntimeError("%s is %s, expected %s" % (path, render.size, expected))
    pixels = np.asarray(render, dtype=np.uint8)
    blocks = pixels.reshape(frame_height, render_scale, frame_width, render_scale, 4)
    blocks = blocks.transpose(0, 2, 1, 3, 4).reshape(
        frame_height, frame_width, render_scale * render_scale, 4
    )
    alpha = blocks[..., 3].astype(np.int16)
    chosen = np.argmax(alpha, axis=2)
    colors = np.take_along_axis(blocks[..., :3], chosen[..., None, None], axis=2)[..., 0, :]
    colors = colors.astype(np.float32)
    chosen_alpha = np.take_along_axis(alpha, chosen[..., None], axis=2)[..., 0].astype(np.float32)
    # A pixel that only partially covers the block still stores a blended
    # colour; unpremultiply it so the pixel keeps the material colour.
    blended = (chosen_alpha > 0.0) & (chosen_alpha < 254.0)
    colors[blended] = np.clip(colors[blended] * (255.0 / chosen_alpha[blended][:, None]), 0.0, 255.0)
    opaque_votes = (alpha >= 128).sum(axis=2)
    mask = opaque_votes >= (render_scale * render_scale) // 2
    rgba = np.zeros((frame_height, frame_width, 4), dtype=np.uint8)
    rgba[..., :3] = np.round(colors).astype(np.uint8)
    rgba[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    return quantize_frame(rgba)


def quantize_frame(rgba):
    """Map every opaque pixel onto the expanded game palette, then add the outline."""
    rgb = rgba[..., :3][rgba[..., 3] > 0].astype(np.int32)
    if rgb.size:
        palette = build_palette()
        unique, inverse = np.unique(rgb, axis=0, return_inverse=True)
        distances = ((unique[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
        nearest = palette[np.argmin(distances, axis=1)].astype(np.uint8)
        rgba[..., :3][rgba[..., 3] > 0] = nearest[inverse]
    return add_outline(rgba)


def add_outline(rgba):
    """Draw a 1px #1B1B2F outline on transparent pixels touching the silhouette."""
    mask = rgba[..., 3] > 0
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    neighbours = (
        padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:]
    )
    rgba[neighbours & ~mask] = (*hex_to_rgb(OUTLINE_HEX), 255)
    return rgba


def atlas_columns(frame_width, frame_height, frame_count):
    """Columns that keep the atlas inside the 512x1024 budget."""
    columns = max(1, min(8, MAX_ATLAS_WIDTH // frame_width))
    while columns > 1:
        rows = (frame_count + columns - 1) // columns
        if columns * frame_width <= MAX_ATLAS_WIDTH and rows * frame_height <= MAX_ATLAS_HEIGHT:
            break
        columns -= 1
    return columns


def load_records(cache_dir, kind, allow_partial=False):
    """The raw render records of one kind in canonical order.

    ``kind`` is one of ``chars``, ``props`` or ``portraits``. A missing record is
    an error unless ``allow_partial`` is set, so the final build cannot silently
    ship an incomplete manifest.
    """
    order = CHARACTER_ORDER if kind != "props" else PROP_ORDER
    records = []
    for record_id in order:
        if kind == "props":
            path = cache_dir / "raw" / "props" / ("%s.json" % record_id)
        elif kind == "portraits":
            path = cache_dir / "raw" / "portraits" / ("%s.json" % record_id)
        else:
            path = cache_dir / "raw" / "chars" / record_id / "metadata.json"
        if not path.is_file():
            if allow_partial:
                continue
            raise RuntimeError("missing raw render metadata %s (render the sprites first)" % path)
        record = json.loads(path.read_text(encoding="utf-8"))
        record["_cache_dir"] = str(cache_dir)
        records.append(record)
    return records


def character_clip_groups(record):
    """The rendered frames of a character grouped by clip, in manifest order."""
    groups = []
    for clip in CLIP_ORDER:
        frames = [frame for frame in record["frames"] if frame["clip"] == clip]
        if frames:
            groups.append((clip, record["clips"][clip], frames))
    return groups


def build_character_atlas(record, out_dir, reduced_frames):
    """Pack one character's reduced frames into a transparent atlas."""
    char_id = record["id"]
    frame_width = int(record["frameWidth"])
    frame_height = int(record["frameHeight"])
    frame_count = len(record["frames"])
    columns = atlas_columns(frame_width, frame_height, frame_count)
    rows = (frame_count + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * frame_width, rows * frame_height), (0, 0, 0, 0))
    for frame in record["frames"]:
        grid_index = int(frame["gridIndex"])
        reduced = reduced_frames[frame["file"]]
        sheet.paste(Image.fromarray(reduced, mode="RGBA"), ((grid_index % columns) * frame_width, (grid_index // columns) * frame_height))
    image_path = out_dir / ("%s.png" % char_id)
    sheet.save(image_path, optimize=True, compress_level=9)
    clips = OrderedDict()
    for clip, clip_info, frames in character_clip_groups(record):
        clips[clip] = OrderedDict(
            (
                ("frames", [int(frame["gridIndex"]) for frame in frames]),
                ("fps", clip_info["fps"]),
                ("loop", bool(clip_info["loop"])),
            )
        )
    entry = OrderedDict(
        (
            ("image", "/sprites/%s.png" % char_id),
            ("frameWidth", frame_width),
            ("frameHeight", frame_height),
            ("columns", columns),
            ("worldHeight", float(record["modelHeight"])),
            ("clips", clips),
        )
    )
    return image_path, entry


def build_prop_atlas(record, out_dir):
    """Save one single-frame prop atlas (and its legacy ``prop_<id>`` alias)."""
    prop_id = record["id"]
    reduced = reduce_frame(
        pathlib.Path(record["_cache_dir"]) / "raw" / "props" / record["frame"],
        int(record["frameWidth"]),
        int(record["frameHeight"]),
        int(record["renderScale"]),
    )
    image = Image.fromarray(reduced, mode="RGBA")
    image_path = out_dir / ("props_%s.png" % prop_id)
    image.save(image_path, optimize=True, compress_level=9)
    image.save(out_dir / ("prop_%s.png" % prop_id), optimize=True, compress_level=9)
    entry = OrderedDict(
        (
            ("image", "/sprites/props_%s.png" % prop_id),
            ("frameWidth", int(record["frameWidth"])),
            ("frameHeight", int(record["frameHeight"])),
            ("columns", 1),
            ("worldHeight", float(record["modelHeight"])),
        )
    )
    return image_path, entry


def build_portrait(record, out_dir):
    """Save one 128x128 card portrait (64x64 pixel grid nearest-upscaled 2x)."""
    record_id = record["id"]
    grid = int(record["gridSize"])
    reduced = reduce_frame(
        pathlib.Path(record["_cache_dir"]) / "raw" / "portraits" / record["file"],
        grid,
        grid,
        int(record["renderScale"]),
    )
    image = Image.fromarray(reduced, mode="RGBA").resize(
        (PORTRAIT_OUTPUT_SIZE, PORTRAIT_OUTPUT_SIZE), Image.NEAREST
    )
    output_dir = out_dir / "portraits"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / ("%s.png" % record_id)
    image.save(path, optimize=True, compress_level=9)
    return path


def prune_stale_outputs(out_dir, expected_names, expected_portraits):
    """Delete generated PNGs that no longer belong to the current manifest."""
    for path in sorted(out_dir.glob("*.png")):
        if path.name not in expected_names:
            print("prune: removed stale %s" % path.name, flush=True)
            path.unlink()
    portraits_dir = out_dir / "portraits"
    if portraits_dir.is_dir():
        for path in sorted(portraits_dir.glob("*.png")):
            if path.name not in expected_portraits:
                print("prune: removed stale portraits/%s" % path.name, flush=True)
                path.unlink()


def write_manifest(characters, props, out_dir):
    """Write the sprite manifest contract consumed by the render layer."""
    manifest = OrderedDict((("version", 1), ("characters", characters), ("props", props)))
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


def reduce_record_frames(record):
    """Reduce every rendered frame of one character, keyed by its file name."""
    source = pathlib.Path(record["_cache_dir"]) / "raw" / "chars" / record["id"]
    frame_width = int(record["frameWidth"])
    frame_height = int(record["frameHeight"])
    render_scale = int(record["renderScale"])
    reduced = {}
    for frame in record["frames"]:
        reduced[frame["file"]] = reduce_frame(
            source / frame["file"], frame_width, frame_height, render_scale
        )
    return reduced


def silhouette_image(frame):
    """The spec 9.5 solid-black silhouette of one frame, nearest-scaled to 80 px."""
    image = Image.fromarray(frame, mode="RGBA")
    mask = image.getchannel("A").point(lambda value: 255 if value > 0 else 0)
    box = mask.getbbox()
    if box is None:
        return Image.new("RGBA", (1, SILHOUETTE_HEIGHT), (0, 0, 0, 0))
    mask = mask.crop(box)
    width = max(1, int(round(mask.width * SILHOUETTE_HEIGHT / float(mask.height))))
    mask = mask.resize((width, SILHOUETTE_HEIGHT), Image.NEAREST)
    silhouette = Image.new("RGBA", (width, SILHOUETTE_HEIGHT), SHEET_SILHOUETTE_BACK + (255,))
    ink = Image.new("RGBA", (width, SILHOUETTE_HEIGHT), SHEET_SILHOUETTE_INK + (255,))
    silhouette.paste(ink, (0, 0), mask)
    return silhouette


def row_height(record):
    """Height of one character row on the contact sheet."""
    return int(record["frameHeight"]) + 40


def character_strip_width(record):
    """Width of every clip frame of one character plus the group gaps."""
    width = 0
    for _, _, frames in character_clip_groups(record):
        width += len(frames) * (int(record["frameWidth"]) + FRAME_GAP) + CLIP_GAP
    return width


def split_by_faction(records):
    """The contact sheet sections: defenders first, then enemies."""
    defenders = [record for record in records if record["faction"] == "defender"]
    enemies = [record for record in records if record["faction"] != "defender"]
    return defenders, enemies


def flow_rows(entries, max_width, gap):
    """Lay entries out in rows inside ``max_width`` using their ``slotWidth``."""
    rows = []
    current = []
    position = 0
    for entry in entries:
        slot = entry.get("slotWidth", entry["width"])
        if current and position + slot > max_width:
            rows.append(current)
            current = []
            position = 0
        current.append((entry, position))
        position += slot + gap
    if current:
        rows.append(current)
    return rows


def prop_entries(props, label_font):
    """Contact sheet entries for the prop atlases, at native size."""
    entries = []
    for prop in props:
        image = Image.open(prop["path"]).convert("RGBA")
        label_width = 0
        try:
            label_width = label_font.getlength(prop["id"])
        except AttributeError:
            label_width = label_font.getsize(prop["id"])[0]
        entries.append(
            {
                "id": prop["id"],
                "path": prop["path"],
                "width": image.width,
                "height": image.height,
                "modelHeight": float(prop["modelHeight"]),
                "slotWidth": max(image.width, int(label_width) + 16),
            }
        )
    return entries


def portrait_entries(portraits):
    """Contact sheet entries for the card portraits (128x128 each)."""
    return [
        {"id": record_id, "path": path, "width": PORTRAIT_OUTPUT_SIZE, "height": PORTRAIT_OUTPUT_SIZE}
        for record_id, path in portraits
    ]


def draw_section(sheet, draw, records, title, accent, cursor_y, fonts, reduced_by_id):
    """Draw one faction block of the contact sheet and return the next y position."""
    draw.text((SHEET_MARGIN, cursor_y), "%s (%d)" % (title, len(records)), font=fonts["section"], fill=accent)
    draw.line((SHEET_MARGIN + 210, cursor_y + 10, sheet.width - SHEET_MARGIN, cursor_y + 10), fill=SHEET_PANEL, width=2)
    cursor_y += 30
    for record in records:
        cursor_y = draw_character_row(
            sheet, draw, record, reduced_by_id[record["id"]], accent, cursor_y, fonts
        )
    return cursor_y + SECTION_GAP


def draw_character_row(sheet, draw, record, reduced, accent, cursor_y, fonts):
    """Draw one character: id, its clip frames and the 80 px silhouette."""
    frame_width = int(record["frameWidth"])
    frame_height = int(record["frameHeight"])
    draw.text((SHEET_MARGIN, cursor_y + 2), record["id"], font=fonts["label"], fill=SHEET_TEXT)
    draw.text(
        (SHEET_MARGIN, cursor_y + 22),
        "%dx%d px, h %.2f, %s" % (frame_width, frame_height, float(record["modelHeight"]), record["faction"]),
        font=fonts["small"],
        fill=accent,
    )
    cursor_x = SHEET_MARGIN + LABEL_WIDTH
    for clip, clip_info, frames in character_clip_groups(record):
        draw.text((cursor_x, cursor_y), "%s %sfps" % (clip, clip_info["fps"]), font=fonts["small"], fill=SHEET_DIM_TEXT)
        for frame in frames:
            frame_image = Image.fromarray(reduced[frame["file"]], mode="RGBA")
            sheet.alpha_composite(frame_image, (cursor_x, cursor_y + 16))
            draw.rectangle(
                (cursor_x, cursor_y + 16, cursor_x + frame_width - 1, cursor_y + 16 + frame_height - 1),
                outline=SHEET_PANEL,
            )
            cursor_x += frame_width + FRAME_GAP
        cursor_x += CLIP_GAP
    silhouette = silhouette_image(reduced[record["frames"][0]["file"]])
    silhouette_x = sheet.width - SHEET_MARGIN - silhouette.width
    sheet.alpha_composite(silhouette, (silhouette_x, cursor_y + 16 + max(0, frame_height - SILHOUETTE_HEIGHT)))
    draw.text((silhouette_x, cursor_y), "silhouette 80px", font=fonts["small"], fill=SHEET_DIM_TEXT)
    return cursor_y + row_height(record) + ROW_GAP


def draw_flow_section(sheet, draw, title, accent, rows, cursor_y, fonts):
    """Draw a wrapped flow section (props or portraits) and return the next y."""
    draw.text((SHEET_MARGIN, cursor_y), title, font=fonts["section"], fill=accent)
    draw.line((SHEET_MARGIN + 300, cursor_y + 10, sheet.width - SHEET_MARGIN, cursor_y + 10), fill=SHEET_PANEL, width=2)
    cursor_y += 30
    for row in rows:
        tallest = max(entry["height"] for entry, _ in row)
        for entry, position in row:
            image = Image.open(entry["path"]).convert("RGBA")
            sheet.alpha_composite(image, (SHEET_MARGIN + position, cursor_y + 16))
            draw.text((SHEET_MARGIN + position, cursor_y), entry["id"], font=fonts["label"], fill=accent)
            detail = "%dx%d px" % (entry["width"], entry["height"])
            if "modelHeight" in entry:
                detail += ", h %.2f" % entry["modelHeight"]
            draw.text(
                (SHEET_MARGIN + position, cursor_y + 16 + tallest + 2),
                detail,
                font=fonts["small"],
                fill=SHEET_DIM_TEXT,
            )
        cursor_y += tallest + 46
    return cursor_y + SECTION_GAP


def render_contact_sheet(records, props, portraits, reduced_by_id, out_path):
    """Compose the review contact sheet: clip frames, silhouettes, props, portraits."""
    fonts = {
        "title": load_font(22, bold=True),
        "section": load_font(17, bold=True),
        "label": load_font(14, bold=True),
        "small": load_font(11),
    }
    width = SHEET_MARGIN * 2 + LABEL_WIDTH + max(
        character_strip_width(record) for record in records
    ) + SILHOUETTE_WIDTH
    inner_width = width - 2 * SHEET_MARGIN
    prop_rows = flow_rows(prop_entries(props, fonts["label"]), inner_width, PROP_GAP)
    portrait_rows = flow_rows(portrait_entries(portraits), inner_width, PORTRAIT_GAP)
    height = 84
    for section in split_by_faction(records):
        height += 30 + sum(row_height(record) + ROW_GAP for record in section) + SECTION_GAP
    height += 30 + sum(max(entry["height"] for entry, _ in row) + 46 for row in prop_rows) + SECTION_GAP
    height += 30 + sum(PORTRAIT_OUTPUT_SIZE + 46 for _ in portrait_rows) + SECTION_GAP
    height += 60
    sheet = Image.new("RGBA", (width, height), SHEET_BACKGROUND + (255,))
    draw = ImageDraw.Draw(sheet)
    draw.text((SHEET_MARGIN, 16), "Bastion Heroes - pixel-art sprite atlases (issue #114)", font=fonts["title"], fill=SHEET_TEXT)
    draw.text(
        (SHEET_MARGIN, 44),
        "Units: orthographic -x side / 45 deg elevation camera (defenders face +x, enemies rotated 180 deg). "
        "Props: same pipeline. Portraits: 64x64 pixel grid upscaled 2x to 128x128.",
        font=fonts["small"],
        fill=SHEET_DIM_TEXT,
    )
    defenders, enemies = split_by_faction(records)
    cursor_y = draw_section(sheet, draw, defenders, "DEFENDERS", SHEET_DEFENDER, 78, fonts, reduced_by_id)
    cursor_y = draw_section(sheet, draw, enemies, "ENEMIES", SHEET_ENEMY, cursor_y, fonts, reduced_by_id)
    prop_count = sum(len(row) for row in prop_rows)
    cursor_y = draw_flow_section(
        sheet, draw, "ENVIRONMENT PROPS (%d)" % prop_count, SHEET_PROP, prop_rows, cursor_y, fonts
    )
    portrait_count = sum(len(row) for row in portrait_rows)
    cursor_y = draw_flow_section(
        sheet,
        draw,
        "CARD PORTRAITS (%d x %dx%d)" % (portrait_count, PORTRAIT_OUTPUT_SIZE, PORTRAIT_OUTPUT_SIZE),
        SHEET_PORTRAIT,
        portrait_rows,
        cursor_y,
        fonts,
    )
    draw.text(
        (SHEET_MARGIN, cursor_y + 8),
        "Frame order: idle, attack, walk, eat, produce, victory (clips missing in a GLB are omitted). "
        "1px #1B1B2F outline, game palette only. Character silhouette column: solid 80 px tall (spec 9.5).",
        font=fonts["small"],
        fill=SHEET_DIM_TEXT,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(out_path, optimize=True, compress_level=9)
    return out_path


def main():
    """Build every atlas, the portraits, the manifest and the contact sheet."""
    parser = argparse.ArgumentParser(description="Build the Bastion Heroes pixel-art sprite atlases.")
    parser.add_argument("--cache-dir", required=True, help="raw render cache written by render_sprites.py")
    parser.add_argument("--out-dir", default=str(SPRITES_DIR), help="output directory for the atlases")
    parser.add_argument("--contact-sheet", default=str(CONTACT_SHEET_PATH), help="contact sheet PNG path")
    parser.add_argument("--no-contact-sheet", action="store_true", help="skip the review contact sheet")
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="build from whatever has been rendered so far (used for the single-unit pipeline proof)",
    )
    arguments = parser.parse_args()
    cache_dir = pathlib.Path(arguments.cache_dir).resolve()
    out_dir = pathlib.Path(arguments.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    records = load_records(cache_dir, "chars", arguments.allow_partial)
    if not records:
        raise RuntimeError("no character render found in %s" % cache_dir)
    characters = OrderedDict()
    reduced_by_id = {}
    total_bytes = 0
    for record in records:
        reduced = reduce_record_frames(record)
        reduced_by_id[record["id"]] = reduced
        image_path, entry = build_character_atlas(record, out_dir, reduced)
        characters[record["id"]] = entry
        total_bytes += image_path.stat().st_size
        atlas_width = entry["columns"] * entry["frameWidth"]
        atlas_height = ((len(record["frames"]) + entry["columns"] - 1) // entry["columns"]) * entry["frameHeight"]
        print(
            "atlas: %-18s %3dx%-4d %3dx%-3d px  %6d bytes"
            % (record["id"], atlas_width, atlas_height, entry["frameWidth"], entry["frameHeight"], image_path.stat().st_size),
            flush=True,
        )
    prop_records = load_records(cache_dir, "props", arguments.allow_partial)
    props = OrderedDict()
    prop_list = []
    for record in prop_records:
        image_path, entry = build_prop_atlas(record, out_dir)
        props[record["id"]] = entry
        total_bytes += image_path.stat().st_size
        prop_list.append({"id": record["id"], "modelHeight": record["modelHeight"], "path": image_path})
        print(
            "prop:  %-18s %3dx%-3d px  %6d bytes"
            % (record["id"], entry["frameWidth"], entry["frameHeight"], image_path.stat().st_size),
            flush=True,
        )
    portrait_records = load_records(cache_dir, "portraits", arguments.allow_partial)
    portraits = []
    for record in portrait_records:
        path = build_portrait(record, out_dir)
        total_bytes += path.stat().st_size
        portraits.append((record["id"], path))
        print(
            "portrait: %-16s %dx%d px  %6d bytes"
            % (record["id"], PORTRAIT_OUTPUT_SIZE, PORTRAIT_OUTPUT_SIZE, path.stat().st_size),
            flush=True,
        )
    expected_names = set(name for name in characters) | set(
        "props_%s.png" % prop_id for prop_id in props
    ) | set("prop_%s.png" % prop_id for prop_id in props)
    expected_names |= set("%s.png" % char_id for char_id in characters)
    prune_stale_outputs(out_dir, expected_names, set("%s.png" % record["id"] for record in portrait_records))
    manifest_path = write_manifest(characters, props, out_dir)
    total_bytes += manifest_path.stat().st_size
    print("manifest: %s" % manifest_path, flush=True)
    if not arguments.no_contact_sheet:
        sheet_path = render_contact_sheet(
            records, prop_list, portraits, reduced_by_id, pathlib.Path(arguments.contact_sheet)
        )
        total_bytes += sheet_path.stat().st_size
        print("contact sheet: %s (%d bytes)" % (sheet_path, sheet_path.stat().st_size), flush=True)
    print("total new asset weight: %.2f MB" % (total_bytes / (1024.0 * 1024.0)), flush=True)


if __name__ == "__main__":
    sys.exit(main())
