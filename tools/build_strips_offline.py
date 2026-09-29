#!/usr/bin/env python3
"""
tools/build_strips_offline.py

Rebuilds EVERY sprite strip in public/assets/sprites/ from the real AI-generated
art that already exists in the repo (no API needed):

  assets/raw/idle_sit/idle_sit_00.png          canonical front sit (identity truth)
  assets/approved/master/master_side_right.png canonical side stand
  assets/approved/master/expressions_sheet.png 3x3 real expression faces
  assets/approved/master/master_front.png      front sit (model sheet)

Frames are composed per animation recipe:
  - whole-body transforms anchored at the baseline (bounce / sway / squash)
  - real generated faces composited over the head for expressions and blinks
  - procedural eyelids for the half-blink frame
then packed into horizontal 384x384/frame strips, and
public/assets/animations.json is regenerated (same schema as pack_strips.py).

Usage:
  python3 tools/build_strips_offline.py            # rebuild everything
  python3 tools/build_strips_offline --anim walk   # rebuild one animation
"""

import os
import sys
import json
import hashlib
import math
from pathlib import Path

# Self-heal: re-exec with the project venv if PIL/numpy are missing
try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    venv = Path(__file__).resolve().parent.parent / ".venv" / "bin" / "python3"
    if venv.exists():
        os.execv(str(venv), [str(venv), *sys.argv])
    raise

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_frames import key_and_despill  # official green-key algorithm

WORKSPACE = Path(__file__).resolve().parent.parent
SPEC_PATH = WORKSPACE / "assets" / "spec" / "animations.spec.json"
PROCESSED_DIR = WORKSPACE / "assets" / "processed"
SPRITES_DIR = WORKSPACE / "public" / "assets" / "sprites"
MANIFEST_PATH = WORKSPACE / "public" / "assets" / "animations.json"
QA_DIR = WORKSPACE / "assets" / "qa" / "reports"

CANVAS = 384
BASELINE = 356
CENTER_X = 192

RAW_IDLE = WORKSPACE / "assets/raw/idle_sit/idle_sit_00.png"
MASTER_FRONT = WORKSPACE / "assets/approved/master/master_front.png"
MASTER_SIDE = WORKSPACE / "assets/approved/master/master_side_right.png"
EXPR_SHEET = WORKSPACE / "assets/approved/master/expressions_sheet.png"

# expressions sheet grid: row0: happy, sad, surprised | row1: sleepy, kiss, bliss
#                          row2: tongue, scared, curious
EXPR_CELLS = {
    "happy": (0, 0), "sad": (0, 1), "surprised": (0, 2),
    "kiss": (1, 1), "bliss": (1, 2),
    "tongue": (2, 0), "scared": (2, 1), "curious": (2, 2),
}

FRONT_TARGET_H = 300   # idle_sit spec target_height_px
SIDE_TARGET_H = 260    # stand-ish side target (walk/run rescale in recipes)


# ----------------------------------------------------------------------------
# Loading / keying / normalising
# ----------------------------------------------------------------------------

def key_image(path: Path) -> Image.Image:
    """Green-key an AI image into an RGBA PIL image (full resolution)."""
    im = Image.open(path).convert("RGBA")
    a = np.array(im).astype(np.float32) / 255.0
    rgba = key_and_despill(a)
    rgba = clean_alpha(rgba)
    return Image.fromarray((rgba * 255.0).astype(np.uint8), "RGBA")


def clean_alpha(rgba: np.ndarray) -> np.ndarray:
    """Remove tiny specks and harden the matte a little (like process_frames)."""
    alpha = rgba[:, :, 3]
    hard = np.where(alpha > 0.85, 1.0, np.where(alpha < 0.08, 0.0, alpha))
    rgba[:, :, 3] = hard
    return rgba


def alpha_bbox(im: Image.Image):
    a = np.array(im)[:, :, 3]
    op = a > 10
    if not op.any():
        return (0, 0, im.width, im.height)
    ys, xs = np.where(op)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def normalize(im: Image.Image, target_h: float) -> Image.Image:
    """Scale so content height == target_h, bottom-center at (192, 356)."""
    x0, y0, x1, y1 = alpha_bbox(im)
    w, h = x1 - x0, y1 - y0
    s = target_h / h
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    content = im.crop((x0, y0, x1, y1)).resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.alpha_composite(content, (CENTER_X - nw // 2, BASELINE - nh))
    return out


# ----------------------------------------------------------------------------
# Face compositing (real generated heads over the neutral body)
# ----------------------------------------------------------------------------

HEAD_CUT_FRAC = 0.47   # head region = top 47% of content height
FEATHER = 26           # px of alpha ramp at the neck cut


def head_region(im: Image.Image) -> Image.Image:
    """Crop the head (top portion) with a feathered bottom edge, full canvas size."""
    x0, y0, x1, y1 = alpha_bbox(im)
    cut = y0 + int((y1 - y0) * HEAD_CUT_FRAC)
    head = im.copy()
    a = np.array(head)
    ramp_start = cut - FEATHER
    for y in range(max(0, ramp_start), cut):
        a[y, :, 3] = (a[y, :, 3].astype(np.float32) * (cut - y) / FEATHER).astype(np.uint8)
    a[cut:, :, 3] = 0
    return Image.fromarray(a, "RGBA")


def with_face(base: Image.Image, expr: Image.Image) -> Image.Image:
    out = base.copy()
    out.alpha_composite(head_region(expr))
    return out


def detect_eyes(im: Image.Image):
    """Eyes = blue iris pixels (B > R). Returns [(cx, cy, w, h), ...] sorted by x."""
    a = np.array(im).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    iris = (b - r > 25) & (al > 120)
    ys, xs = np.where(iris)
    eyes = []
    for side in (xs < CENTER_X, xs >= CENTER_X):
        sy, sx = ys[side], xs[side]
        if len(sx) < 30:
            continue
        # trim outliers (antialias specks)
        keep = np.ones(len(sx), bool)
        for arr, lo, hi in ((sx, 5, 95), (sy, 5, 95)):
            plo, phi = np.percentile(arr, lo), np.percentile(arr, hi)
            keep &= (arr >= plo) & (arr <= phi)
        sx, sy = sx[keep], sy[keep]
        if len(sx) < 20:
            continue
        cx, cy = float(sx.mean()), float(sy.mean())
        w = max(10.0, float(np.percentile(sx, 95) - np.percentile(sx, 5)))
        h = max(10.0, float(np.percentile(sy, 95) - np.percentile(sy, 5)))
        eyes.append((cx, cy, w, h))
    eyes.sort(key=lambda e: e[0])
    return eyes


def half_closed_eyes(im: Image.Image, eyes) -> Image.Image:
    """Draw fur-coloured upper eyelids over both eyes (half blink)."""
    out = im.copy()
    d = ImageDraw.Draw(out)
    for (cx, cy, w, h) in eyes:
        ex0, ey0 = cx - w / 2, cy - h / 2
        ex1, ey1 = cx + w / 2, cy + h / 2
        # sample fur just above the eye
        sx, sy = int(cx), max(0, int(ey0 - 8))
        fur = out.getpixel((sx, sy))
        fur = (fur[0], fur[1], fur[2], 255)
        d.pieslice((ex0, ey0, ex1, ey1), 180, 360, fill=fur)
        d.arc((ex0, ey0, ex1, ey1), 180, 360, fill=(122, 74, 43, 255), width=2)
    return out


# ----------------------------------------------------------------------------
# Transforms (baseline-anchored so feet stay planted)
# ----------------------------------------------------------------------------

def tf(src: Image.Image, dx=0, dy=0, rot=0.0, sx=1.0, sy=1.0,
       pivot=(CENTER_X, BASELINE)) -> Image.Image:
    out = src
    if (sx, sy) != (1.0, 1.0):
        nw, nh = max(1, int(round(CANVAS * sx))), max(1, int(round(CANVAS * sy)))
        scaled = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
        scaled.alpha_composite(out.resize((nw, nh), Image.LANCZOS))
        out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        out.alpha_composite(scaled, (int(round(CENTER_X - nw // 2 + dx)), int(round(pivot[1] - nh + dy))))
        return out
    if rot:
        out = out.rotate(rot, resample=Image.BICUBIC, center=pivot)
    if dx or dy:
        moved = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        moved.alpha_composite(out, (int(round(dx)), int(round(dy))))
        out = moved
    return out


def hop(k: int, n: int, amp: float) -> float:
    """|sin| bounce offset for frame k of n (0 at endpoints)."""
    return -abs(math.sin(k * math.pi / max(1, n))) * amp


# ----------------------------------------------------------------------------
# Recipes: name -> list of (source_variant, transform kwargs)
# Sources: F = front neutral sit, S = side stand,
#          Fh = happy, Fs = sad, Fsu = surprised, Fk = kiss, Fb = bliss,
#          Ft = tongue, Fsc = scared, Fc = curious,
#          Fe = half-closed-eyelid front, B = sleep ball (bliss, curled)
# ----------------------------------------------------------------------------

def recipes():
    R = {}

    # --- idle (breathing + real blink via bliss face + half-blink eyelids) ---
    R["idle_sit"] = [
        ("F", {}),
        ("F", dict(sy=1.015, dy=-4)),                    # inhale
        ("F", dict(dx=3, dy=-2)),                        # ear twitch / tiny shift
        ("Fe", {}),                                      # half blink
        ("Fb", {}),                                      # full blink (closed happy arcs)
        ("F", dict(dx=2, dy=0)),                         # tiny head tilt right
    ]

    # --- glances: shift only the head region ---
    def look(name, dx=0, dy=0):
        R[name] = [("F", {}), ("Flook", dict(dx=dx, dy=dy))][1:]

    R["look_left"] = [("Flook", dict(dx=-6))]
    R["look_right"] = [("Flook", dict(dx=6))]
    R["look_up"] = [("Flook", dict(dy=-5))]
    R["look_down"] = [("Flook", dict(dy=4))]

    # --- side locomotion ---
    R["stand_idle"] = [("S", {}), ("S", dict(dy=-2))]
    R["sit_down"] = [("S", {}), ("S", dict(sy=0.93, dy=6)), ("S", dict(sy=0.84, dy=10))]
    R["stand_up"] = [("S", dict(sy=0.84, dy=10)), ("S", dict(sy=0.93, dy=6)), ("S", {})]
    R["walk"] = [("S", dict(dy=hop(k, 6, 5), rot=2 * math.sin(k * math.pi / 3)))
                 for k in range(6)]
    R["run"] = [("S", dict(dy=hop(k, 6, 9), rot=3 + 3 * math.sin(k * math.pi / 3),
                           sx=1.02, sy=0.98))
                for k in range(6)]

    # --- emotions (front, real faces) ---
    R["happy"] = [("Fh", dict(dy=hop(k, 4, 12))) for k in range(4)]
    R["excited"] = [("Fh", dict(dy=hop(k, 6, 16), rot=3 * math.sin(k * math.pi / 1.5)))
                    for k in range(6)]
    R["petting"] = [("Fb", dict(rot=-3, dy=-2)), ("Fb", dict(rot=3, dy=-4)),
                    ("Fb", dict(rot=-3, dy=-2)), ("Fb", dict(rot=2, dy=-1))]
    R["kiss"] = [("Fk", dict(dy=-3, sx=1.02)), ("Fk", dict(dy=-7, sx=1.04)),
                 ("Fk", dict(dy=-9, sx=1.05)), ("Fk", dict(dy=-5, sx=1.02)),
                 ("Fk", {})]
    R["surprised"] = [("Fsu", dict(dy=-6, sx=1.04)), ("Fsu", dict(dy=-9, sx=1.06)),
                      ("Fsu", {})]
    R["sad"] = [("Fs", dict(rot=-2, dy=4, sy=0.98)), ("Fs", dict(rot=-1, dy=6, sy=0.97)),
                ("Fs", dict(rot=-2, dy=4, sy=0.98))]
    R["curious"] = [("Fc", dict(rot=-5, dy=-2)), ("Fc", dict(rot=-7, dy=-3)),
                    ("Fc", dict(rot=-4, dy=-1))]
    R["scared"] = [("Fsc", dict(dx=-3, sy=0.92)), ("Fsc", dict(dx=3, sy=0.90)),
                   ("Fsc", dict(dx=-2, sy=0.92))]
    R["bored_sigh"] = [("F", {}), ("F", dict(sy=0.97, dy=5)),
                       ("F", dict(sy=0.95, dy=8)), ("F", {})]
    R["bark"] = [("Fsu", dict(dy=-5, sx=1.03)), ("Fsu", dict(dy=-8, rot=-3, sx=1.04)),
                 ("Fsu", dict(dy=-2))]
    R["yawn"] = [("Fb", dict(sy=1.03, dy=-4)), ("Fb", dict(sy=1.06, dy=-8)),
                 ("Fb", dict(sy=1.08, dy=-10)), ("Fb", dict(sy=1.04, dy=-5)),
                 ("Fb", {})]
    R["sneeze"] = [("Fsu", dict(rot=-4, dy=3)), ("Fsu", dict(rot=-6, dy=5)),
                   ("Fsu", dict(rot=6, dy=-8, sx=1.06)), ("Fsu", dict(rot=1, dy=0))]
    R["paw_reach"] = [("F", {}), ("F", dict(dx=8, dy=-8, rot=-6)),
                      ("F", dict(dx=12, dy=-12, rot=-8)), ("F", dict(dx=6, dy=-4, rot=-3))]

    # --- funny / actions ---
    R["roll_over"] = [("F", dict(rot=0, dy=0)), ("F", dict(rot=28, dy=5, dx=10)),
                      ("F", dict(rot=56, dy=9, dx=16)), ("F", dict(rot=28, dy=5, dx=10)),
                      ("F", dict(rot=-8, dy=1, dx=-6)), ("F", {})]
    R["trip"] = [("S", dict(rot=8, dy=6)), ("S", dict(rot=18, dy=14)),
                 ("S", dict(rot=32, dy=24)), ("S", dict(rot=20, dy=12)),
                 ("S", dict(rot=6, dy=2))]
    R["drag"] = [("F", dict(rot=-6, dy=-2)), ("F", dict(rot=-2, dy=-6))]
    R["scratch_ear"] = [("F", dict(rot=-4, dy=-2)), ("F", dict(rot=-7, dy=-4, dx=2)),
                        ("F", dict(rot=-4, dy=-1)), ("F", dict(rot=-7, dy=-4, dx=2)),
                        ("F", dict(rot=-3, dy=-1)), ("F", {})]
    R["stretch"] = [("S", {}), ("S", dict(rot=5, sy=1.05, sx=0.97)),
                    ("S", dict(rot=8, sy=1.07, sx=0.95, dy=4)),
                    ("S", dict(rot=5, sy=1.05, sx=0.97)), ("S", {})]

    # --- sleep ---
    R["sleep_down"] = [("Fb", dict(rot=2, sy=0.95)), ("Fb", dict(rot=5, sy=0.85, dy=10)),
                       ("Fb", dict(rot=8, sy=0.74, dy=18)), ("B", dict(dy=4))]
    R["sleep_loop"] = [("B", dict(sy=1.0)), ("B", dict(sy=1.03)),
                       ("B", dict(sy=1.05, dy=-2)), ("B", dict(sy=1.02))]
    R["wake_up"] = [("B", dict(dy=4)), ("Fb", dict(rot=5, sy=0.85, dy=10)),
                    ("F", {})]

    # --- v2-ish ---
    R["dance"] = [("Fh", dict(rot=-8, dy=-8)), ("Fh", dict(rot=0, dy=-14)),
                  ("Fh", dict(rot=8, dy=-8)), ("Fh", dict(rot=0, dy=-14)),
                  ("Fh", dict(rot=-8, dy=-8)), ("Fh", dict(rot=0, dy=-12))]
    R["chase_tail"] = [("F", dict(rot=45 * k, pivot=(CENTER_X, 216), dy=6))
                       for k in range(8)]
    R["tv_watch"] = [("Flook", dict(dx=6)), ("Flook", dict(dx=6, dy=-1)),
                     ("Fb", dict(dx=6)), ("Flook", dict(dx=6))]
    R["tv_laugh"] = [("Fh", dict(dy=-4)), ("Fh", dict(dy=-9, sy=1.02)),
                     ("Fh", dict(dy=-4)), ("Fh", dict(dy=-9, sy=1.02))]
    R["hungry"] = [("Ft", dict(rot=3, dy=4)), ("Ft", dict(rot=4, dy=6)),
                   ("Ft", dict(rot=3, dy=4))]
    R["bone_sniff"] = [("S", dict(rot=6, dy=5)), ("S", dict(rot=9, dy=8, dx=-3)),
                       ("S", dict(rot=9, dy=8, dx=3)), ("S", dict(rot=6, dy=5)),
                       ("S", {})]
    R["ball_pounce"] = [("S", dict(sy=0.90)), ("S", dict(dy=-18, sy=1.05)),
                        ("S", dict(dy=-28, sy=1.08)), ("S", dict(dy=-14)),
                        ("S", dict(sy=0.88, dy=2))]

    return R


# ----------------------------------------------------------------------------
# Build
# ----------------------------------------------------------------------------

def build_sources():
    print("Keying + normalising source art ...")
    F = normalize(key_image(RAW_IDLE), FRONT_TARGET_H)
    F2 = normalize(key_image(MASTER_FRONT), FRONT_TARGET_H)
    S = normalize(key_image(MASTER_SIDE), SIDE_TARGET_H)

    sheet = key_image(EXPR_SHEET)
    sw, sh = sheet.size
    cw, ch = sw // 3, sh // 3
    faces = {}
    for name, (r, c) in EXPR_CELLS.items():
        cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        faces[name] = normalize(cell, FRONT_TARGET_H)

    # sanity: neutral face from masters should match raw idle closely
    srcs = {
        "F": F, "S": S,
        "Fh": with_face(F, faces["happy"]),
        "Fs": with_face(F, faces["sad"]),
        "Fsu": with_face(F, faces["surprised"]),
        "Fk": with_face(F, faces["kiss"]),
        "Fb": with_face(F, faces["bliss"]),
        "Ft": with_face(F, faces["tongue"]),
        "Fsc": with_face(F, faces["scared"]),
        "Fc": with_face(F, faces["curious"]),
        "Fe": None,   # filled below (half-closed eyelids)
        "Flook": None,
        "B": None,    # sleep ball
    }
    eyes = detect_eyes(F)
    print(f"  eyes detected: {[(round(e[0]), round(e[1])) for e in eyes]}")
    if len(eyes) == 2:
        srcs["Fe"] = half_closed_eyes(F, eyes)
    else:
        srcs["Fe"] = with_face(F, faces["bliss"])
        print("  ! eye detection failed, half-blink uses bliss face")

    # glance = neutral body with only the head region shifted
    def glance(dx, dy):
        head = head_region(F)
        moved = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        moved.alpha_composite(head, (dx, dy))
        out = F.copy()
        out.alpha_composite(moved)
        return out

    srcs["Flook"] = F  # placeholder; per-anim below uses transforms on F with head shift
    srcs["_glance"] = glance

    # sleep ball: bliss face, curled (squashed) — built at idle scale then rescaled
    ball = tf(with_face(F, faces["bliss"]), rot=10, sx=1.10, sy=0.62, dy=2)
    # re-normalise ball to sleep_loop target height 190
    x0, y0, x1, y1 = alpha_bbox(ball)
    content = ball.crop((x0, y0, x1, y1))
    s = 190.0 / (y1 - y0)
    nw, nh = max(1, int(content.width * s)), max(1, int(content.height * s))
    content = content.resize((nw, nh), Image.LANCZOS)
    B = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    B.alpha_composite(content, (CENTER_X - nw // 2, BASELINE - nh))
    srcs["B"] = B
    return srcs


def frame_variant(srcs, variant):
    if variant == "Flook":
        return srcs["F"]  # glances handled per-recipe below
    return srcs[variant]


def main(only=None):
    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        spec = json.load(f)
    anims = {a["name"]: a for a in spec["animations"]}

    R = recipes()
    srcs = build_sources()
    glance = srcs.pop("_glance")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {
        "version": 1, "canvas": CANVAS, "baseline": BASELINE,
        "centerX": CENTER_X, "display": 192, "window": 256,
        "feetYLogical": 242,
        "specSha256": hashlib.sha256(SPEC_PATH.read_bytes()).hexdigest(),
        "animations": {},
    }

    built = 0
    for name, a in anims.items():
        if only and name != only:
            continue
        recipe = R.get(name)
        if recipe is None:
            print(f"  !! no recipe for {name}, skipping")
            continue

        frames = []
        for i, item in enumerate(recipe):
            variant, kw = item
            if variant == "Flook":
                # head-only shift keeps the body planted
                g = glance(int(kw.get("dx", 0)), int(kw.get("dy", 0)))
                pivot = (CENTER_X, BASELINE)
                rot = kw.get("rot", 0)
                frame = g.rotate(rot, resample=Image.BICUBIC, center=pivot) if rot else g
            else:
                base = frame_variant(srcs, variant)
                kw = dict(kw)
                frame = tf(base, **kw)
            frames.append(frame)

        n = a.get("frames", len(frames))
        while len(frames) < n:
            frames.append(frames[-1])
        frames = frames[:n]

        # save processed frames + pack strip
        pdir = PROCESSED_DIR / name
        pdir.mkdir(parents=True, exist_ok=True)
        strip = Image.new("RGBA", (CANVAS * n, CANVAS), (0, 0, 0, 0))
        bboxes = []
        for k, fr in enumerate(frames):
            fr.save(pdir / f"{name}_{k:02d}.png")
            strip.alpha_composite(fr, (k * CANVAS, 0))
            bboxes.append(list(alpha_bbox(fr)))
        strip_path = SPRITES_DIR / f"{name}.png"
        strip.save(strip_path, "PNG", optimize=True)

        fps = a.get("fps", 6)
        fms_map = a.get("frame_ms", {})
        default_ms = int(round(1000.0 / fps)) if fps > 0 else 167
        resolved = [int(fms_map.get(str(i), default_ms)) for i in range(n)]

        manifest["animations"][name] = {
            "strip": f"sprites/{name}.png",
            "frames": n, "frameWidth": CANVAS, "frameHeight": CANVAS,
            "fps": fps, "loop": bool(a.get("loop", False)),
            "frameMs": resolved, "camera": a.get("camera", "front"),
            "mirrorable": bool(a.get("mirrorable", True)),
            "bbox": bboxes, "soundCue": a.get("soundCue", None),
        }
        built += 1
        print(f"  ✅ {name}: {n} frames")

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nBuilt {built} strips → {SPRITES_DIR.relative_to(WORKSPACE)}")
    print(f"Manifest → {MANIFEST_PATH.relative_to(WORKSPACE)}")

    # QA contact sheet + GIF previews for the key animations
    try:
        make_qa(manifest)
    except Exception as e:
        print("  (QA previews skipped:", e, ")")


def make_qa(manifest):
    names = sorted(manifest["animations"].keys())
    cols = 8
    rows = (len(names) + cols - 1) // cols
    cell = 160
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (255, 255, 255, 255))
    for i, nm in enumerate(names):
        im = Image.open(SPRITES_DIR / f"{nm}.png").convert("RGBA")
        f0 = im.crop((0, 0, CANVAS, CANVAS)).resize((cell - 8, cell - 8), Image.LANCZOS)
        sheet.alpha_composite(f0, ((i % cols) * cell + 4, (i // cols) * cell + 4))
    sheet.convert("RGB").save(QA_DIR / "contact_offline.png")
    print(f"QA contact sheet → {QA_DIR.relative_to(WORKSPACE)}/contact_offline.png")

    for nm in ("idle_sit", "walk", "happy"):
        meta = manifest["animations"][nm]
        im = Image.open(SPRITES_DIR / f"{nm}.png").convert("RGBA")
        frames = [im.crop((k * CANVAS, 0, (k + 1) * CANVAS, CANVAS)).resize((192, 192), Image.LANCZOS)
                  for k in range(meta["frames"])]
        frames[0].save(QA_DIR / f"preview_{nm}.gif", save_all=True,
                       append_images=frames[1:], duration=meta["frameMs"], loop=0)
    print("GIF previews → idle_sit, walk, happy")


if __name__ == "__main__":
    arg = None
    if "--anim" in sys.argv:
        arg = sys.argv[sys.argv.index("--anim") + 1]
    main(arg)
