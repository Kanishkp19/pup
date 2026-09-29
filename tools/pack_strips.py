#!/usr/bin/env python3
"""
tools/pack_strips.py
Concatenates processed frames horizontally into sprite strips
in public/assets/sprites/<anim>.png and updates public/assets/animations.json
CLI:
  python tools/pack_strips.py [--anim <NAME>]
"""

import json
import hashlib
import argparse
import numpy as np
from pathlib import Path
from PIL import Image

WORKSPACE = Path(__file__).resolve().parent.parent
SPEC_PATH = WORKSPACE / "assets" / "spec" / "animations.spec.json"
PROCESSED_DIR = WORKSPACE / "assets" / "processed"
SPRITES_DIR = WORKSPACE / "public" / "assets" / "sprites"
MANIFEST_PATH = WORKSPACE / "public" / "assets" / "animations.json"

CANVAS_PX = 384

def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def get_alpha_bbox(img: Image.Image) -> list:
    alpha = np.array(img)[:, :, 3]
    opaque = alpha > 10
    rows = np.any(opaque, axis=1)
    cols = np.any(opaque, axis=0)
    if not np.any(rows) or not np.any(cols):
        return [0, 0, img.width, img.height]
    min_y, max_y = np.where(rows)[0][[0, -1]]
    min_x, max_x = np.where(cols)[0][[0, -1]]
    return [int(min_x), int(min_y), int(max_x - min_x + 1), int(max_y - min_y + 1)]

def pack_animation(anim_spec: dict, manifest: dict):
    name = anim_spec["name"]
    frames_count = anim_spec.get("frames", 1)
    anim_proc_dir = PROCESSED_DIR / name

    # Check if processed frames exist
    frame_files = [anim_proc_dir / f"{name}_{k:02d}.png" for k in range(frames_count)]
    if not all(f.exists() for f in frame_files):
        return False

    strip_w = CANVAS_PX * frames_count
    strip_h = CANVAS_PX
    strip_img = Image.new("RGBA", (strip_w, strip_h), (0, 0, 0, 0))

    bboxes = []
    for k, f in enumerate(frame_files):
        frame_img = Image.open(f).convert("RGBA")
        strip_img.paste(frame_img, (k * CANVAS_PX, 0), frame_img)
        bboxes.append(get_alpha_bbox(frame_img))

    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    strip_out = SPRITES_DIR / f"{name}.png"
    strip_img.save(strip_out, "PNG")

    fps = anim_spec.get("fps", 6)
    frame_ms_map = anim_spec.get("frame_ms", {})
    default_ms = int(round(1000.0 / fps)) if fps > 0 else 167
    resolved_ms = [int(frame_ms_map.get(str(i), default_ms)) for i in range(frames_count)]

    manifest["animations"][name] = {
        "strip": f"sprites/{name}.png",
        "frames": frames_count,
        "frameWidth": CANVAS_PX,
        "frameHeight": CANVAS_PX,
        "fps": fps,
        "loop": bool(anim_spec.get("loop", False)),
        "frameMs": resolved_ms,
        "camera": anim_spec.get("camera", "front"),
        "mirrorable": bool(anim_spec.get("mirrorable", True)),
        "bbox": bboxes,
        "soundCue": anim_spec.get("soundCue", None)
    }

    print(f"Packed {frames_count} frames for {name} -> {strip_out.relative_to(WORKSPACE)}")
    return True

def main():
    parser = argparse.ArgumentParser(description="Pack processed frames into strips")
    parser.add_argument("--anim", help="Animation name")
    args = parser.parse_args()

    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        spec = json.load(f)

    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    else:
        manifest = {
            "version": 1,
            "canvas": 384,
            "baseline": 356,
            "centerX": 192,
            "display": 192,
            "window": 256,
            "feetYLogical": 242,
            "specSha256": compute_sha256(SPEC_PATH),
            "animations": {}
        }

    manifest["specSha256"] = compute_sha256(SPEC_PATH)

    animations = spec.get("animations", [])
    if args.anim:
        animations = [a for a in animations if a["name"] == args.anim]

    packed_any = False
    for a in animations:
        if pack_animation(a, manifest):
            packed_any = True

    if packed_any:
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        print("Updated animations.json manifest.")

if __name__ == "__main__":
    main()
