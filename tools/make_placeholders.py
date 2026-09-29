#!/usr/bin/env python3
"""
tools/make_placeholders.py
Generates placeholder sprite strips in public/assets/sprites/<anim>.png
for all animations in assets/spec/animations.spec.json.
Each frame is 384x384, baseline y=356, center x=192.
"""

import math
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

WORKSPACE = Path(__file__).resolve().parent.parent
SPEC_PATH = WORKSPACE / "assets" / "spec" / "animations.spec.json"
SPRITES_DIR = WORKSPACE / "public" / "assets" / "sprites"

# Colors from Art Bible
FUR_BASE = (242, 199, 126, 255)       # #F2C77E
FUR_LIGHT = (251, 232, 196, 255)      # #FBE8C4
FUR_SHADOW = (217, 160, 91, 255)      # #D9A05B
EAR_COLOR = (201, 138, 75, 255)       # #C98A4B
OUTLINE = (122, 74, 43, 255)          # #7A4A2B
NOSE = (91, 58, 41, 255)              # #5B3A29
EYE_BLUE = (62, 92, 118, 255)         # #3E5C76
WHITE = (255, 255, 255, 255)
BLUSH = (244, 168, 160, 200)

def draw_puppy_frame(draw: ImageDraw.ImageDraw, offset_x: int, anim_name: str, frame_idx: int, total_frames: int):
    cx = offset_x + 192
    baseline = 356

    # Bob / motion based on frame
    bob_y = 0
    leg_offset = 0
    if "walk" in anim_name or "run" in anim_name:
        phase = (frame_idx / total_frames) * 2 * math.pi
        bob_y = int(math.sin(phase) * 6)
        leg_offset = int(math.sin(phase) * 16)
    elif "happy" in anim_name or "excited" in anim_name:
        phase = (frame_idx / total_frames) * 2 * math.pi
        bob_y = int(-abs(math.sin(phase)) * 12)
    elif "sleep" in anim_name:
        bob_y = 20

    head_y = 150 + bob_y
    body_y = 260 + bob_y
    tail_swing = math.sin((frame_idx + 1) * 1.5) * 18

    # Tail (behind body)
    tail_x = cx + 60
    draw.line([
        (cx + 40, body_y + 20),
        (tail_x + tail_swing, body_y - 20)
    ], fill=OUTLINE, width=12)
    draw.line([
        (cx + 40, body_y + 20),
        (tail_x + tail_swing, body_y - 20)
    ], fill=FUR_BASE, width=8)

    # Body
    body_bbox = [cx - 65, body_y - 45, cx + 65, body_y + 65]
    draw.ellipse(body_bbox, fill=FUR_BASE, outline=OUTLINE, width=3)

    # Cream chest patch
    chest_bbox = [cx - 35, body_y - 25, cx + 35, body_y + 45]
    draw.ellipse(chest_bbox, fill=FUR_LIGHT)

    # Back paws / legs
    paws_y = baseline - 8
    paws_left = cx - 48 - leg_offset
    paws_right = cx + 48 + leg_offset
    draw.ellipse([paws_left - 18, paws_y - 12, paws_left + 18, paws_y + 12], fill=FUR_LIGHT, outline=OUTLINE, width=2)
    draw.ellipse([paws_right - 18, paws_y - 12, paws_right + 18, paws_y + 12], fill=FUR_LIGHT, outline=OUTLINE, width=2)

    # Front paws
    front_left = cx - 22 + (leg_offset // 2)
    front_right = cx + 22 - (leg_offset // 2)
    draw.ellipse([front_left - 14, paws_y - 8, front_left + 14, paws_y + 12], fill=FUR_LIGHT, outline=OUTLINE, width=2)
    draw.ellipse([front_right - 14, paws_y - 8, front_right + 14, paws_y + 12], fill=FUR_LIGHT, outline=OUTLINE, width=2)

    # Ears (behind head or flapping)
    ear_w = 26
    ear_h = 55
    ear_flap = int(math.sin(frame_idx * 1.2) * 5)
    draw.ellipse([cx - 75, head_y - 20 + ear_flap, cx - 75 + ear_w, head_y - 20 + ear_h + ear_flap], fill=EAR_COLOR, outline=OUTLINE, width=3)
    draw.ellipse([cx + 75 - ear_w, head_y - 20 - ear_flap, cx + 75, head_y - 20 + ear_h - ear_flap], fill=EAR_COLOR, outline=OUTLINE, width=3)

    # Head
    head_r = 60
    head_bbox = [cx - head_r, head_y - head_r, cx + head_r, head_y + head_r]
    draw.ellipse(head_bbox, fill=FUR_BASE, outline=OUTLINE, width=3)

    # Muzzle / Snout
    muzzle_w = 46
    muzzle_h = 32
    muzzle_bbox = [cx - muzzle_w // 2, head_y + 10, cx + muzzle_w // 2, head_y + 10 + muzzle_h]
    draw.ellipse(muzzle_bbox, fill=FUR_LIGHT, outline=OUTLINE, width=2)

    # Nose
    draw.ellipse([cx - 8, head_y + 15, cx + 8, head_y + 25], fill=NOSE)

    # Mouth
    draw.arc([cx - 12, head_y + 22, cx, head_y + 32], start=0, end=180, fill=OUTLINE, width=2)
    draw.arc([cx, head_y + 22, cx + 12, head_y + 32], start=0, end=180, fill=OUTLINE, width=2)

    # Cheeks / blush
    draw.ellipse([cx - 42, head_y + 15, cx - 28, head_y + 27], fill=BLUSH)
    draw.ellipse([cx + 28, head_y + 15, cx + 42, head_y + 27], fill=BLUSH)

    # Eyes & direction
    eye_dx = 0
    eye_dy = 0
    if "left" in anim_name:
        eye_dx = -6
    elif "right" in anim_name:
        eye_dx = 6
    elif "up" in anim_name:
        eye_dy = -5
    elif "down" in anim_name:
        eye_dy = 5

    # Check for blink or closed eyes
    is_blink = ("blink" in anim_name) or ("sleep" in anim_name) or (anim_name == "idle_sit" and frame_idx in (3, 4))
    eye_lx = cx - 24 + eye_dx
    eye_rx = cx + 24 + eye_dx
    eye_y = head_y - 6 + eye_dy

    if is_blink:
        draw.arc([eye_lx - 12, eye_y - 6, eye_lx + 12, eye_y + 8], start=180, end=360, fill=OUTLINE, width=3)
        draw.arc([eye_rx - 12, eye_y - 6, eye_rx + 12, eye_y + 8], start=180, end=360, fill=OUTLINE, width=3)
    else:
        # Iris
        draw.ellipse([eye_lx - 11, eye_y - 12, eye_lx + 11, eye_y + 12], fill=EYE_BLUE, outline=OUTLINE, width=2)
        draw.ellipse([eye_rx - 11, eye_y - 12, eye_rx + 11, eye_y + 12], fill=EYE_BLUE, outline=OUTLINE, width=2)
        # Highlights
        draw.ellipse([eye_lx - 5, eye_y - 9, eye_lx + 2, eye_y - 2], fill=WHITE)
        draw.ellipse([eye_lx + 2, eye_y + 2, eye_lx + 6, eye_y + 6], fill=WHITE)
        draw.ellipse([eye_rx - 5, eye_y - 9, eye_rx + 2, eye_y - 2], fill=WHITE)
        draw.ellipse([eye_rx + 2, eye_y + 2, eye_rx + 6, eye_y + 6], fill=WHITE)

    # Stamped frame text
    label = f"{anim_name} [{frame_idx + 1}/{total_frames}]"
    draw.text((offset_x + 12, 16), label, fill=OUTLINE)

def main():
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        spec = json.load(f)

    animations = spec.get("animations", [])
    print(f"Generating placeholder strips for {len(animations)} animations...")

    for a in animations:
        name = a["name"]
        frames = a.get("frames", 1)
        width = 384 * frames
        height = 384

        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        for k in range(frames):
            offset_x = k * 384
            draw_puppy_frame(draw, offset_x, name, k, frames)

        out_path = SPRITES_DIR / f"{name}.png"
        img.save(out_path, "PNG")

    print(f"Generated {len(animations)} placeholder strips in {SPRITES_DIR}")

if __name__ == "__main__":
    main()
