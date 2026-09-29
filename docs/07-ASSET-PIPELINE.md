# PUPPY — Asset Pipeline (Nano Banana → sprites)

> How every pixel of the puppy is generated, cleaned, verified and wired to code **without drift**.
> Sources of truth: `assets/spec/animations.spec.json`, `assets/spec/character.bible.json`, `assets/reference/master_reference.png`. Contracts (file names, manifest, logs): `05-DATA-AND-IPC-CONTRACT.md → 7–8`.

## 1. Principles

1. **Spec drives everything.** Prompts, runtime manifest, TypeScript types, placeholders and validators are all generated from one spec file. If it isn't in the spec, it doesn't exist.
2. **Identity is anchored by reference images, not by words.** Every generation call includes the approved master images for that camera. Text only describes the *pose*.
3. **One style-lock block**, stored once in `character.bible.json`, prefixes every prompt. Never retype it.
4. **The model makes poses; code makes polish.** Hearts, Zzz, shadows, bubbles, squash/stretch, hops, blinks-as-overlays are code. Fewer generated frames = fewer chances to drift (116 MVP frames total).
5. **Raw output is sacred and immutable.** Processing is deterministic and re-runnable offline.
6. **Humans approve at gates.** The pipeline surfaces contact sheets and GIF previews; the user says yes/no.
7. **Be honest about the model.** Image models do not guarantee pixel-identical characters. Consistency comes from references + uniform prompts + QA + retries + gates. Expect ~20–30% of frames to need a retry; side views drift most.

## 2. Two ways to call Nano Banana (choose at Gate G0)

| Path | When | How |
|---|---|---|
| **A. Antigravity built-in image generation** (Nano Banana Pro / Nano Banana 2 — whichever your Antigravity offers) | Default if the agent can generate images | For each `assets/prompts/generated/*.prompt.txt`, the agent calls its image tool with the prompt body and attaches the header's `refs`; saves to the header's `output` path; then runs `python tools/log_generation.py --file <prompt file>` |
| **B. Gemini API script** `tools/nb_generate.py` | If A is unavailable, or for unattended batches | `GEMINI_API_KEY` in `.env`; `NANO_BANANA_MODEL` (verify the current image-model id in Google's docs; previously `gemini-3-pro-image-preview` for Nano Banana Pro and `gemini-2.5-flash-image` for the original Nano Banana). Logs automatically |

Both paths consume the **same prompt files**, so results are comparable and reproducible. At Gate G0 generate one test image (`idle_sit_00`) with the chosen path and show it to the user.

Prompt file format (generated, committed):
```
# output: assets/raw/walk/walk_03.png
# refs: assets/approved/master/master_side_right.png | assets/approved/master/master_front.png | assets/raw/walk/walk_02.png
# aspect: 1:1
# size: 1K
# animation: walk  frame: 3  of: 6  attempt: 1
---
<full prompt text>
```

## 3. Phase A — model sheet (Gate G1)

Input: `assets/reference/master_reference.png` (user's puppy). Generate four images into `assets/approved/master/` (candidates first in `assets/raw/_model_sheet/`, promote after approval). Each call attaches the reference image.

Prompts (the style lock is injected where `{STYLE_LOCK}` appears):

- **master_front.png** — `Using the attached reference image as the absolute identity truth, redraw this exact character as a clean game-asset frame: sitting upright facing the camera, neutral gentle closed-mouth smile, eyes open, ears relaxed, tail curled resting beside the body. {STYLE_LOCK}`
- **master_three_quarter.png** — same, with `three-quarter view, the character turned toward the viewer's right, sitting upright`. Attach reference + `master_front.png`.
- **master_side_right.png** — `pure side view, standing on all four paws, facing the viewer's right, head up, neutral smile, tail up in a soft curve.` Attach reference + `master_front.png`.
- **expressions_sheet.png** — *(exception to "one character")* `A 3×3 grid on a flat pure green #00FF00 background showing the SAME character in nine expressions: happy, sad, surprised, sleepy, kiss, eyes-closed bliss, tongue-out, scared, curious. Same style, same scale in every cell, cells separated by clear empty space.` Attach reference + `master_front.png`.

Then the agent must:
1. Inspect the reference and the approved images for **left/right asymmetry** (uneven markings, one darker ear, off-centre patch). Report and set `character.bible.json → symmetry.mirror_ok` to `true|false` only after the user confirms. If `false`, add `walk_left`, `run_left`, `stand_idle_left`, … variants to the spec (`mirrorable: false`) — this roughly doubles side-view frames.
2. Run `tools/extract_palette.py` → `assets/spec/palette.json`; show the swatches.
3. Present all of this as a review artifact and **stop** (Gate G1). Nothing else is generated before approval.

## 4. Prompt assembly (`gen_from_spec.py`)

For animation `A`, frame `k` (0-based) the prompt body is:

```
{STYLE_LOCK}

REFERENCES: image 1 = the character's identity truth for this camera; image 2 = a second identity check;
{if k > 0: "image 3 = the previous approved frame of this same animation: keep the identical scale, framing, horizontal centring and feet height."}

SHOT: animation "{A.name}", frame {k+1} of {A.frames}. {CAMERA_TEXT[A.camera]}
POSE: {A.frame_descriptions[k]}
CONTINUITY: Same size, same screen position and same outline thickness as the references. Change ONLY what POSE describes. Do not add props, text, shadows or effects.
AVOID: {negative_list joined by "; "}
```

`CAMERA_TEXT`: `front` → "Straight-on front view at eye level."; `three_quarter_right` → "Three-quarter view, the character turned toward the viewer's right."; `side_right` → "Pure side view, the character facing the viewer's right."

Reference selection: `character.bible.json → camera_refs[A.camera]` (max 3 images per call, including the previous-frame image). For `k > 0` the previous image is the **raw approved** frame (green background), not the processed one, so framing matches.

For animations that must start/end in the neutral pose (all Sit-front ones), frame 0's description already says so; if drift is seen, add `assets/raw/idle_sit/idle_sit_00.png` as the third reference for frame 0.

## 5. Generation procedure per animation

1. `npm run assets:spec` (regenerates prompts if the spec changed).
2. Generate frames **in order** `00 … n-1` (sequential, `NB_CONCURRENCY` ≤ 2 across *different* animations, never parallel within one).
3. Default `--candidates 2`: generate two candidates per frame, run the QA metrics on both, keep the better one in `raw/<anim>/`, park the other in `raw/_candidates/` (git-ignored). Use `--candidates 1` for speed once the pipeline is stable.
4. If QA fails: auto-retry up to `NB_MAX_RETRIES` with a reason-specific suffix appended to the prompt:

| QA reason | Suffix added |
|---|---|
| `green_spill` | "The character must have NO green tint anywhere; fur is warm golden and cream." |
| `too_small` / `too_large` | "The character must fill about 70% of the canvas height." / "Leave more empty space around the character." |
| `border_touch` | "Leave at least 8% empty margin on all four sides; do not crop any body part." |
| `fur_drift` | "Match fur, ear and eye colours of image 1 exactly." |
| `identity_judge_fail` | "Match the face, eyes and ears of image 1 exactly; do not restyle the character." |
| `area_jump` | "Keep the same body size as image 3." |

5. After 3 failed attempts the frame is marked `needs_human` in the QA report and generation continues.
6. **Fallback `--mode strip`** for stubborn animations: one call produces the whole animation as an `n × 1` row of frames on green with equal spacing; the tool slices by connected components and names files normally. Identity within the animation is often better; position drift must be corrected by the normaliser. Use only when per-frame mode fails twice.
7. Every attempt appends a line to `assets/qa/generation_log.jsonl`.

Approximate volume: 116 MVP frames × ≈ 1.6 attempts × 2 candidates ≈ 370 image calls (≈ 190 with `--candidates 1`), plus ≈ 10 for the model sheet. Batch by gate: G2 set first (idle_sit, look_×4, stand_idle, sit_down, stand_up, walk, run = 30 frames), then the rest in the batches B2–B4 listed in `06 → Phase 6` (B1 = 30 frames, B2 = 32, B3 = 32, B4 = 22; total 116).

## 6. Background and chroma key

- Generated on flat **pure green `#00FF00`**. No green anywhere on the puppy (style lock and negative list say so). Code-drawn FX avoid the issue for hearts/tongue-pink confusion; props avoid green too.
- **V2 TV prop:** screen area is generated as solid magenta `#FF00FF`; `process_props.py` detects the magenta bbox, records it as `screenRect` in the manifest, and keys it to transparent so canvas video can be drawn behind it.
- Fallback if keying is poor for a frame: `rembg` (optional dev dependency, off by default) — never used silently; the report shows which frames used it.

## 7. Processing (`tools/process_frames.py`) — exact algorithm

For each `raw/<anim>/<anim>_NN.png` (RGBA/RGB → float32):

1. **Key:** `g_excess = G − max(R, B)`; `alpha = 1 − clamp((g_excess − 20) / 70, 0, 1)`. (Golden/cream fur has `G < R`, so it is untouched.)
2. **Despill:** where `alpha > 0`, set `G = min(G, max(R, B))`.
3. **Clean:** remove connected components smaller than 0.15% of the image; fill alpha holes smaller than 0.05%; erode alpha by 1 px (3×3 min blended 50%) to kill green fringes.
4. **Measure:** alpha bbox, opaque area, alpha-weighted centroid x.
5. **Scale (per animation, one factor for all its frames):**
   - non-`preserve_motion`: `s = target_height_px / median(bbox heights)`;
   - `preserve_motion`: `s = target_height_px / bbox height of frame 0`.
6. **Place on a 384×384 transparent canvas:**
   - non-`preserve_motion`: each frame independently → bbox bottom at `y = 356`, centroid x at `192`;
   - `preserve_motion`: frame 0 is placed that way, and **every other frame gets the same offset** as frame 0 (relative motion is preserved). Clamp so nothing leaves the canvas; if clamping is needed, report `motion_clamped`.
7. Save `assets/processed/<anim>/<anim>_NN.png` (RGBA, premultiplication off, sRGB).

Then `pack_strips.py` concatenates frames left→right into `public/assets/sprites/<anim>.png`, computes per-frame alpha bboxes, resolves `frameMs` (from `fps` and spec `frame_ms` overrides), and writes `public/assets/animations.json` (+ `specSha256`).

## 8. QA gates (`tools/qa_report.py`, run by `npm run assets:qa`)

Automatic metrics per frame (thresholds are defaults in `tools/qa_config.json`):

| Metric | Pass condition |
|---|---|
| `alphaCoverage` | 0.08 – 0.55 of canvas |
| `bboxTouchesBorder` | false (≥ 8 px margin) |
| `greenSpillRatio` | ≤ 0.002 of opaque pixels with `G > R+15 and G > B+15` |
| `furDeltaE` | ≤ 8 (CIE76 between mean Lab of fur-like pixels and `--pup-fur-base`) |
| `areaRatioToPrev` | 0.65 – 1.55 (0.5 – 2.0 for `preserve_motion`) |
| `baselineErrorPx` | ≤ 6 for non-`preserve_motion` |
| `loopSeamDeltaE` (looping anims) | last→first mean difference ≤ 2.5× the median adjacent-frame difference |
| `identity_judge` *(optional, `--judge`)* | a Gemini vision model compares the frame with `master_front.png` and returns `{sameCharacter: boolean, differences: string[]}`; must be `true` |

Human review artifacts (always produced): `assets/qa/contact_sheets/<anim>.png` (frames in a labelled grid on a checkerboard) and `<anim>.gif` (looping preview at the spec's fps/frameMs). Failing frames are outlined red with reasons. The agent embeds these in its review artifact at each gate.

Global checks (`validate_assets.py`, run in CI, **no network**): spec ↔ prompts ↔ manifest ↔ strips ↔ `src/generated/animations.ts` agree (names, frame counts, fps, camera, dimensions 384×384 per frame, RGBA); `specSha256` matches; every MVP animation has strips (V2 allowed to be absent); no orphan files in `sprites/`; palette tokens all present.

## 9. Repository hygiene

- `.gitattributes`: `assets/raw/** filter=lfs diff=lfs merge=lfs -text` (Git LFS), plus `*.psd`. `assets/raw/_candidates/` and `assets/raw/_model_sheet/` are git-ignored.
- Commit: `assets/spec/*`, `assets/prompts/generated/*`, `assets/approved/*`, `assets/processed/*`, `public/assets/**`, `assets/qa/reports/*.json`, `assets/qa/generation_log.jsonl`.
- Regenerate one frame: `npm run assets:generate -- --anim walk --frame 3 --force` then `npm run assets:build`.
- Changing the spec's pose text invalidates only frames whose `promptSha256` changed (the tool lists them; it never regenerates silently).
- Changing the reference or the approved master images = a **new character version**: bump `character.bible.json → version`, regenerate everything, and re-run all gates.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Face/eyes differ from reference | Reference not attached or wrong camera refs | Check the prompt header `refs`; add `expressions_sheet.png` as a ref; try `--mode strip` |
| Puppy size jumps between frames | Model ignoring continuity | Ensure image 3 (previous raw frame) is attached; append `area_jump` suffix; normaliser fixes residual size |
| Green fringes | Keying threshold too tight on antialiased edge | Raise despill strength (`--despill 1.0`) or erode 2 px for that anim in `qa_config.json` |
| Background not pure green (gradient/vignette) | Model added lighting | Retry; suffix "flat solid pure green background, no vignette" |
| Mirrored walk looks wrong | Asymmetric markings | Set `mirror_ok=false`, add `_left` animations |
| Loop pops at the seam | Frame n-1 not similar to frame 0 | Regenerate frame n-1 with frame 0 attached as image 3 |
| Model refuses / returns text | Safety or prompt wording | Simplify pose text; keep prompt purely descriptive; retry |
| Rate limit / 429 | Too many calls | Lower `NB_CONCURRENCY`; backoff is automatic |

## 11. Tool CLI reference (implement exactly)

| Script | CLI | Output |
|---|---|---|
| `gen_from_spec.py` | `python tools/gen_from_spec.py [--check]` | prompts, `src/generated/animations.ts`, `src-tauri/src/generated_consts.rs`, `src/shared/palette.css`, `src/generated/palette.ts`, `tools/expected_files.json`; `--check` exits 1 if outputs are stale |
| `make_placeholders.py` | `python tools/make_placeholders.py` | labelled coloured placeholder strips + manifest for **all** animations (clearly watermarked "PLACEHOLDER", never mistaken for real art); real strips overwrite them |
| `nb_generate.py` | `--anim NAME [--frame N] [--candidates N] [--mode frame\|strip] [--force] [--dry-run]` | `assets/raw/…`, log lines |
| `log_generation.py` | `--file PROMPT_FILE [--qa pending]` | appends to the generation log (used by path A) |
| `process_frames.py` | `[--anim NAME]` | `assets/processed/…` |
| `pack_strips.py` | `[--anim NAME]` | strips + manifest |
| `qa_report.py` | `[--anim NAME] [--judge]` | reports, contact sheets, GIFs; exit 1 if any frame fails |
| `extract_palette.py` | `--image assets/approved/master/master_front.png` | `assets/spec/palette.json` |
| `validate_assets.py` | `--tier placeholder\|mvp\|v2` | exit 1 on any mismatch |

`nb_generate.py` core call (verify parameter names against the current `google-genai` SDK docs before use):
```python
from google import genai
from google.genai import types
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
resp = client.models.generate_content(
    model=os.environ.get("NANO_BANANA_MODEL", "gemini-3-pro-image-preview"),
    contents=[*ref_images_as_PIL, prompt_text],          # refs first, then text
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="1:1"),
    ),
)
# save the first inline image part to the output path (never overwrite without --force)
```
