#!/usr/bin/env python3
"""
tools/make_derived_strips.py

For animations that don't have AI-generated art yet, creates sprite strips
by re-using existing high-quality frames with transformations (rotation,
scale, offset) to approximate the animation.

This produces much better results than the geometric placeholder shapes.
"""

import json
import math
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

WORKSPACE = Path(__file__).resolve().parent.parent
SPRITES_DIR = WORKSPACE / "public" / "assets" / "sprites"
SPEC_PATH = WORKSPACE / "assets" / "spec" / "animations.spec.json"
FRAME_SIZE = 384


def load_base_frame(anim_name: str) -> Image.Image | None:
    """Try to load a high-quality base frame for the given animation."""
    strip_path = SPRITES_DIR / f"{anim_name}.png"
    if strip_path.exists():
        img = Image.open(strip_path)
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        # Return first frame
        return img.crop((0, 0, FRAME_SIZE, FRAME_SIZE))
    return None


def get_base_for_camera(camera: str) -> Image.Image:
    """Get appropriate base frame for a camera angle."""
    # For front-facing, use idle_sit frame 0
    # For side-facing, use walk frame 0
    if camera in ("side_right", "side_left"):
        base = load_base_frame("walk")
        if base:
            return base
    
    base = load_base_frame("idle_sit")
    if base:
        return base
    
    # Absolute fallback
    return Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))


def transform_frame(base: Image.Image, rotate: float = 0, scale: float = 1.0,
                     offset_x: int = 0, offset_y: int = 0,
                     brightness: float = 1.0, flip_h: bool = False) -> Image.Image:
    """Apply transformations to a base frame."""
    frame = base.copy()
    
    if flip_h:
        frame = frame.transpose(Image.FLIP_LEFT_RIGHT)
    
    if brightness != 1.0:
        enhancer = ImageEnhance.Brightness(frame)
        frame = enhancer.enhance(brightness)
    
    if scale != 1.0:
        new_size = (int(FRAME_SIZE * scale), int(FRAME_SIZE * scale))
        frame = frame.resize(new_size, Image.LANCZOS)
        # Center back in frame
        result = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        paste_x = (FRAME_SIZE - new_size[0]) // 2
        paste_y = (FRAME_SIZE - new_size[1]) // 2
        result.paste(frame, (paste_x, paste_y), frame)
        frame = result
    
    if rotate != 0:
        frame = frame.rotate(rotate, resample=Image.BICUBIC, expand=False, center=(FRAME_SIZE//2, FRAME_SIZE//2))
    
    if offset_x != 0 or offset_y != 0:
        result = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        result.paste(frame, (offset_x, offset_y), frame)
        frame = result
    
    return frame


# Define derived animations using transformations from base frames
DERIVED_ANIMATIONS = {
    # Look animations - simple head shifts from idle
    "look_left": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_x": -12},
        ]
    },
    "look_right": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_x": 12},
        ]
    },
    "look_up": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": -10},
        ]
    },
    "look_down": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": 8},
        ]
    },
    # Stand idle - use walk frame
    "stand_idle": {
        "base": "walk",
        "frames_spec": [
            {},
            {"offset_y": -2},
        ]
    },
    # Sit down - transition from standing to sitting
    "sit_down": {
        "base": "walk",
        "frames_spec": [
            {},
            {"offset_y": 6, "scale": 0.97},
            # Final frame uses idle_sit base
        ]
    },
    # Stand up - transition from sitting to standing
    "stand_up": {
        "base": "idle_sit",
        "frames_spec": [
            {},
            {"offset_y": -6, "scale": 1.02},
        ]
    },
    # Scared - trembling effect
    "scared": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_x": -3, "scale": 0.96},
            {"offset_x": 3, "scale": 0.96},
            {"offset_x": -2, "scale": 0.96},
        ]
    },
    # Bored sigh
    "bored_sigh": {
        "base": "idle_sit",
        "frames_spec": [
            {},
            {"offset_y": 4, "scale": 0.98},
            {"offset_y": 6, "scale": 0.97},
            {"offset_y": 2},
        ]
    },
    # Yawn
    "yawn": {
        "base": "idle_sit",
        "frames_spec": [
            {},
            {"offset_y": -4, "scale": 1.02},
            {"offset_y": -6, "scale": 1.04},
            {"offset_y": -4, "scale": 1.02},
            {},
        ]
    },
    # Stretch
    "stretch": {
        "base": "idle_sit",
        "frames_spec": [
            {},
            {"offset_y": -8, "scale": 1.05},
            {"offset_y": -12, "scale": 1.08},
            {"offset_y": -8, "scale": 1.05},
            {},
        ]
    },
    # Surprised
    "surprised": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": -8, "scale": 1.06},
            {"offset_y": -12, "scale": 1.08},
            {"offset_y": -6, "scale": 1.04},
        ]
    },
    # Kiss
    "kiss": {
        "base": "idle_sit",
        "frames_spec": [
            {},
            {"offset_y": -4},
            {"offset_y": -8, "scale": 1.03},
            {"offset_y": -4, "scale": 1.01},
            {},
        ]
    },
    # Drag
    "drag": {
        "base": "idle_sit",
        "frames_spec": [
            {"rotate": -8},
            {"rotate": -4, "offset_y": -4},
        ]
    },
    # Sleep down - transitioning to sleep
    "sleep_down": {
        "base": "idle_sit",
        "frames_spec": [
            {},
            {"offset_y": 8, "scale": 0.95},
            {"offset_y": 14, "scale": 0.90, "brightness": 0.95},
            {"offset_y": 18, "scale": 0.88, "brightness": 0.92},
        ]
    },
    # Wake up
    "wake_up": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": 12, "scale": 0.90, "brightness": 0.95},
            {"offset_y": 6, "scale": 0.95},
            {},
        ]
    },
    # Sneeze
    "sneeze": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": -4},
            {"offset_y": 6, "scale": 0.97},
            {"offset_y": -10, "scale": 1.04},
            {},
        ]
    },
    # Scratch ear
    "scratch_ear": {
        "base": "idle_sit",
        "frames_spec": [
            {"rotate": -5},
            {"rotate": -8, "offset_y": -2},
            {"rotate": -5, "offset_y": 2},
            {"rotate": -8, "offset_y": -2},
            {"rotate": -3},
        ]
    },
    # Chase tail
    "chase_tail": {
        "base": "idle_sit",
        "frames_spec": [
            {"rotate": 15},
            {"rotate": 30},
            {"rotate": 45},
            {"rotate": 30},
            {"rotate": 15},
            {"rotate": 0},
        ]
    },
    # Roll over
    "roll_over": {
        "base": "idle_sit",
        "frames_spec": [
            {"rotate": 15},
            {"rotate": 45},
            {"rotate": 90},
            {"rotate": 45},
            {"rotate": 15},
        ]
    },
    # Paw reach
    "paw_reach": {
        "base": "idle_sit",
        "frames_spec": [
            {},
            {"offset_y": -6, "offset_x": 8},
            {"offset_y": -10, "offset_x": 14},
            {"offset_y": -6, "offset_x": 8},
        ]
    },
    # Dance
    "dance": {
        "base": "idle_sit",
        "frames_spec": [
            {"rotate": -8, "offset_y": -6},
            {"rotate": 0, "offset_y": -12},
            {"rotate": 8, "offset_y": -6},
            {"rotate": 0, "offset_y": -12},
            {"rotate": -8, "offset_y": -6},
        ]
    },
    # Ball pounce
    "ball_pounce": {
        "base": "walk",
        "frames_spec": [
            {"scale": 0.95},
            {"offset_y": -20, "scale": 1.05},
            {"offset_y": -30, "scale": 1.08},
            {"offset_y": -20, "scale": 1.05},
            {"offset_y": 4, "scale": 0.92},
        ]
    },
    # Bone sniff
    "bone_sniff": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": 6},
            {"offset_y": 10, "offset_x": -4},
            {"offset_y": 10, "offset_x": 4},
            {"offset_y": 6},
            {},
        ]
    },
    # TV watch
    "tv_watch": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": -4, "offset_x": 6},
            {"offset_y": -4, "offset_x": 6},
            {"offset_y": -2, "offset_x": 4},
            {"offset_y": -4, "offset_x": 6},
        ]
    },
    # TV laugh
    "tv_laugh": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": -4},
            {"offset_y": -8, "scale": 1.02},
            {"offset_y": -4},
            {"offset_y": -8, "scale": 1.02},
        ]
    },
    # Hungry
    "hungry": {
        "base": "idle_sit",
        "frames_spec": [
            {"offset_y": 4, "brightness": 0.96},
            {"offset_y": 6, "brightness": 0.94},
            {"offset_y": 4, "brightness": 0.96},
        ]
    },
    # Trip
    "trip": {
        "base": "walk",
        "frames_spec": [
            {},
            {"rotate": 10, "offset_y": 4},
            {"rotate": 25, "offset_y": 12},
            {"rotate": 35, "offset_y": 20},
            {"rotate": 15, "offset_y": 10},
        ]
    },
}


def main():
    # Load spec to know frame counts for all animations
    with open(SPEC_PATH, "r") as f:
        spec = json.load(f)

    anim_spec = {a["name"]: a for a in spec["animations"]}
    
    generated = 0
    skipped = 0

    for anim_name, recipe in DERIVED_ANIMATIONS.items():
        # Skip if we already have AI-generated art (check file size — AI art is much larger)
        existing = SPRITES_DIR / f"{anim_name}.png"
        if existing.exists() and existing.stat().st_size > 50000:
            # Likely already has AI-generated art
            skipped += 1
            continue

        base_name = recipe["base"]
        base_frame = get_base_for_camera(
            anim_spec.get(anim_name, {}).get("camera", "front")
        )
        
        # Override with specific base if available
        if base_name:
            specific = load_base_frame(base_name)
            if specific:
                base_frame = specific

        frames_spec = recipe["frames_spec"]
        expected_frames = anim_spec.get(anim_name, {}).get("frames", len(frames_spec))
        
        # Extend or truncate frames_spec to match expected count
        while len(frames_spec) < expected_frames:
            frames_spec.append(frames_spec[-1] if frames_spec else {})
        frames_spec = frames_spec[:expected_frames]

        frames = []
        for spec_item in frames_spec:
            frame = transform_frame(
                base_frame,
                rotate=spec_item.get("rotate", 0),
                scale=spec_item.get("scale", 1.0),
                offset_x=spec_item.get("offset_x", 0),
                offset_y=spec_item.get("offset_y", 0),
                brightness=spec_item.get("brightness", 1.0),
                flip_h=spec_item.get("flip_h", False),
            )
            frames.append(frame)

        # Build strip
        strip_w = FRAME_SIZE * len(frames)
        strip = Image.new("RGBA", (strip_w, FRAME_SIZE), (0, 0, 0, 0))
        for i, frame in enumerate(frames):
            strip.paste(frame, (i * FRAME_SIZE, 0), frame)

        SPRITES_DIR.mkdir(parents=True, exist_ok=True)
        out_path = SPRITES_DIR / f"{anim_name}.png"
        strip.save(out_path, "PNG")
        print(f"  ✅ {anim_name}: {len(frames)} frames → {out_path.name}")
        generated += 1

    print(f"\n{'='*50}")
    print(f"Derived: {generated} generated, {skipped} skipped (already have art)")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
