#!/usr/bin/env python3
"""
tools/log_generation.py
Appends an entry to assets/qa/generation_log.jsonl
CLI:
  python tools/log_generation.py --file <PROMPT_FILE> [--qa pass|fail|pending]
"""

import os
import json
import hashlib
import argparse
from pathlib import Path
from datetime import datetime, timezone

WORKSPACE = Path(__file__).resolve().parent.parent
LOG_PATH = WORKSPACE / "assets" / "qa" / "generation_log.jsonl"

def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser(description="Log image generation call")
    parser.add_argument("--file", required=True, help="Path to prompt file")
    parser.add_argument("--qa", choices=["pass", "fail", "pending"], default="pending")
    args = parser.parse_args()

    prompt_path = Path(args.file)
    if not prompt_path.is_absolute():
        prompt_path = WORKSPACE / prompt_path

    if not prompt_path.exists():
        print(f"Prompt file not found: {prompt_path}")
        return

    # Parse prompt header
    output_path = ""
    refs = []
    anim = ""
    frame = 0
    attempt = 1

    with open(prompt_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("# output:"):
                output_path = line.split(":", 1)[1].strip()
            elif line.startswith("# refs:"):
                refs = [r.strip() for r in line.split(":", 1)[1].split("|")]
            elif line.startswith("# animation:"):
                parts = line.split()
                try:
                    anim_idx = parts.index("animation:")
                    anim = parts[anim_idx + 1]
                    frame_idx = parts.index("frame:")
                    frame = int(parts[frame_idx + 1])
                    attempt_idx = parts.index("attempt:")
                    attempt = int(parts[attempt_idx + 1])
                except Exception:
                    pass
            elif line.startswith("---"):
                break

    log_entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "animation": anim,
        "frame": frame,
        "attempt": attempt,
        "model": os.environ.get("NANO_BANANA_MODEL", "gemini-2.5-flash-image"),
        "promptSha256": compute_sha256(prompt_path),
        "refImages": refs,
        "output": output_path,
        "qa": args.qa,
        "qaReasons": []
    }

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")

    print(f"Logged generation for {anim} frame {frame} to {LOG_PATH}")

if __name__ == "__main__":
    main()
