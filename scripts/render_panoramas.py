"""Run with Blender's --python option; see docs/panorama-rendering.md."""

import argparse
import json
import math
import os
from pathlib import Path
import re
import sys


SLUG = re.compile(r"[a-z][a-z0-9]*(?:_[a-z0-9]+)*\Z")


def identifier(value):
    if not isinstance(value, str) or not SLUG.fullmatch(value):
        raise ValueError(f"Invalid ID {value!r}; use lowercase letters, digits and single underscores.")
    return value


def plan_cameras(cameras, mapping=None, state=None):
    """Validate every output before starting any expensive rendering."""
    if state is not None:
        identifier(state)
        if state == "default":
            raise ValueError("Omit --state for the default appearance.")
    if mapping is not None:
        if not isinstance(mapping, dict) or not mapping:
            raise ValueError("The camera map must be a nonempty JSON object: camera name -> location ID.")
        unknown = set(mapping) - set(cameras)
        if unknown:
            raise ValueError(f"Mapped cameras are absent from this scene: {sorted(unknown)}")
    names = mapping if mapping is not None else cameras
    plan, seen = [], set()
    for name in sorted(names):
        location_id = identifier(mapping[name] if mapping is not None else name)
        if location_id in seen:
            raise ValueError(f"More than one camera maps to {location_id!r}.")
        seen.add(location_id)
        stem = location_id + (f"__{state}" if state else "")
        plan.append((name, location_id, f"{stem}.jpg"))
    if not plan:
        raise ValueError("No cameras found in this scene.")
    return plan


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="Output directory; required unless using --list.")
    parser.add_argument("--camera-map", help="Optional JSON camera-name -> location-ID mapping; selects only those cameras.")
    parser.add_argument("--scene", help="Scene to export; defaults to the active scene.")
    parser.add_argument("--view-layer", help="Render a specific view layer, for example an item-removal variant.")
    parser.add_argument("--state", help="Appearance suffix, for example no_book. Omit for the default.")
    parser.add_argument("--width", type=positive_int, default=4096, help="Even image width; height is half (default: 4096).")
    parser.add_argument("--samples", type=positive_int, default=128)
    parser.add_argument("--device", choices=("CPU", "GPU"), default="CPU", help="GPU requires configured Cycles devices.")
    parser.add_argument("--frame", type=int, help="Evaluate this frame; defaults to the saved current frame.")
    parser.add_argument("--list", action="store_true", help="List source cameras and positions without exporting.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print the export plan without writing files.")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing images and this state's manifest.")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if not args.list and not args.output:
        parser.error("--output is required")
    if args.width % 2:
        parser.error("--width must be even for a 2:1 panorama")
    return args


def main():
    import bpy
    from mathutils import Euler, Matrix

    args = parse_args()
    scene = bpy.data.scenes[args.scene] if args.scene else bpy.context.scene
    # Run in a separate Blender process. No changes are saved to the .blend.
    bpy.context.window.scene = scene
    view_layer = args.view_layer or bpy.context.view_layer.name
    if view_layer not in scene.view_layers:
        raise ValueError(f"Unknown view layer {view_layer!r}.")
    if not scene.view_layers[view_layer].use:
        raise ValueError(f"View layer {view_layer!r} is disabled for rendering.")
    bpy.context.window.view_layer = scene.view_layers[view_layer]
    if args.frame is not None:
        scene.frame_set(args.frame)
    bpy.context.view_layer.update()
    cameras = {obj.name: obj for obj in scene.objects if obj.type == "CAMERA"}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    positions = {
        name: list(obj.evaluated_get(depsgraph).matrix_world.translation)
        for name, obj in cameras.items()
    }
    if args.list:
        for name in sorted(cameras):
            print(f"{name:24} XYZ={positions[name]}  {cameras[name].data.type}")
        return

    mapping = None
    if args.camera_map:
        mapping = json.loads(Path(bpy.path.abspath(args.camera_map)).read_text())
    plan = plan_cameras(cameras, mapping, args.state)
    output = Path(bpy.path.abspath(args.output)).expanduser().resolve()
    manifest_name = f"manifest__{args.state}.json" if args.state else "manifest.json"
    destinations = [output / filename for _, _, filename in plan] + [output / manifest_name]
    if not args.overwrite:
        existing = [str(path) for path in destinations if path.exists()]
        if existing:
            raise ValueError(f"Outputs already exist; use --overwrite to replace them: {existing}")
    for name, location_id, filename in plan:
        print(f"{name} -> {location_id} -> {output / filename}", flush=True)
    if args.dry_run:
        return

    output.mkdir(parents=True, exist_ok=True)
    scene.render.engine = "CYCLES"
    scene.cycles.device = args.device
    scene.cycles.samples = args.samples
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.width // 2
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 95
    scene.render.use_file_extension = True
    scene.render.use_border = False
    scene.render.use_multiview = False
    scene.render.film_transparent = False
    scene.render.use_stamp = False
    scene.render.use_motion_blur = False
    # A saved compositor/sequence could replace the camera image or write extra files.
    # This exporter intentionally renders a single view layer directly.
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    for marker in scene.timeline_markers:
        marker.camera = None

    manifest = {
        "schema_version": 1,
        "projection": "equirectangular",
        "width": args.width,
        "height": args.width // 2,
        "state": args.state or "default",
        "frame": scene.frame_current,
        "view_layer": view_layer,
        "samples": args.samples,
        "axes": {"east": "+X", "north": "+Y", "up": "+Z"},
        "camera_rotation_degrees": [90, 0, 0],
        "locations": {},
    }
    # One temporary, unparented camera avoids source constraints, rotation,
    # shared data and animation overriding the required panorama settings.
    data = bpy.data.cameras.new("_PanoramaExport")
    camera = bpy.data.objects.new("_PanoramaExport", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type = "PANO"
    data.panorama_type = "EQUIRECTANGULAR"
    data.longitude_min, data.longitude_max = -math.pi, math.pi
    data.latitude_min, data.latitude_max = -math.pi / 2, math.pi / 2
    data.dof.use_dof = False
    rotation = Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()
    for index, (name, location_id, filename) in enumerate(plan, start=1):
        print(f"Rendering {index}/{len(plan)}: {location_id} ({args.width}x{args.width // 2}, {args.samples} samples)", flush=True)
        source = cameras[name]
        data.clip_start, data.clip_end = source.data.clip_start, source.data.clip_end
        camera.matrix_world = Matrix.Translation(positions[name]) @ rotation
        bpy.context.view_layer.update()
        destination = output / filename
        temporary = output / f".{location_id}.rendering.jpg"
        scene.render.filepath = str(temporary)
        try:
            result = bpy.ops.render.render(write_still=True, scene=scene.name, layer=view_layer)
            if "FINISHED" not in result or not temporary.is_file():
                raise RuntimeError(f"Render did not finish for {name!r}.")
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
        manifest["locations"][location_id] = {
            "file": filename,
            "camera": name,
            "position": positions[name],
            "width": args.width,
            "height": args.width // 2,
            "samples": args.samples,
        }

    # Publish the manifest only when every image in this pass is complete.
    temporary_manifest = output / f".{manifest_name}.tmp"
    temporary_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
    os.replace(temporary_manifest, output / manifest_name)
    print(f"Exported {len(plan)} panoramas and {output / manifest_name}")


if __name__ == "__main__":
    main()
