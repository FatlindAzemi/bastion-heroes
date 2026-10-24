"""Build the shared 256x256 palette texture that every Bastion Heroes model samples.

Spec 9.3: one 256x256 PNG of 16x16 flat colour swatches (256 colours); models are
UV-mapped so each face samples the centre of one swatch. Spec 9.4 defines the
colour table. Spec 10.2: this script runs on Blender's bundled Python only, never
on a system Python. Spec 12.11 lists the generated assets.

Run it headless through Blender (spec 12.2), e.g. through `npm run assets`:

    "$BLENDER_PATH" -b --factory-startup --python-exit-code 1 \
        -P tools/palette/make_palette.py -- --out assets-src/palette/palette.png

Layout convention (also documented in assets-src/palette/README.md):

- `index = row * 16 + col`, and **row 0 is the bottom image row** because Blender
  images and OpenGL UVs put the v origin at the bottom. Swatch `index` covers
  pixels x = col*16 .. col*16+15 and y = row*16 .. row*16+15.
- The 256 swatches are 32 material ramps of 8 shades: `ramp = index // 8` and
  `slot = index % 8`, so ramp `r` occupies row `r // 2`, half `r % 2`.
- Slot 0 is the darkest shade, slot 7 the lightest. The exact spec hex (the
  "anchor") sits on slot 3, or on slot 0 / slot 7 for anchors that are already
  very dark / very bright. Other slots mix the anchor towards ink `#1B1B2F`
  (darker slots, up to 85%) or white (lighter slots, up to 80%).
- The anchors of spec 9.4 are reproduced byte-exactly; the extra neutral and
  utility ramps (greys, skin, metal, wood, bone, ink, warm white) give character
  scripts usable shades for props, skin and outlines.

The script fails loudly (non-zero Blender exit through `--python-exit-code`) if
the image is not 256x256, if the 256 swatches are not distinct, if a spec 9.4
anchor is off by one byte, if the saved file does not read back with the exact
same 16x16 blocks, or if the README table no longer matches the generated map.
"""

import sys
from pathlib import Path

import bpy

# Spec 9.3: 256x256 image, 16x16 swatches.
SIZE = 256
SWATCH = 16
GRID = SIZE // SWATCH
# 32 ramps x 8 shades = 256 swatches.
RAMP_LEN = 8
# The shade ramps darken towards the outline colour (spec 9.2) and lighten to white.
DARK_POLE = (0x1B, 0x1B, 0x2F)
LIGHT_POLE = (0xFF, 0xFF, 0xFF)
DARK_MIX = 0.85
LIGHT_MIX = 0.80
# Anchors at or above this lightness sit at the bottom of their ramp, very bright
# anchors at the top; everything else keeps its anchor on slot 3.
DARK_ANCHOR_LIGHTNESS = 0.20
LIGHT_ANCHOR_LIGHTNESS = 0.90

# One ramp per material family: (name, exact anchor hex). Spec 9.4 anchors first,
# then the neutral and utility ramps that characters need for props and skin.
RAMPS = (
    ("forge_copper", "#C8743A"),
    ("forge_orange", "#FF8A2B"),
    ("forge_steel", "#8A9BA8"),
    ("wildgrove_leaf", "#5FBF4A"),
    ("wildgrove_mushroom", "#E5483B"),
    ("wildgrove_moss", "#2E7D32"),
    ("neon_cyan", "#22D3EE"),
    ("neon_magenta", "#E040FB"),
    ("neon_violet", "#7C4DFF"),
    ("frost_ice", "#9BE7FF"),
    ("frost_snow", "#F4FBFF"),
    ("frost_deep", "#2F6FDB"),
    ("hollow_bone", "#EFE6D2"),
    ("hollow_royal", "#6A3FA0"),
    ("hollow_soul", "#7CFF6B"),
    ("gloom_shadow", "#2B1B3D"),
    ("gloom_dusk", "#4A2F66"),
    ("gloom_eye_cyan", "#3CF2FF"),
    ("gloom_eye_lime", "#A8FF3C"),
    ("essence_teal", "#3BF0C8"),
    ("essence_core", "#FFFFFF"),
    ("world1_grass_light", "#7ED957"),
    ("world1_grass_dark", "#6CC644"),
    ("world1_path", "#D9A066"),
    ("world1_sky", "#9FD8FF"),
    ("neutral_grey", "#8C8C8C"),
    ("skin", "#F2C49B"),
    ("metal", "#A8B4C0"),
    ("wood", "#8B5A2B"),
    ("bone", "#E3D5B8"),
    ("ink", "#1B1B2F"),
    ("warm_white", "#FFF2D9"),
)

# Every colour of spec 9.4 must be an exact anchor. The essence "white core" has no
# hex in the spec, so it is pure white, and it is checked here together with the rest.
SPEC_9_4_ANCHORS = (
    "#C8743A", "#FF8A2B", "#8A9BA8",  # Forge Clan
    "#5FBF4A", "#E5483B", "#2E7D32",  # Wildgrove
    "#22D3EE", "#E040FB", "#7C4DFF",  # Neon Arcana
    "#9BE7FF", "#F4FBFF", "#2F6FDB",  # Frostborn
    "#EFE6D2", "#6A3FA0", "#7CFF6B",  # Hollow Court
    "#2B1B3D", "#4A2F66", "#3CF2FF", "#A8FF3C",  # The Gloom
    "#3BF0C8", "#FFFFFF",             # Essence (white core)
    "#7ED957", "#6CC644",             # World 1 grass checkerboard
    "#D9A066", "#9FD8FF",             # World 1 path and sky
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "assets-src" / "palette" / "palette.png"
README = REPO_ROOT / "assets-src" / "palette" / "README.md"


def hex_to_rgb(value):
    """Turn "#RRGGBB" into an (r, g, b) tuple of bytes."""
    text = value.lstrip("#")
    if len(text) != 6:
        raise ValueError("palette: expected #RRGGBB, got %r" % value)
    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


def rgb_to_hex(rgb):
    """Turn an (r, g, b) tuple of bytes into "#RRGGBB" in upper case."""
    return "#%02X%02X%02X" % rgb


def lightness(rgb):
    """HSL lightness of an RGB byte triple, 0.0 to 1.0."""
    return (max(rgb) + min(rgb)) / (2.0 * 255.0)


def mix(start, end, amount):
    """Linearly interpolate two RGB byte triples; amount 0 keeps start, 1 end."""
    return tuple(int(round(start[channel] + (end[channel] - start[channel]) * amount)) for channel in range(3))


def anchor_slot(rgb):
    """Slot that carries the exact anchor hex: bottom, top or middle of the ramp."""
    if lightness(rgb) <= DARK_ANCHOR_LIGHTNESS:
        return 0
    if lightness(rgb) >= LIGHT_ANCHOR_LIGHTNESS:
        return RAMP_LEN - 1
    return 3


def unique_shade(rgb, used):
    """Nudge a duplicate shade by +-1, +-2, ... on all channels until it is unique."""
    for step in range(1, 64):
        for delta in (step, -step):
            candidate = tuple(min(255, max(0, channel + delta)) for channel in rgb)
            if candidate not in used:
                return candidate
    raise RuntimeError("palette self-check failed: cannot make shade %r unique" % (rgb,))


def build_swatches():
    """Return the 256 swatches in index order, as dicts with ramp, slot and colours."""
    anchors = [hex_to_rgb(anchor) for _, anchor in RAMPS]
    if len(set(anchors)) != len(anchors):
        raise RuntimeError("palette self-check failed: two ramps share the same anchor")
    used = set(anchors)
    swatches = []
    for ramp_index, (name, anchor_hex) in enumerate(RAMPS):
        anchor_rgb = hex_to_rgb(anchor_hex)
        slot_of_anchor = anchor_slot(anchor_rgb)
        for slot in range(RAMP_LEN):
            if slot == slot_of_anchor:
                rgb = anchor_rgb
                hex_value = anchor_hex
            elif slot < slot_of_anchor:
                amount = (slot_of_anchor - slot) / slot_of_anchor * DARK_MIX
                rgb = unique_shade(mix(anchor_rgb, DARK_POLE, amount), used)
                hex_value = rgb_to_hex(rgb)
                used.add(rgb)
            else:
                amount = (slot - slot_of_anchor) / (RAMP_LEN - 1 - slot_of_anchor) * LIGHT_MIX
                rgb = unique_shade(mix(anchor_rgb, LIGHT_POLE, amount), used)
                hex_value = rgb_to_hex(rgb)
                used.add(rgb)
            swatches.append(
                {
                    "index": ramp_index * RAMP_LEN + slot,
                    "ramp": ramp_index,
                    "ramp_name": name,
                    "slot": slot,
                    "anchor_slot": slot_of_anchor,
                    "hex": hex_value,
                    "rgb": rgb,
                }
            )
    return swatches


def write_image(swatches, out):
    """Write the swatches into a 256x256 sRGB image and save it as PNG (spec 9.3)."""
    image = bpy.data.images.new("palette", width=SIZE, height=SIZE, alpha=False)
    image.colorspace_settings.name = "sRGB"
    pixels = []
    for row in range(GRID):
        row_pixels = []
        for col in range(GRID):
            red, green, blue = swatches[row * GRID + col]["rgb"]
            row_pixels.extend([red / 255.0, green / 255.0, blue / 255.0, 1.0] * SWATCH)
        pixels.extend(row_pixels * SWATCH)
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(out)
    image.file_format = "PNG"
    image.save()
    return image


def check_swatch_table(swatches):
    """Check the in-memory table before touching the image: size, uniqueness, anchors."""
    if len(swatches) != SIZE:
        raise RuntimeError("palette self-check failed: %d swatches, expected %d" % (len(swatches), SIZE))
    hex_values = [swatch["hex"] for swatch in swatches]
    if len(set(hex_values)) != SIZE:
        raise RuntimeError("palette self-check failed: %d distinct swatches, expected %d" % (len(set(hex_values)), SIZE))
    for anchor in SPEC_9_4_ANCHORS:
        if anchor not in hex_values:
            raise RuntimeError("palette self-check failed: spec 9.4 anchor %s is missing" % anchor)
        expected_index = next(swatch["index"] for swatch in swatches if swatch["hex"] == anchor)
        ramp_name = swatches[expected_index]["ramp_name"]
        swatch_at_index = swatches[expected_index]
        if swatch_at_index["slot"] != swatch_at_index["anchor_slot"]:
            raise RuntimeError("palette self-check failed: anchor %s of ramp %s is not on its anchor slot" % (anchor, ramp_name))


def check_saved_image(swatches, out):
    """Re-open the saved PNG and prove every 16x16 block holds its exact swatch colour."""
    if not out.is_file():
        raise RuntimeError("palette self-check failed: %s was not written" % out)
    image = bpy.data.images.load(str(out), check_existing=False)
    if tuple(image.size) != (SIZE, SIZE):
        raise RuntimeError("palette self-check failed: image is %r, expected %dx%d" % (tuple(image.size), SIZE, SIZE))
    buffer = [0.0] * (SIZE * SIZE * 4)
    image.pixels.foreach_get(buffer)
    for swatch in swatches:
        index = swatch["index"]
        row, col = divmod(index, GRID)
        offset = ((row * SWATCH) * SIZE + col * SWATCH) * 4
        for y in range(SWATCH):
            for x in range(SWATCH):
                pixel = offset + (y * SIZE + x) * 4
                for channel in range(3):
                    actual = buffer[pixel + channel] * 255.0
                    if abs(actual - swatch["rgb"][channel]) > 0.5:
                        raise RuntimeError(
                            "palette self-check failed: swatch %d (%s) pixel (%d, %d) is %r, expected %r"
                            % (index, swatch["hex"], col * SWATCH + x, row * SWATCH + y, round(actual), swatch["rgb"][channel])
                        )


def map_rows(swatches):
    """The README table rows: ramp, index range, anchor slot and the 8 exact hexes."""
    rows = []
    for ramp_index, (name, _) in enumerate(RAMPS):
        ramp_swatches = swatches[ramp_index * RAMP_LEN : (ramp_index + 1) * RAMP_LEN]
        anchor_slot_of_ramp = ramp_swatches[0]["anchor_slot"]
        rows.append(
            [
                str(ramp_index),
                name,
                "%d-%d" % (ramp_index * RAMP_LEN, (ramp_index + 1) * RAMP_LEN - 1),
                str(anchor_slot_of_ramp),
            ]
            + [swatch["hex"] for swatch in ramp_swatches]
        )
    return rows


def print_map(swatches):
    """Print the README table (paste target when the ramps change)."""
    print("| # | Ramp | Indices | Anchor | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for row in map_rows(swatches):
        print("| " + " | ".join(row) + " |")


def check_readme(swatches):
    """Fail when the README index -> hex table drifts from the generated palette."""
    if not README.is_file():
        raise RuntimeError("palette self-check failed: %s is missing" % README)
    rows = []
    for line in README.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) == 2 + RAMP_LEN + 2 and cells[0].isdigit():
            rows.append(cells)
    expected = map_rows(swatches)
    if rows != expected:
        for position, (actual, wanted) in enumerate(zip(rows, expected)):
            if actual != wanted:
                raise RuntimeError(
                    "palette self-check failed: README ramp row %d is %r, expected %r (run with --print-map and update the table)"
                    % (position, actual, wanted)
                )
        raise RuntimeError(
            "palette self-check failed: README has %d ramp rows, expected %d (run with --print-map and update the table)"
            % (len(rows), len(expected))
        )


def parse_out(argv):
    """Read `--out <path>` from the arguments Blender passes after `--`."""
    if "--out" in argv:
        position = argv.index("--out")
        if position + 1 < len(argv):
            return Path(argv[position + 1]).resolve()
    return DEFAULT_OUT


def main():
    """Build, save and verify the palette; print the map when --print-map is given."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    swatches = build_swatches()
    if "--print-map" in argv:
        print_map(swatches)
        return
    out = parse_out(argv)
    check_swatch_table(swatches)
    write_image(swatches, out)
    check_readme(swatches)
    check_saved_image(swatches, out)
    print(
        "palette: ok - %dx%d, %d swatches, %d ramps, %d distinct colours, %d spec 9.4 anchors exact"
        % (SIZE, SIZE, len(swatches), len(RAMPS), len({swatch["hex"] for swatch in swatches}), len(SPEC_9_4_ANCHORS))
    )
    print("palette: wrote %s" % out)


if __name__ == "__main__":
    main()
