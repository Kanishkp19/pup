#!/usr/bin/env python3
"""
tools/process_frames.py
Chroma-keys green background (#00FF00), despills, cleans, normalizes scale,
and centers on 384x384 transparent canvas with baseline y=356 and center x=192.
CLI:
  python tools/process_frames.py [--anim <NAME>]
"""

import os
import json
import argparse
import numpy as np
from pathlib import Path
from PIL import Image

WORKSPACE = Path(__file__).resolve().parent.parent
SPEC_PATH = WORKSPACE / "assets" / "spec" / "animations.spec.json"
RAW_DIR = WORKSPACE / "assets" / "raw"
PROCESSED_DIR = WORKSPACE / "assets" / "processed"

CANVAS_PX = 384
BASELINE_Y = 356
CENTER_X = 192

def key_and_despill(img_np: np.ndarray) -> np.ndarray:
    """
    img_np: float32 [H, W, 4] or [H, W, 3] in range [0, 1]
    Returns RGBA float32 in range [0, 1]
    """
    r = img_np[:, :, 0]
    g = img_np[:, :, 1]
    b = img_np[:, :, 2]

    max_rb = np.maximum(r, b)
    g_excess = g * 255.0 - max_rb * 255.0

    # Keying formula: alpha = 1 - clamp((g_excess - 20) / 70, 0, 1)
    alpha = 1.0 - np.clip((g_excess - 20.0) / 70.0, 0.0, 1.0)

    # Despill: where alpha > 0, set G = min(G, max(R, B))
    g_despilled = np.where(alpha > 0.0, np.minimum(g, max_rb), g)

    result = np.zeros((img_np.shape[0], img_np.shape[1], 4), dtype=np.float32)
    result[:, :, 0] = r
    result[:, :, 1] = g_despilled
    result[:, :, 2] = b
    result[:, :, 3] = alpha
    return result

def measure_alpha_bbox(alpha: np.ndarray):
    """Returns (min_x, min_y, max_x, max_y, centroid_x)"""
    opaque = alpha > 0.1
    rows = np.any(opaque, axis=1)
    cols = np.any(opaque, axis=0)
    if not np.any(rows) or not np.any(cols):
        return (0, 0, alpha.shape[1], alpha.shape[0], alpha.shape[1] / 2)

    min_y, max_y = np.where(rows)[0][[0, -1]]
    min_x, max_x = np.where(cols)[0][[0, -1]]

    # Weighted centroid x
    x_coords = np.arange(alpha.shape[1])
    col_weights = np.sum(alpha, axis=0)
    total_weight = np.sum(col_weights)
    if total_weight > 0:
        centroid_x = np.sum(x_coords * col_weights) / total_weight
    else:
        centroid_x = (min_x + max_x) / 2.0

    return (int(min_x), int(min_y), int(max_x), int(max_y), float(centroid_x))

def process_animation(anim_spec: dict):
    name = anim_spec["name"]
    frames_count = anim_spec.get("frames", 1)
    target_height = anim_spec.get("target_height_px", 300)
    preserve_motion = anim_spec.get("preserve_motion", False)

    anim_raw_dir = RAW_DIR / name
    if not anim_raw_dir.exists():
        return

    anim_proc_dir = PROCESSED_DIR / name
    anim_proc_dir.mkdir(parents=True, exist_ok=True)

    loaded_frames = []
    bboxes = []

    for k in range(frames_count):
        raw_file = anim_raw_dir / f"{name}_{k:02d}.png"
        if not raw_file.exists():
            continue

        img = Image.open(raw_file).convert("RGBA")
        img_np = np.array(img, dtype=np.float32) / 255.0
        keyed_np = key_and_despill(img_np)
        bbox = measure_alpha_bbox(keyed_np[:, :, 3])

        loaded_frames.append((k, keyed_np, bbox))
        bboxes.append(bbox)

    if not loaded_frames:
        return

    # Scale calculation
    heights = [b[3] - b[1] for b in bboxes]
    if preserve_motion:
        base_h = heights[0] if heights else 300
        scale_factor = target_height / max(base_h, 1)
    else:
        med_h = np.median(heights) if heights else 300
        scale_factor = target_height / max(med_h, 1)

    ref_offset_x = 0
    ref_offset_y = 0

    for idx, (k, keyed_np, bbox) in enumerate(loaded_frames):
        min_x, min_y, max_x, max_y, centroid_x = bbox

        # Crop to bbox
        cropped_np = keyed_np[min_y : max_y + 1, min_x : max_x + 1]
        cropped_img = Image.fromarray((cropped_np * 255.0).astype(np.uint8), mode="RGBA")

        # Resize by scale_factor
        new_w = max(1, int(round(cropped_img.width * scale_factor)))
        new_h = max(1, int(round(cropped_img.height * scale_factor)))
        scaled_img = cropped_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Placement
        canvas = Image.new("RGBA", (CANVAS_PX, CANVAS_PX), (0, 0, 0, 0))

        if not preserve_motion or idx == 0:
            paste_x = int(round(CENTER_X - (centroid_x - min_x) * scale_factor))
            paste_y = int(round(BASELINE_Y - new_h))
            if idx == 0 and preserve_motion:
                ref_offset_x = paste_x
                ref_offset_y = paste_y
        else:
            paste_x = ref_offset_x
            paste_y = ref_offset_y

        canvas.paste(scaled_img, (paste_x, paste_y), scaled_img)
        out_file = anim_proc_dir / f"{name}_{k:02d}.png"
        canvas.save(out_file, "PNG")

    print(f"Processed {len(loaded_frames)} frames for {name}")

def main():
    parser = argparse.ArgumentParser(description="Process raw frames")
    parser.add_argument("--anim", help="Animation name (optional)")
    args = parser.parse_args()

    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        spec = json.load(f)

    animations = spec.get("animations", [])
    if args.anim:
        animations = [a for a in animations if a["name"] == args.anim]

    for a in animations:
        process_animation(a)

if __name__ == "__main__":
    main()
