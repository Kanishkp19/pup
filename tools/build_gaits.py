#!/usr/bin/env python3
"""
tools/build_gaits.py

Rebuilds ONLY the gait strips (walk, run) with real leg articulation:
the side-view master is split at the belly line into a body layer and two
leg slices (rear pair / front pair). Each leg slice rotates around its hip
pivot at the belly line, counter-phased, with feathered alpha blending so
the joints stay seamless. Body gets a small bob on top.

Run after tools/build_strips_offline.py.
"""

import json
import hashlib
import math
import os
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    venv = Path(__file__).resolve().parent.parent / ".venv" / "bin" / "python3"
    if venv.exists():
        os.execv(str(venv), [str(venv), *sys.argv])
    raise

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_strips_offline import (
    key_image, normalize, alpha_bbox, CANVAS, BASELINE, CENTER_X,
    PROCESSED_DIR, SPRITES_DIR, MANIFEST_PATH, SPEC_PATH,
)

WORKSPACE = Path(__file__).resolve().parent.parent
MASTER_SIDE = WORKSPACE / "assets/approved/master/master_side_right.png"

# Overlap bands (px): body/legs share a fully-opaque band across the belly cut,
# and rear/front leg slices share a fully-opaque vertical band at their split.
# Overlap (NOT feathering) guarantees combined alpha stays 1.0 -> no seam line.
VOVER = 10   # vertical overlap across the belly line
HOVER = 14   # horizontal overlap between rear and front leg slices


def split_at_belly(side: Image.Image, belly_y: int):
    """Split into (body, rear_legs, front_legs) with OVERLAPPING hard cuts.

    Every layer keeps full alpha inside its window; windows overlap by VOVER
    rows across the belly line and HOVER columns at the leg split, so the
    union is always fully opaque where the dog is opaque (no seam).
    """
    a = np.array(side).astype(np.float32)
    bx0, _, bx1, _ = alpha_bbox(side)

    legs_x_split = 200  # between mid and front paw clusters

    body = a.copy()
    body[belly_y + VOVER:, :, 3] = 0          # body owns everything above cut+overlap

    rear = a.copy()
    rear[:belly_y - VOVER, :, 3] = 0          # legs own everything below cut-overlap
    rear[:, legs_x_split + HOVER:, 3] = 0     # rear slice ends inside the overlap band

    front = a.copy()
    front[:belly_y - VOVER, :, 3] = 0
    front[:, :legs_x_split - HOVER, 3] = 0    # front slice starts inside the overlap band

    to_img = lambda x: Image.fromarray(x.astype(np.uint8))
    return to_img(body), to_img(rear), to_img(front)


def rotate_about(img: Image.Image, deg: float, pivot: tuple) -> Image.Image:
    if abs(deg) < 0.05:
        return img
    return img.rotate(deg, resample=Image.BICUBIC, center=pivot)


def shift(img: Image.Image, dy: float) -> Image.Image:
    if abs(dy) < 0.5:
        return img
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.alpha_composite(img, (0, int(round(dy))))
    return out


def build_gait(n: int, leg_deg: float, body_bob: float, run: bool):
    side = normalize(key_image(MASTER_SIDE), 250 if not run else 240)
    bx0, by0, bx1, by1 = alpha_bbox(side)
    body_h = by1 - by0
    belly_y = by1 - int(body_h * 0.24)

    body, rear, front = split_at_belly(side, belly_y)

    # hip pivots: at belly line, over each leg group's center
    rear_pivot = ((bx0 + 200) // 2, belly_y - 4)
    front_pivot = ((200 + bx1) // 2, belly_y - 4)

    frames = []
    for k in range(n):
        phase = 2 * math.pi * k / n
        canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))

        bob = -abs(math.sin(phase)) * body_bob
        lean = 2.0 if run else 0.0  # slight forward lean when running

        rear_rot = math.sin(phase) * leg_deg
        front_rot = math.sin(phase + math.pi) * leg_deg  # counter-phase trot

        body_f = rotate_about(body, lean, (CENTER_X, BASELINE))
        rear_f = rotate_about(rear, rear_rot + lean * 0.4, rear_pivot)
        front_f = rotate_about(front, front_rot + lean * 0.4, front_pivot)

        canvas.alpha_composite(shift(rear_f, bob * 0.7))
        canvas.alpha_composite(shift(body_f, bob))
        canvas.alpha_composite(shift(front_f, bob * 0.7))
        frames.append(canvas)
    return frames


def pack(name: str, frames: list, manifest: dict, spec_entry: dict):
    n = len(frames)
    strip = Image.new("RGBA", (CANVAS * n, CANVAS), (0, 0, 0, 0))
    bboxes = []
    pdir = PROCESSED_DIR / name
    pdir.mkdir(parents=True, exist_ok=True)
    for k, fr in enumerate(frames):
        fr.save(pdir / f"{name}_{k:02d}.png")
        strip.alpha_composite(fr, (k * CANVAS, 0))
        bboxes.append(list(alpha_bbox(fr)))
    strip.save(SPRITES_DIR / f"{name}.png", "PNG", optimize=True)

    fps = spec_entry.get("fps", 8)
    default_ms = int(round(1000.0 / fps))
    fms = spec_entry.get("frame_ms", {})
    resolved = [int(fms.get(str(i), default_ms)) for i in range(n)]

    manifest["animations"][name] = {
        "strip": f"sprites/{name}.png",
        "frames": n, "frameWidth": CANVAS, "frameHeight": CANVAS,
        "fps": fps, "loop": bool(spec_entry.get("loop", True)),
        "frameMs": resolved, "camera": spec_entry.get("camera", "side_right"),
        "mirrorable": bool(spec_entry.get("mirrorable", True)),
        "bbox": bboxes, "soundCue": spec_entry.get("soundCue", None),
    }
    print(f"  ✅ {name}: {n} leg-articulated frames")


def main():
    with open(SPEC_PATH) as f:
        spec = json.load(f)
    spec_by_name = {a["name"]: a for a in spec["animations"]}

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    manifest["specSha256"] = hashlib.sha256(SPEC_PATH.read_bytes()).hexdigest()

    print("Rebuilding gaits with hip-pivot leg articulation ...")
    walk_frames = build_gait(6, leg_deg=7.0, body_bob=3.0, run=False)
    run_frames = build_gait(6, leg_deg=13.0, body_bob=5.5, run=True)
    pack("walk", walk_frames, manifest, spec_by_name["walk"])
    pack("run", run_frames, manifest, spec_by_name["run"])

    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print("Manifest updated.")


if __name__ == "__main__":
    main()
