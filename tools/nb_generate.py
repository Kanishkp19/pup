#!/usr/bin/env python3
"""
tools/nb_generate.py
Calls Google Gemini API (Nano Banana) to generate animation frames.
CLI:
  python tools/nb_generate.py --anim <NAME> [--frame <N>] [--candidates <N>] [--mode frame|strip] [--force] [--dry-run]
"""

import os
import io
import json
import argparse
from pathlib import Path
from PIL import Image

WORKSPACE = Path(__file__).resolve().parent.parent
PROMPTS_DIR = WORKSPACE / "assets" / "prompts" / "generated"
RAW_DIR = WORKSPACE / "assets" / "raw"

def parse_prompt_file(prompt_file: Path):
    header = {}
    body_lines = []
    is_body = False

    with open(prompt_file, "r", encoding="utf-8") as f:
        for line in f:
            if is_body:
                body_lines.append(line)
            elif line.startswith("---"):
                is_body = True
            elif line.startswith("#"):
                parts = line[1:].strip().split(":", 1)
                if len(parts) == 2:
                    header[parts[0].strip()] = parts[1].strip()

    return header, "".join(body_lines).strip()

def generate_frame(prompt_file: Path, force: bool = False, dry_run: bool = False):
    header, prompt_text = parse_prompt_file(prompt_file)
    out_rel = header.get("output", "")
    if not out_rel:
        print(f"Skipping {prompt_file.name}: no output in header")
        return

    out_path = WORKSPACE / out_rel
    if out_path.exists() and not force:
        print(f"Target {out_rel} already exists (use --force to overwrite)")
        return

    refs_str = header.get("refs", "")
    ref_paths = [r.strip() for r in refs_str.split("|") if r.strip()]

    print(f"Generating {out_rel}...")
    print(f"  Refs: {ref_paths}")

    if dry_run:
        print("  [Dry-run] Prompt preview:")
        print("  " + prompt_text[:120].replace("\n", " ") + "...")
        return

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("  GEMINI_API_KEY environment variable not set. Please set it or use agent image generation.")
        return

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        model_id = os.environ.get("NANO_BANANA_MODEL", "gemini-2.5-flash-image")

        ref_images = []
        for r in ref_paths:
            rp = WORKSPACE / r
            if rp.exists():
                ref_images.append(Image.open(rp))
            else:
                print(f"  Warning: ref image {r} not found")

        contents = [*ref_images, prompt_text]
        config = types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio="1:1"),
        )

        resp = client.models.generate_content(
            model=model_id,
            contents=contents,
            config=config,
        )

        # Extract generated image bytes
        for part in resp.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                img_data = part.inline_data.data
                img = Image.open(io.BytesIO(img_data))
                out_path.parent.mkdir(parents=True, exist_ok=True)
                img.save(out_path, "PNG")
                print(f"  Saved to {out_path}")
                break
    except Exception as e:
        print(f"  Generation failed: {e}")

def main():
    parser = argparse.ArgumentParser(description="Generate frames via Gemini API")
    parser.add_argument("--anim", required=True, help="Animation name")
    parser.add_argument("--frame", type=int, help="Specific frame index (0-based)")
    parser.add_argument("--candidates", type=int, default=1, help="Number of candidates")
    parser.add_argument("--mode", choices=["frame", "strip"], default="frame")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    parser.add_argument("--dry-run", action="store_true", help="Show prompts without calling API")
    args = parser.parse_args()

    anim = args.anim
    if args.frame is not None:
        prompt_file = PROMPTS_DIR / f"{anim}_{args.frame:02d}.prompt.txt"
        if not prompt_file.exists():
            print(f"Prompt file not found: {prompt_file}")
            return
        generate_frame(prompt_file, force=args.force, dry_run=args.dry_run)
    else:
        prompt_files = sorted(PROMPTS_DIR.glob(f"{anim}_*.prompt.txt"))
        if not prompt_files:
            print(f"No prompt files found for animation: {anim}")
            return
        for pf in prompt_files:
            generate_frame(pf, force=args.force, dry_run=args.dry_run)

if __name__ == "__main__":
    main()
