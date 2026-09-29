#!/usr/bin/env python3
"""
tools/extract_palette.py
Extracts palette color tokens from an approved master image using color clustering.
CLI:
  python tools/extract_palette.py --image <path_to_master_image>
Output:
  assets/spec/palette.json
"""

import sys
import json
import argparse
from pathlib import Path
from PIL import Image

WORKSPACE = Path(__file__).resolve().parent.parent
PALETTE_PATH = WORKSPACE / "assets" / "spec" / "palette.json"

DEFAULT_FALLBACKS = {
    "--pup-fur-base": "#F2C77E",
    "--pup-fur-light": "#FBE8C4",
    "--pup-fur-shadow": "#D9A05B",
    "--pup-ear": "#C98A4B",
    "--pup-outline": "#7A4A2B",
    "--pup-nose": "#5B3A29",
    "--pup-eye": "#3E5C76",
    "--pup-blush": "#F4A8A0",
    "--fx-heart": "#FF7A93",
    "--fx-heart-light": "#FFC2CF",
    "--fx-zzz": "#8FA8E8",
    "--fx-spark": "#FFE9A8",
    "--bubble-bg": "#FFFDF7",
    "--bubble-text": "#5A3B27",
    "--shadow": "rgba(90,59,39,0.18)"
}

def rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"

def main():
    parser = argparse.ArgumentParser(description="Extract palette tokens from image")
    parser.add_argument("--image", required=True, help="Path to master image")
    args = parser.parse_args()

    img_path = Path(args.image)
    if not img_path.is_absolute():
        img_path = WORKSPACE / img_path

    if not img_path.exists():
        print(f"Image not found at {img_path}, using defaults")
        tokens = DEFAULT_FALLBACKS.copy()
    else:
        print(f"Extracting palette from {img_path}...")
        img = Image.open(img_path).convert("RGBA")
        # Filter out green background (#00FF00) and transparent pixels
        pixels = []
        for r, g, b, a in img.getdata():
            if a > 128:
                # Green excess check
                if not (g > r + 30 and g > b + 30):
                    pixels.append((r, g, b))

        if len(pixels) < 100:
            print("Warning: too few non-green pixels, using defaults")
            tokens = DEFAULT_FALLBACKS.copy()
        else:
            # Sort pixels by brightness
            pixels.sort(key=lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])
            n = len(pixels)

            # Assign color roles by distribution
            darkest = pixels[int(n * 0.02)]
            fur_shadow = pixels[int(n * 0.25)]
            fur_base = pixels[int(n * 0.55)]
            fur_light = pixels[int(n * 0.85)]

            tokens = DEFAULT_FALLBACKS.copy()
            tokens["--pup-outline"] = rgb_to_hex(*darkest)
            tokens["--pup-nose"] = rgb_to_hex(*pixels[int(n * 0.05)])
            tokens["--pup-fur-shadow"] = rgb_to_hex(*fur_shadow)
            tokens["--pup-fur-base"] = rgb_to_hex(*fur_base)
            tokens["--pup-fur-light"] = rgb_to_hex(*fur_light)
            tokens["--pup-ear"] = rgb_to_hex(*fur_shadow)

    out_data = {
        "version": 1,
        "source": str(img_path.relative_to(WORKSPACE) if img_path.is_relative_to(WORKSPACE) else img_path),
        "method": "quantile-clustering",
        "tokens": tokens
    }

    PALETTE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PALETTE_PATH, "w", encoding="utf-8") as f:
        json.dump(out_data, f, indent=2)

    print(f"Wrote palette tokens to {PALETTE_PATH}")

if __name__ == "__main__":
    main()
