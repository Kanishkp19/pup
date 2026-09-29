#!/usr/bin/env python3
"""
tools/validate_assets.py
Validates asset integrity, spec sha256 agreement, strip dimensions, and alpha channels.
Usage:
  python tools/validate_assets.py [--tier placeholder|mvp|v2]
"""

import sys
import json
import hashlib
import argparse
from pathlib import Path
from PIL import Image

WORKSPACE = Path(__file__).resolve().parent.parent
SPEC_PATH = WORKSPACE / "assets" / "spec" / "animations.spec.json"
MANIFEST_PATH = WORKSPACE / "public" / "assets" / "animations.json"
SPRITES_DIR = WORKSPACE / "public" / "assets" / "sprites"
EXPECTED_PATH = WORKSPACE / "tools" / "expected_files.json"

def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser(description="Validate assets")
    parser.add_argument("--tier", choices=["placeholder", "mvp", "v2"], default="placeholder",
                        help="Tier of assets to validate (default: placeholder)")
    args = parser.parse_args()

    errors = []
    print(f"=== Validating assets (tier: {args.tier}) ===")

    # 1. Spec & Manifest SHA256 check
    if not SPEC_PATH.exists():
        errors.append(f"Spec file missing: {SPEC_PATH}")
        sys.exit(1)

    spec_sha256 = compute_sha256(SPEC_PATH)

    if not MANIFEST_PATH.exists():
        errors.append(f"Manifest missing: {MANIFEST_PATH}")
    else:
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            manifest_sha = manifest.get("specSha256", "")
            if manifest_sha != spec_sha256:
                errors.append(f"Manifest specSha256 mismatch! Manifest: {manifest_sha[:8]}..., Spec: {spec_sha256[:8]}...")
        except Exception as e:
            errors.append(f"Failed to read manifest: {e}")

    # 2. Check Expected Files
    if not EXPECTED_PATH.exists():
        errors.append(f"tools/expected_files.json missing; run npm run assets:spec")
        expected_tiers = {}
    else:
        with open(EXPECTED_PATH, "r", encoding="utf-8") as f:
            expected_data = json.load(f)
            expected_tiers = expected_data.get("tiers", {})

    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        spec = json.load(f)

    animations = spec.get("animations", [])
    anim_map = {a["name"]: a for a in animations}

    # Filter animations by tier
    if args.tier == "mvp":
        target_anims = [a for a in animations if a.get("priority", "mvp") == "mvp"]
    elif args.tier == "v2":
        target_anims = animations
    else: # placeholder
        target_anims = animations

    print(f"Validating {len(target_anims)} animation strips...")

    for a in target_anims:
        name = a["name"]
        frames = a.get("frames", 1)
        expected_w = frames * 384
        expected_h = 384

        strip_file = SPRITES_DIR / f"{name}.png"
        if not strip_file.exists():
            errors.append(f"Missing sprite strip: {strip_file.relative_to(WORKSPACE)}")
            continue

        try:
            with Image.open(strip_file) as img:
                if img.format != "PNG":
                    errors.append(f"{name}.png is format {img.format}, expected PNG")
                if img.mode != "RGBA":
                    errors.append(f"{name}.png is mode {img.mode}, expected RGBA")
                if img.size != (expected_w, expected_h):
                    errors.append(f"{name}.png dimensions {img.size} != expected ({expected_w}, {expected_h})")

                # Alpha channel check
                alpha = img.split()[-1]
                extrema = alpha.getextrema()
                if extrema[1] == 0:
                    errors.append(f"{name}.png is completely transparent (empty)!")
        except Exception as e:
            errors.append(f"Error inspecting {name}.png: {e}")

        # If checking raw/processed frames in real art tiers
        if args.tier in ("mvp", "v2"):
            for k in range(frames):
                raw_f = WORKSPACE / f"assets/raw/{name}/{name}_{k:02d}.png"
                proc_f = WORKSPACE / f"assets/processed/{name}/{name}_{k:02d}.png"
                if not raw_f.exists():
                    errors.append(f"Missing raw frame: {raw_f.relative_to(WORKSPACE)}")
                if not proc_f.exists():
                    errors.append(f"Missing processed frame: {proc_f.relative_to(WORKSPACE)}")

    if errors:
        print(f"\nFAILED with {len(errors)} errors:")
        for err in errors[:20]:
            print(f"  ❌ {err}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more errors.")
        sys.exit(1)
    else:
        print(f"\n✅ All {len(target_anims)} assets passed validation!")
        sys.exit(0)

if __name__ == "__main__":
    main()
