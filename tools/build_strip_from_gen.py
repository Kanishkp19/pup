#!/usr/bin/env python3
"""
tools/build_strip_from_gen.py

Converts AI-generated sprite images (which may be in NxM grid layouts)
into proper horizontal sprite strips at 384x384 per frame for PUPPY.

Usage:
  python tools/build_strip_from_gen.py <source_image> <anim_name> <frame_count>

Example:
  python tools/build_strip_from_gen.py /path/to/idle_sit_strip.jpg idle_sit 6

The script:
  1. Detects character cells in the source image via contour/content analysis
  2. Extracts each cell, auto-crops to content bounding box
  3. Scales each into a 384x384 frame centered on baseline
  4. Concatenates horizontally → public/assets/sprites/<anim_name>.png
"""

import sys
import math
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

WORKSPACE = Path(__file__).resolve().parent.parent
SPRITES_DIR = WORKSPACE / "public" / "assets" / "sprites"
FRAME_SIZE = 384
BASELINE_Y = 356
PADDING = 12  # px padding around character in each frame


def find_content_bounds(img_array: np.ndarray) -> tuple:
    """Find bounding box of non-white/non-transparent content."""
    if img_array.shape[2] == 4:
        # RGBA: use alpha channel
        mask = img_array[:, :, 3] > 20
    else:
        # RGB: detect non-white pixels
        white_thresh = 240
        mask = np.any(img_array[:, :, :3] < white_thresh, axis=2)

    if not mask.any():
        return (0, 0, img_array.shape[1], img_array.shape[0])

    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]

    return (int(cmin), int(rmin), int(cmax) + 1, int(rmax) + 1)


def detect_grid(img: Image.Image, expected_frames: int) -> list:
    """
    Detect grid layout and return list of (x, y, w, h) cells.
    Tries common layouts: 1xN, 2-row grids, etc.
    """
    w, h = img.size
    arr = np.array(img)

    # Try different grid configurations
    candidates = []

    # 1×N (single row)
    if expected_frames <= 8:
        candidates.append((1, expected_frames))

    # 2-row configurations
    if expected_frames % 2 == 0:
        candidates.append((2, expected_frames // 2))

    # 3-row configurations
    if expected_frames % 3 == 0:
        candidates.append((3, expected_frames // 3))

    # Also try the reverse (cols×rows)
    if expected_frames % 2 == 0:
        candidates.append((expected_frames // 2, 2))
    if expected_frames % 3 == 0:
        candidates.append((expected_frames // 3, 3))

    best_cells = None
    best_score = -1

    for rows, cols in candidates:
        cell_w = w // cols
        cell_h = h // rows

        # Check if this grid makes sense (cells should be roughly square-ish)
        aspect = cell_w / cell_h if cell_h > 0 else 0
        if aspect < 0.3 or aspect > 3.0:
            continue

        cells = []
        total_content = 0

        for r in range(rows):
            for c in range(cols):
                x1 = c * cell_w
                y1 = r * cell_h
                x2 = x1 + cell_w
                y2 = y1 + cell_h

                cell_arr = arr[y1:y2, x1:x2]
                bounds = find_content_bounds(cell_arr)
                content_area = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])
                total_content += content_area

                cells.append((x1, y1, cell_w, cell_h))

        # Score: prefer layouts where cells have balanced content
        score = total_content / (w * h) if (w * h) > 0 else 0

        # Penalize extreme aspect ratios
        if 0.7 < aspect < 1.5:
            score *= 1.5

        if score > best_score and len(cells) == expected_frames:
            best_score = score
            best_cells = cells

    if best_cells is None:
        # Fallback: divide evenly into a single row
        cell_w = w // expected_frames
        best_cells = [(i * cell_w, 0, cell_w, h) for i in range(expected_frames)]

    return best_cells


def extract_and_resize_frame(img: Image.Image, cell: tuple) -> Image.Image:
    """
    Extract a cell from the source image, auto-crop to content,
    then scale and center into a 384×384 frame with transparency.
    """
    x, y, cw, ch = cell
    cell_img = img.crop((x, y, x + cw, y + ch))

    # Convert to RGBA if needed
    if cell_img.mode != "RGBA":
        cell_img = cell_img.convert("RGBA")

    # Find content bounds within the cell
    arr = np.array(cell_img)
    bounds = find_content_bounds(arr)
    bx, by, bx2, by2 = bounds

    # Add small margin
    margin = 4
    bx = max(0, bx - margin)
    by = max(0, by - margin)
    bx2 = min(cw, bx2 + margin)
    by2 = min(ch, by2 + margin)

    # Crop to content
    content = cell_img.crop((bx, by, bx2, by2))
    content_w, content_h = content.size

    if content_w == 0 or content_h == 0:
        return Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))

    # Calculate target size within the frame
    available_w = FRAME_SIZE - 2 * PADDING
    available_h = BASELINE_Y - PADDING  # character should fit above baseline

    scale = min(available_w / content_w, available_h / content_h)
    new_w = int(content_w * scale)
    new_h = int(content_h * scale)

    # High-quality resize
    resized = content.resize((new_w, new_h), Image.LANCZOS)

    # Create frame and paste centered horizontally, aligned to baseline
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    paste_x = (FRAME_SIZE - new_w) // 2
    paste_y = BASELINE_Y - new_h  # bottom of character at baseline

    frame.paste(resized, (paste_x, paste_y), resized)

    return frame


def build_strip(source_path: str, anim_name: str, frame_count: int):
    """Build the final sprite strip."""
    print(f"Processing: {source_path} → {anim_name} ({frame_count} frames)")

    img = Image.open(source_path)
    if img.mode not in ("RGBA", "RGB"):
        img = img.convert("RGBA")

    print(f"  Source size: {img.size}")

    # Detect grid layout
    cells = detect_grid(img, frame_count)
    print(f"  Detected {len(cells)} cells: {cells[0]} ...")

    # Extract and resize each frame
    frames = []
    for i, cell in enumerate(cells):
        frame = extract_and_resize_frame(img, cell)
        frames.append(frame)
        print(f"  Frame {i}: cell {cell} → 384×384")

    # Concatenate horizontally
    strip_w = FRAME_SIZE * frame_count
    strip = Image.new("RGBA", (strip_w, FRAME_SIZE), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * FRAME_SIZE, 0), frame)

    # Save
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SPRITES_DIR / f"{anim_name}.png"
    strip.save(out_path, "PNG")
    print(f"  ✅ Saved: {out_path} ({strip_w}×{FRAME_SIZE})")

    return out_path


def main():
    if len(sys.argv) < 4:
        print("Usage: python build_strip_from_gen.py <source_image> <anim_name> <frame_count>")
        sys.exit(1)

    source = sys.argv[1]
    name = sys.argv[2]
    count = int(sys.argv[3])

    build_strip(source, name, count)


if __name__ == "__main__":
    main()
