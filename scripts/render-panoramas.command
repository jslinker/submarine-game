#!/usr/bin/env python3
"""Double-click on macOS, or run npm run render. Settings: ../render-config.json."""

import argparse
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blend", help="Override the configured .blend file.")
    parser.add_argument("--width", type=int, help="Override panorama width; height is half.")
    parser.add_argument("--samples", type=int, help="Override Cycles samples.")
    parser.add_argument("--device", choices=("CPU", "GPU"))
    parser.add_argument("--blender", help="Path to the Blender executable.")
    parser.add_argument("--print-command", action="store_true", help="Show the command without starting Blender or writing anything.")
    parser.add_argument("--no-build", action="store_true", help="Render only; skip game build validation.")
    args = parser.parse_args()
    config = json.loads((ROOT / "render-config.json").read_text())

    def resolve(value):
        path = Path(value).expanduser()
        return path if path.is_absolute() else ROOT / path

    blend = resolve(args.blend or config["blend_file"])
    if not blend.is_file() or blend.suffix.lower() != ".blend":
        parser.error(f"Blender file not found: {blend}. Set blend_file in render-config.json or use --blend.")
    blender = args.blender or config.get("blender") or shutil.which("blender")
    if not blender:
        mac_app = Path("/Applications/Blender.app/Contents/MacOS/blender")
        if mac_app.is_file():
            blender = str(mac_app)
    if not blender or not Path(blender).is_file():
        parser.error("Blender was not found. Supply --blender or set blender in render-config.json.")
    width = args.width if args.width is not None else config.get("width", 2048)
    samples = args.samples if args.samples is not None else config.get("samples", 8)
    device = args.device or config.get("device", "CPU")
    if not isinstance(width, int) or width <= 0 or width % 2:
        parser.error("width must be a positive even integer")
    if not isinstance(samples, int) or samples <= 0 or device not in ("CPU", "GPU"):
        parser.error("samples must be positive, and device must be CPU or GPU")
    command = [str(blender), "--background", "--disable-autoexec", str(blend),
               "--python-exit-code", "1", "--python", str(ROOT / "scripts/render_panoramas.py"), "--",
               "--output", str(ROOT / "panoramas"),
               "--width", str(width), "--samples", str(samples), "--device", device, "--overwrite"]
    if config.get("camera_map"):
        mapping = resolve(config["camera_map"])
        if not mapping.is_file():
            parser.error(f"Camera mapping file not found: {mapping}")
        command.extend(["--camera-map", str(mapping)])
    print(shlex.join(command), flush=True)
    if args.print_command:
        return
    subprocess.run(command, cwd=ROOT, check=True)
    if not args.no_build:
        node = shutil.which("node")
        if not node:
            raise RuntimeError("Rendering finished. Install Node.js 22+ and run npm run build to validate the map.")
        subprocess.run([node, "scripts/build.mjs"], cwd=ROOT, check=True)
    print("\nPanoramas are ready. Run npm run dev and open http://127.0.0.1:5173/", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"\nExport stopped: {error}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nExport canceled. The source Blender file was not saved.", file=sys.stderr)
        sys.exit(130)
