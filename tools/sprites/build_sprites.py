#!/usr/bin/env python3
"""One-command build of the Bastion Heroes pixel-art sprite atlases (issue #114).

Runs the three pipeline stages in order:

1. ``assets-src/blender/sprites/props.py`` builds the six environment prop GLBs,
2. ``tools/sprites/render_sprites.py`` renders every character and prop frame
   from the portrait game camera into the build cache,
3. ``tools/sprites/make_atlases.py`` downsamples, palettes, outlines and packs
   the frames into ``public/sprites/`` plus ``public/sprites/manifest.json`` and
   the review contact sheet.

The build cache defaults to ``<temp>/bastion-heroes-sprites`` and is never
committed; a rerun is deterministic and needs no other setup than Blender and
the system Python with Pillow and numpy.

    python3 tools/sprites/build_sprites.py                 # full build
    python3 tools/sprites/build_sprites.py --only gloomling  # one unit (pipeline proof)
    python3 tools/sprites/build_sprites.py --skip-render     # repack the cached renders
"""

import argparse
import os
import pathlib
import subprocess
import sys
import tempfile

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BLENDER_LIB_DIR = REPO_ROOT / "assets-src" / "blender" / "lib"
for path in (BLENDER_LIB_DIR,):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

DEFAULT_CACHE_DIR = pathlib.Path(tempfile.gettempdir()) / "bastion-heroes-sprites"
PROPS_SCRIPT = REPO_ROOT / "assets-src" / "blender" / "sprites" / "props.py"
RENDER_SCRIPT = REPO_ROOT / "tools" / "sprites" / "render_sprites.py"
ATLAS_SCRIPT = REPO_ROOT / "tools" / "sprites" / "make_atlases.py"


def blender_path():
    """The Blender executable: ``$BLENDER_PATH`` first, then the Homebrew install."""
    candidate = os.environ.get("BLENDER_PATH") or "/opt/homebrew/bin/blender"
    path = pathlib.Path(candidate)
    if not path.is_file():
        raise SystemExit(
            "Blender is missing at %s (set BLENDER_PATH to the Blender executable)" % path
        )
    return path


def run(command, description):
    """Run one pipeline command, streaming its output, and fail on a non-zero exit."""
    print("build: %s" % description, flush=True)
    print("build: $ %s" % " ".join(str(part) for part in command), flush=True)
    completed = subprocess.run([str(part) for part in command], cwd=str(REPO_ROOT))
    if completed.returncode != 0:
        raise SystemExit("build: stage failed (%s), exit code %d" % (description, completed.returncode))


def run_blender(script, arguments):
    """Run a Blender script headless with the mandatory --python-exit-code 1."""
    run(
        [blender_path(), "-b", "--factory-startup", "--python-exit-code", "1", "-P", script, "--"]
        + [str(argument) for argument in arguments],
        "Blender %s" % pathlib.Path(script).name,
    )


def parse_arguments():
    """Command line options of the build."""
    parser = argparse.ArgumentParser(description="Build the Bastion Heroes pixel-art sprite atlases.")
    parser.add_argument("--only", help="comma separated character ids to render (default: all 15)")
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR), help="raw render build cache")
    parser.add_argument("--skip-props", action="store_true", help="skip the environment prop atlases")
    parser.add_argument("--skip-portraits", action="store_true", help="skip the card portrait renders")
    parser.add_argument("--skip-render", action="store_true", help="repack the existing build cache")
    parser.add_argument("--skip-atlas", action="store_true", help="stop after the Blender renders")
    parser.add_argument("--no-contact-sheet", action="store_true", help="skip the review contact sheet")
    return parser.parse_args()


def main():
    """Run the requested pipeline stages."""
    arguments = parse_arguments()
    cache_dir = pathlib.Path(arguments.cache_dir).expanduser().resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)
    props_dir = cache_dir / "props"
    if not arguments.skip_props and not arguments.skip_render:
        run_blender(PROPS_SCRIPT, ["--out-dir", props_dir])
    if not arguments.skip_render:
        render_arguments = ["--cache-dir", cache_dir]
        if arguments.only:
            render_arguments += ["--only", arguments.only]
        if not arguments.skip_props:
            render_arguments += ["--props-dir", props_dir]
        if not arguments.skip_portraits:
            render_arguments += ["--portraits"]
        run_blender(RENDER_SCRIPT, render_arguments)
    if arguments.skip_atlas:
        print("build: renders done, atlases skipped", flush=True)
        return
    atlas_arguments = [sys.executable, ATLAS_SCRIPT, "--cache-dir", cache_dir]
    if arguments.only or arguments.skip_props or arguments.skip_portraits:
        atlas_arguments.append("--allow-partial")
    if arguments.no_contact_sheet:
        atlas_arguments.append("--no-contact-sheet")
    run(atlas_arguments, "atlas packing")
    print("build: done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
