# PUPPY — Master Agent Prompt

> **Read this file first.** Then read every document listed below before writing any code. This file is written for Google Antigravity (Gemini agent) but works with any coding agent.
> Put a copy of this file in the workspace rules (`.agent/rules/puppy.md`, or wherever your Antigravity version keeps workspace rules) so it is loaded in every session.

---

## 0. Assumptions (stated explicitly)

| # | Assumption |
|---|-----------|
| A1 | Product name **PUPPY**; the default pet name is **Biscuit** (user-renamable). |
| A2 | Platforms: **Windows 10/11 (x64)** and **macOS 12+ (Apple Silicon + Intel)**. Linux is out of scope. |
| A3 | The character is the user's reference image at `assets/reference/master_reference.png`. **If that file is missing, STOP and ask the user for it.** |
| A4 | All raster art is generated with **Nano Banana** (Google's Gemini image model) following `07-ASSET-PIPELINE.md`. |
| A5 | No cloud, no accounts, no telemetry, no network calls at runtime. Only the asset *tooling* calls the Gemini API. |
| A6 | Sound effects ship as synthesized placeholders first, drop-in CC0 files later. |
| A7 | Solo developer, MVP first, V2 later. |

## 1. What we are building

PUPPY is a tiny cartoon puppy that lives on the desktop, in a transparent, borderless, always-on-top window that moves around the screen. It watches the cursor, chases it, gets petted, gives kisses, sleeps, yawns, trips over its own paws, and generally feels alive. It is **lightweight** (idle RAM 50–120 MB, idle CPU ≈ 0–2%), **local-first**, and cute-first. Every feature must answer: *"Does this make the puppy feel more alive?"*

## 2. Tech stack (non-negotiable)

- **Shell:** Tauri 2.x (Rust, stable toolchain). macOS needs `macOSPrivateApi` for transparent windows.
- **Frontend:** TypeScript (strict), Vite, **vanilla TS + Canvas 2D**. No React, no UI framework, no WebGL in V1.
- **Persistence:** `tauri-plugin-store` (JSON files in the OS app-data dir). No database.
- **Plugins:** `tauri-plugin-autostart`, `tauri-plugin-global-shortcut`, tray icon (`tray-icon` feature).
- **Tests:** Vitest (frontend logic), `cargo test` (Rust kinematics/settings), `tools/validate_assets.py` (assets).
- **Asset tooling:** Python 3.11+ (`pillow`, `numpy`, `google-genai`, `scikit-image`), run from `tools/`.
- **CI/Release:** GitHub Actions + `tauri-apps/tauri-action` (Windows + macOS matrix).

## 3. The Consistency Contract (most important section)

The user's top requirement is that **code and generated images never drift apart**. Enforce this chain:

```
assets/spec/animations.spec.json      <-- the ONLY place animation names, frame counts, fps,
        │                                  loop flags, timings, cameras, and per-frame poses are defined
        ├─► tools/gen_from_spec.py
        │      ├─► assets/prompts/generated/<anim>_<NN>.prompt.txt   (image prompts)
        │      ├─► src/generated/animations.ts                       (AnimationName union + metadata)
        │      ├─► public/assets/animations.json                     (runtime manifest)
        │      └─► tools/expected_files.json                         (validator expectations)
        ▼
assets/raw → process_frames.py → assets/processed → pack_strips.py → public/assets/sprites/<anim>.png
        ▼
tools/validate_assets.py  (fails CI if spec ≠ files ≠ manifest)
```

Rules:

1. **Never hard-code an animation name, frame count, fps or timing** anywhere in TypeScript or Rust. Import from `src/generated/animations.ts`.
2. **Never edit `src/generated/*` or `public/assets/animations.json` by hand.** Change the spec and re-run `npm run assets:spec`.
3. **Character identity comes only from** the reference image, the four approved master images in `assets/approved/master/`, and `assets/spec/character.bible.json` (`style_lock`). Every image prompt starts with the same `style_lock` text, injected by `gen_from_spec.py`, never retyped.
4. **Colours** come only from `assets/spec/palette.json` (derived from the approved master image by `tools/extract_palette.py`). Code-drawn FX (hearts, Zzz, bubbles) use those tokens. The UI CSS variables are generated from the same file.
5. **Raw model output is never edited.** Only `process_frames.py` derives `processed/` from `raw/`. `npm run assets:build` must be reproducible with no network.
6. **Placeholders first.** `tools/make_placeholders.py` renders labelled placeholder sprites from the spec, so all code is built and tested before any real art exists. Swapping in real art must require **zero code changes**.
7. If a change requires editing the spec, the change list must be in the commit message (`spec: add sneeze frame 4`).

## 4. Document map (read in this order)

1. `01-PRD.md` — what to build, for whom, acceptance criteria, user stories.
2. `02-TRD.md` — architecture, folder tree, packages, config files, perf budgets.
3. `03-APP-FLOW.md` — behaviour state machine, cursor/pointer interaction rules, menus, settings window.
4. `04-UI-UX-ART-BIBLE.md` — visual style, palette rules, FX specs, settings UI tokens, audio design.
5. `05-DATA-AND-IPC-CONTRACT.md` — settings/state schemas, Tauri commands & events, manifest schemas.
6. `06-IMPLEMENTATION-PLAN.md` — phases, atomic tasks, verification commands, prompts to paste, human gates.
7. `07-ASSET-PIPELINE.md` — Nano Banana workflow, prompts, chroma-key processing, QA gates.
8. `assets/spec/animations.spec.json` and `assets/spec/character.bible.json` — machine-readable sources of truth.

## 5. Folder structure to scaffold first

```
puppy/
├── .agent/rules/puppy.md                  ← copy of this file
├── .github/workflows/{ci.yml,release.yml}
├── docs/                                  ← the 00–07 markdown files
├── assets/
│   ├── reference/master_reference.png     ← USER PROVIDED
│   ├── spec/{animations.spec.json,character.bible.json,palette.json}
│   ├── approved/master/{master_front,master_three_quarter,master_side_right,expressions_sheet}.png
│   ├── raw/<anim>/<anim>_<NN>.png         ← untouched model output (git-lfs or ignored, see 07)
│   ├── processed/<anim>/<anim>_<NN>.png   ← keyed, normalised 384×384
│   ├── props/{ball,bone,tv,bed}.png
│   ├── prompts/generated/                 ← committed, auto-generated
│   └── qa/{contact_sheets/,reports/,generation_log.jsonl}
├── tools/
│   ├── requirements.txt
│   ├── gen_from_spec.py  nb_generate.py  log_generation.py  process_frames.py
│   ├── pack_strips.py  qa_report.py  extract_palette.py  make_placeholders.py
│   └── validate_assets.py  expected_files.json(generated)
├── public/assets/{animations.json,sprites/,audio/,props/}
├── index.html            ← pet window
├── settings.html         ← settings window
├── src/
│   ├── generated/animations.ts            ← GENERATED
│   ├── shared/{types.ts,constants.ts,math.ts}
│   ├── pet/
│   │   ├── main.ts  app.ts  ipc.ts  config.ts
│   │   ├── render/{renderer.ts,sprite-cache.ts,animator.ts,shadow.ts}
│   │   ├── behavior/{engine.ts,states.ts,needs.ts,personalities.ts,rng.ts}
│   │   ├── input/{cursor.ts,pointer.ts,gestures.ts}
│   │   ├── physics/{kinematics.ts,gravity.ts}
│   │   ├── fx/{particles.ts,hearts.ts,zzz.ts,emotes.ts,bubble.ts}
│   │   └── audio/{audio.ts,synth.ts,audio.manifest.json}
│   └── settings/{main.ts,form.ts,settings.css}
├── src-tauri/
│   ├── Cargo.toml  build.rs  tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/{main.rs,lib.rs,commands.rs,cursor.rs,window.rs,kinematics.rs,settings.rs,state.rs,tray.rs,shortcuts.rs}
├── tests/{engine.test.ts,animator.test.ts,gestures.test.ts,kinematics.test.ts}
├── package.json  tsconfig.json  vite.config.ts  vitest.config.ts
└── README.md
```

## 6. Agent operating rules

**Code**

1. Read the relevant doc section before writing any file. Cite it in your plan artifact (`03-APP-FLOW.md → Section 3.4`).
2. Behaviour logic (`src/pet/behavior/*`, `gestures.ts`, `kinematics.ts`) must be **pure and deterministic given a seeded RNG** so it is unit-testable. No `Date.now()` or `Math.random()` inside them; inject a clock and RNG.
3. Rust owns: window position/size/click-through, global cursor polling, tray, autostart, shortcuts, persistence. TypeScript owns: behaviour, rendering, audio, FX.
4. IPC uses only the commands/events in `05-DATA-AND-IPC-CONTRACT.md`. Adding one means updating that doc in the same commit.
5. Idle efficiency is a feature: no `requestAnimationFrame` loop while the pet is sleeping or hidden (use the low-power scheduler in `02-TRD.md → 8`).
6. TypeScript strict, no `any`, no unused exports. Rust: `clippy -D warnings`.
7. After each phase run: `npm run typecheck && npm run test && npm run assets:validate && cargo test --manifest-path src-tauri/Cargo.toml`.
8. Commit once per phase minimum, message format `phase-N: summary`.

**Images (Nano Banana)**

9. Generate images **only** via the workflow in `07-ASSET-PIPELINE.md`, using prompts produced by `gen_from_spec.py`. Do not write ad-hoc prompts.
10. Use the newest Nano Banana model available in your environment (built-in Antigravity image generation, or the Gemini API via `tools/nb_generate.py`). Always save results to the exact `assets/raw/<anim>/<anim>_<NN>.png` path and log with `tools/log_generation.py`.
11. Always pass reference images exactly as `character.bible.json → camera_refs` says. Never generate a frame without them.
12. **Do not draw or SVG-hand-craft the puppy.** If image generation is unavailable, keep placeholders and report it; do not improvise art.
13. **Human approval gates are mandatory** (see section 8). Stop and present a review artifact at each gate.

## 7. Build command sequence

```bash
# Phase 0–1
npm create tauri-app@latest .   # vanilla-ts template, then restructure to section 5
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r tools/requirements.txt
npm run assets:spec              # gen_from_spec.py
npm run assets:placeholders      # make_placeholders.py  (no API needed)
npm run tauri dev                # runs with placeholder art
# Phase 5+ (real art)
npm run assets:generate -- --anim idle_sit      # nb_generate.py
npm run assets:build                            # process + pack + validate (offline)
# Phase 9
npm run tauri build
```

`package.json` scripts required: `dev`, `build`, `typecheck`, `test`, `lint`, `assets:spec`, `assets:placeholders`, `assets:generate`, `assets:build`, `assets:validate`, `assets:qa`, `tauri`.

## 8. Human approval gates

| Gate | When | What you present | Continue only after |
|------|------|------------------|---------------------|
| G0 | Phase 0 | Which model/tool will generate images (Antigravity built-in vs Gemini API key) and the test image | User confirms it works |
| G1 | End of Phase 5 | Model sheet (`master_front`, `master_three_quarter`, `master_side_right`, `expressions_sheet`) + your mirror-symmetry finding + derived `palette.json` | User says "approved" |
| G2 | After `idle_sit`, `look_*`, `walk`, `run` | QA contact sheets + short looping preview in the running app | User says "approved" |
| G3 | After each remaining MVP batch | Contact sheets + QA report | User says "approved" or lists frames to redo |
| G4 | Phase 9 | Perf report vs budgets + release build | User accepts |

## 9. Definition of Done (MVP)

- [ ] Transparent, borderless, always-on-top puppy window on Windows and macOS; no dock/taskbar icon; tray icon present.
- [ ] Click-through everywhere except on the puppy's body.
- [ ] Puppy walks/runs across the bottom of the work area, sits, sleeps, wakes, and returns to idle without visual pops.
- [ ] Eyes/head track the cursor (`look_*`); notices, follows and chases per `03-APP-FLOW.md`.
- [ ] Petting, kissing (click face), click reaction, double-click excitement, drag/pick-up/drop, right-click menu all work.
- [ ] ≥ 5 random funny behaviours fire with cooldowns (yawn, scratch_ear, stretch, sneeze, roll_over) plus trip while running.
- [ ] Hearts, Zzz, speech bubbles, ground shadow are code-drawn from `palette.json`.
- [ ] Sound with volume/mute and per-sound cooldowns.
- [ ] Settings window persists everything in `05-DATA-AND-IPC-CONTRACT.md → 1`; start-with-system works.
- [ ] All 116 MVP frames exist, pass `assets:validate` and `assets:qa`, and were approved at gates G1–G3.
- [ ] Idle budgets met (see `02-TRD.md → 8`); sleeping pet shows ≈0% CPU.
- [ ] `npm run typecheck && npm run test && npm run assets:validate && cargo test` all green.
- [ ] Signed-or-unsigned installers built for both platforms via CI; README documents the unsigned-app warnings.
