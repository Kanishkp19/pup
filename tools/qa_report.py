#!/usr/bin/env python3
"""
tools/qa_report.py
Generates QA metric reports, contact sheets, and GIF previews.
CLI:
  python tools/qa_report.py [--anim <NAME>] [--judge]
"""

import json
import argparse
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

WORKSPACE = Path(__file__).resolve().parent.parent
SPEC_PATH = WORKSPACE / "assets" / "spec" / "animations.spec.json"
PROCESSED_DIR = WORKSPACE / "assets" / "processed"
QA_DIR = WORKSPACE / "assets" / "qa"
REPORTS_DIR = QA_DIR / "reports"
SHEETS_DIR = QA_DIR / "contact_sheets"

CANVAS_PX = 384
BASELINE_Y = 356

def evaluate_frame(img: Image.Image, prev_img: Image.Image = None) -> dict:
    np_img = np.array(img)
    alpha = np_img[:, :, 3] / 255.0
    r = np_img[:, :, 0]
    g = np_img[:, :, 1]
    b = np_img[:, :, 2]

    total_pixels = CANVAS_PX * CANVAS_PX
    opaque_pixels = np.sum(alpha > 0.1)
    alpha_coverage = float(opaque_pixels / total_pixels)

    # Bbox border touch (margin < 8px)
    margin = 8
    border_touch = bool(
        np.any(alpha[:margin, :] > 0.1) or
        np.any(alpha[-margin:, :] > 0.1) or
        np.any(alpha[:, :margin] > 0.1) or
        np.any(alpha[:, -margin:] > 0.1)
    )

    # Green spill ratio: pixels with G > R + 15 and G > B + 15
    green_spill_mask = (g > r + 15) & (g > b + 15) & (alpha > 0.1)
    green_spill_ratio = float(np.sum(green_spill_mask) / max(opaque_pixels, 1))

    # Baseline error
    rows = np.any(alpha > 0.1, axis=1)
    if np.any(rows):
        bottom_y = np.where(rows)[0][-1]
        baseline_err = abs(int(bottom_y) - BASELINE_Y)
    else:
        baseline_err = 999

    # Area ratio to prev
    area_ratio = 1.0
    if prev_img is not None:
        prev_alpha = np.array(prev_img)[:, :, 3] / 255.0
        prev_opaque = np.sum(prev_alpha > 0.1)
        if prev_opaque > 0:
            area_ratio = float(opaque_pixels / prev_opaque)

    reasons = []
    if alpha_coverage < 0.08 or alpha_coverage > 0.55:
        reasons.append("alphaCoverage out of [0.08, 0.55]")
    if border_touch:
        reasons.append("bboxTouchesBorder")
    if green_spill_ratio > 0.002:
        reasons.append(f"greenSpillRatio > 0.002 ({green_spill_ratio:.4f})")
    if baseline_err > 12:
        reasons.append(f"baselineErrorPx > 12 ({baseline_err})")
    if area_ratio < 0.65 or area_ratio > 1.55:
        reasons.append(f"areaRatioToPrev out of range ({area_ratio:.2f})")

    return {
        "alphaCoverage": round(alpha_coverage, 4),
        "bboxTouchesBorder": border_touch,
        "greenSpillRatio": round(green_spill_ratio, 5),
        "areaRatioToPrev": round(area_ratio, 3),
        "baselineErrorPx": baseline_err,
        "pass": len(reasons) == 0,
        "reasons": reasons
    }

def process_qa(anim_spec: dict):
    name = anim_spec["name"]
    frames_count = anim_spec.get("frames", 1)
    fps = anim_spec.get("fps", 6)
    proc_dir = PROCESSED_DIR / name

    frame_files = [proc_dir / f"{name}_{k:02d}.png" for k in range(frames_count)]
    if not any(f.exists() for f in frame_files):
        return

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    SHEETS_DIR.mkdir(parents=True, exist_ok=True)

    report_frames = []
    images = []
    prev_img = None

    for k, f in enumerate(frame_files):
        if f.exists():
            img = Image.open(f).convert("RGBA")
            images.append(img)
            metrics = evaluate_frame(img, prev_img)
            metrics["frame"] = k
            report_frames.append(metrics)
            prev_img = img
        else:
            report_frames.append({"frame": k, "pass": False, "reasons": ["missing_file"]})

    # Save JSON report
    report_data = {
        "animation": name,
        "framesCount": frames_count,
        "allPass": all(rf["pass"] for rf in report_frames),
        "frames": report_frames
    }
    with open(REPORTS_DIR / f"{name}.json", "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    # Save GIF preview if frames exist
    if images:
        duration_ms = int(1000 / max(1, fps))
        images[0].save(
            SHEETS_DIR / f"{name}.gif",
            save_all=True,
            append_images=images[1:],
            duration=duration_ms,
            loop=0,
            disposal=2
        )

    # Save contact sheet
    if images:
        cols = min(6, len(images))
        rows = (len(images) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * 192, rows * 192), (240, 240, 240, 255))
        draw = ImageDraw.Draw(sheet)

        for idx, img in enumerate(images):
            c = idx % cols
            r = idx // cols
            thumb = img.resize((192, 192), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (c * 192, r * 192), thumb)
            draw.text((c * 192 + 6, r * 192 + 6), f"F{idx}", fill=(60, 60, 60, 255))
            if not report_frames[idx]["pass"]:
                draw.rectangle([c * 192, r * 192, (c + 1) * 192 - 1, (r + 1) * 192 - 1], outline=(220, 40, 40, 255), width=3)

        sheet.save(SHEETS_DIR / f"{name}.png", "PNG")

    status = "PASS" if report_data["allPass"] else "FAIL"
    print(f"QA report for {name}: {status}")

def main():
    parser = argparse.ArgumentParser(description="Generate QA reports and contact sheets")
    parser.add_argument("--anim", help="Animation name")
    parser.add_argument("--judge", action="store_true", help="Run AI judge")
    args = parser.parse_args()

    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        spec = json.load(f)

    animations = spec.get("animations", [])
    if args.anim:
        animations = [a for a in animations if a["name"] == args.anim]

    for a in animations:
        process_qa(a)

if __name__ == "__main__":
    main()
