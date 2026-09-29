# PUPPY — Implementation Plan

> Build philosophy: **code against placeholders first, swap in real art later with zero code changes.** Pure logic is written test-first. Every phase ends green (`typecheck`, `test`, `assets:validate`, `cargo test`) and committed.
> Each phase lists: entry criteria, atomic tasks (file → content → verification), exit criteria, the prompt to paste into Antigravity. Use Antigravity's **Planning mode**, review the implementation-plan artifact before each phase, and keep one agent conversation per phase.

## Cross-cutting

**Git:** `main` protected by CI; one branch per phase `phase-N-name`, squash-merge as `phase-N: summary`. Tag `v0.1.0` at the end.
**Test strategy**

| Area | Tooling | What is tested |
|---|---|---|
| Cursor metrics, gestures, look hysteresis | Vitest | Table-driven event sequences → expected gesture/look outputs |
| Behaviour engine | Vitest with seeded RNG + fake clock | State transitions, cooldowns, needs decay, personality weights, sleep/wake rules, "no sleeping pet starts chase" |
| Animator | Vitest | Frame timing (`frameMs`), loop/once, queue rules, crossfade on camera change |
| Scheduler | Vitest | Mode selection from state/settings |
| Kinematics (Rust) | `cargo test` | `ground_y` at scales/DPIs, move_to arrival, clamp into work area, gravity fall/bounce |
| Settings sanitize (Rust) | `cargo test` | Clamping, enum coercion, unknown keys, migration |
| Assets | `validate_assets.py`, `qa_report.py`, pytest for chroma key on synthetic images | Spec ↔ files ↔ manifest, key/despill correctness |
| Manual | Checklist in Phase 9 | Real Windows + macOS behaviour |

**Definition of "done" per phase** = exit criteria + all commands above green + commit.

---

## Phase 0 — Preflight (Gate G0)

Entry: repo empty; `docs/` and `assets/spec/*` copied in; reference image in `assets/reference/master_reference.png`.

Tasks
1. Verify toolchain and print versions: Node ≥ 20, Rust stable, Tauri prerequisites (Windows: MSVC Build Tools + WebView2; macOS: Xcode CLT), Python ≥ 3.11. *Verify:* `node -v && rustc -V && cargo -V && python --version`.
2. Verify `assets/reference/master_reference.png` exists and is ≥ 512 px. If missing: **stop and ask**.
3. Decide image path (A: Antigravity built-in, B: Gemini API) by generating one test image from the reference and saving it to `assets/raw/_model_sheet/g0_test.png`. Present it. *Gate G0.*
4. Create `.env.example`, `.gitignore`, `.gitattributes` (LFS rules from `07 → 9`).

Exit: user confirms the test image renders and the chosen path.

Prompt to paste:
> Read `docs/00-MASTER-PROMPT.md` and all linked docs. Do only Phase 0 from `docs/06-IMPLEMENTATION-PLAN.md`. Produce a plan artifact first. Stop at Gate G0 and show me the test image.

## Phase 1 — Scaffold, spec tooling, placeholders

Entry: G0 passed.

Tasks
1. `npm create tauri-app@latest` (vanilla-ts), then restructure to the tree in `00 → 5` (two Vite inputs). *Verify:* `npm run tauri dev` opens a window.
2. `package.json` scripts from `00 → 7`; `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, ESLint, Prettier per `02 → 11`.
3. `tools/requirements.txt`, venv instructions in README stub.
4. `tools/gen_from_spec.py`: reads the spec + bible + palette (fallbacks from `04 → 2` if `palette.json` absent) → emits everything listed in `07 → 11`. Includes `SPEC_SHA256`, resolved `frameMs`, `FEET_Y_LOGICAL`. *Verify:* running it twice yields no git diff; `--check` passes.
5. `tools/make_placeholders.py`: for every animation draw n frames (384×384) — a rounded blob with the animation name, frame index, camera icon and a "PLACEHOLDER" band, colours from palette fallbacks, blob shape varies slightly per frame so animation is visible → strips + `animations.json`. *Verify:* `npm run assets:placeholders && python tools/validate_assets.py --tier placeholder` passes.
6. `tools/validate_assets.py` implementing `05 → 8` checks; pytest for it.
7. `.github/workflows/ci.yml` (Windows + macOS matrix): checkout, Node, Rust, Python, `npm ci`, `pip install`, `npm run typecheck`, `npm run test`, `npm run assets:spec -- --check`, `python tools/validate_assets.py --tier placeholder`, `cargo test`, `cargo clippy -- -D warnings`.

Exit: CI green on a PR; placeholders visible in a dev harness page (`/dev.html`, not bundled in release) showing every animation looping with its name.

Prompt:
> Do only Phase 1. Never hard-code animation names — generate them. When finished, show me the dev harness with all placeholder animations.

## Phase 2 — Rust shell: window, cursor, kinematics, settings, tray

Entry: Phase 1 merged.

Tasks
1. `src-tauri/Cargo.toml` with plugins/features from `02 → 10`; `tauri.conf.json` and `capabilities/default.json` from `02 → 11`.
2. `settings.rs`: struct `Settings` (serde camelCase, defaults), `sanitize()`, load/save via store plugin, `.bak` on corruption. *Verify:* `cargo test settings`.
3. `state.rs`: `PetState` persist/load.
4. `window.rs`: create pet window from config; `set_window_scale` keeping feet anchored; `apply_always_on_top`; macOS activation policy Accessory; mini mode; `set_hitbox` storage.
5. `kinematics.rs`: pure functions + a `Mover` struct: `ground_y(work_area_bottom, scale, scale_factor)`, `step(dt)` for `move_to`, drag-follow, gravity fall (2400 px/s², one 25% bounce), clamp to work area. Runs at 60 Hz **only while active**, otherwise the thread parks. *Verify:* `cargo test kinematics` (scales 0.5/1/2 × scaleFactor 1/1.5/2).
6. `cursor.rs`: adaptive-rate poller using `cursor_position()`; emits `cursor://tick`; hit-test against hitbox and toggle `set_ignore_cursor_events` only on change with 6 px exit hysteresis; degraded-mode counter → `app://degraded`.
7. `commands.rs` implementing every command in `05 → 3`; `tray.rs`, `shortcuts.rs` (`CommandOrControl+Shift+P`), context menu, autostart wiring.
8. `lib.rs` wiring; `stage://changed` on monitor changes; `system://resume` where the OS exposes it (otherwise infer from a tick gap > 60 s).

Exit: with a temporary frontend that draws a magenta circle at the hitbox: window is transparent, borderless, on top, no dock/taskbar icon, clicks pass through except over the circle, can be dragged with `begin_drag/end_drag` and falls to the ground line, tray works, Ctrl/Cmd+Shift+P toggles.

Prompt:
> Do only Phase 2 (Rust). Follow `05` command/event names exactly. Add unit tests for kinematics and settings. Give me a short manual test checklist for Windows and macOS.

## Phase 3 — Renderer, animator, sprite cache (placeholders)

Tasks
1. `src/pet/ipc.ts`: typed wrappers for every command/event; failures logged, never thrown into the loop.
2. `render/sprite-cache.ts`: manifest loader (checks `specSha256`), `createImageBitmap` strips, pinned set + 48 MB LRU, `whenLoaded(name)`.
3. `render/animator.ts`: `play(name, opts)`, `queue`, frame timing from `frameMs`, once/loop, facing mirror, 120 ms crossfade on camera change, uninterruptible rules (`03 → 2.6`). Pure timing core + thin canvas layer. *Verify:* `tests/animator.test.ts`.
4. `render/renderer.ts` + `shadow.ts`: canvas sizing with DPR, draw order, redraw-on-change, sprite bottom-flush placement in the 256-px window, mirror transform.
5. `render/scheduler.ts`: ACTIVE/IDLE/SLEEP/HIDDEN modes.
6. `set_hitbox` updates from the current frame's bbox (scaled).
7. `main.ts`: boot sequence (settings → stage → manifest → preload `idle_sit` → first paint → lazy-load rest).

Exit: the placeholder puppy idles in the real window; a debug key (dev only) cycles animations; hitbox tracks the sprite; idle CPU acceptable.

## Phase 4 — Behaviour engine, input, gestures (test-first)

Tasks (write the tests from the tables in `03` first)
1. `behavior/rng.ts` (seedable), `needs.ts`, `personalities.ts` (table from `03 → 2.5`), `states.ts` (data table from `03 → 2.2`), `engine.ts` (`05 → 5` types, API in `02 → 5`).
2. `input/cursor.ts` (metrics, look hysteresis), `input/gestures.ts` (petting, spam clicks, double-click, face zone), `input/pointer.ts` (DOM events + pointer capture → begin/end drag).
3. `physics/gravity.ts` for cosmetic squash; `app.ts` main loop: tick → engine → animator/renderer/IPC/fx/audio queues.
4. Persistence: load/save `PetState` with offline decay.
5. Sleep/wake, first-run drop, mini mode, hide/show, menu actions.

Exit: with placeholders, every state in `03 → 2.2` is reachable; all tests green; 10-minute soak shows ≥ 6 distinct animations; sleeping pet CPU ≈ 0.

Prompt:
> Do only Phase 4. Write the Vitest tests from the tables in `03` before the implementation. The engine must be pure: inject RNG and clock.

## Phase 5 — Model sheet (Gate G1)

Follow `07 → 3` exactly. Deliverables: four approved master images, symmetry decision, `palette.json`, regenerated `palette.css/ts`. Present a review artifact. **Do not generate any animation frame before the user approves.**

Prompt:
> Do only Phase 5 following `docs/07-ASSET-PIPELINE.md → 3`. Use the reference image as identity truth. Stop at Gate G1 with the four images, your symmetry finding and the palette swatches.

## Phase 6 — Animations in batches (Gates G2, G3)

Tasks per batch: `npm run assets:spec` → generate frames per `07 → 5` → `npm run assets:build` → present contact sheets + GIFs + QA report → wait for approval → commit.

| Batch | Animations | Frames | Gate |
|---|---|---|---|
| B1 | `idle_sit`, `look_left`, `look_right`, `look_up`, `look_down`, `stand_idle`, `sit_down`, `stand_up`, `walk`, `run` | 30 | **G2** — user also sees them running in the real app |
| B2 | `happy`, `excited`, `petting`, `kiss`, `surprised`, `bark`, `paw_reach`, `curious` | 32 | G3 |
| B3 | `sad`, `scared`, `bored_sigh`, `yawn`, `sneeze`, `drag`, `sleep_down`, `sleep_loop`, `wake_up` | 32 | G3 |
| B4 | `scratch_ear`, `stretch`, `roll_over`, `trip` | 22 | G3 |

If the user rejects frames, regenerate only those (`--frame N --force`), update the report, re-present. If a batch reveals a systematic problem (size drift, identity drift), fix the prompt/refs in the tooling — not by hand-editing images — and regenerate the batch.

Exit: `python tools/validate_assets.py --tier mvp` passes; `npm run assets:qa` exits 0; all MVP strips replaced placeholders; app runs with real art and no code changes.

Prompt (B1):
> Do Phase 6 batch B1 only, using path {A|B} chosen at G0. Generate frames in order, one animation at a time, with 2 candidates per frame. Present contact sheets and GIFs and the QA report. Stop at Gate G2.

## Phase 7 — FX, audio, speech bubbles

Tasks
1. `fx/particles.ts` (pool of 48), `hearts.ts`, `zzz.ts`, `emotes.ts` per `04 → 5`, colours from generated palette module only.
2. `fx/bubble.ts` per `04 → 6`; bubble rules from `03 → 6`.
3. `audio/audio.ts`, `synth.ts`, `audio.manifest.json` per `04 → 8`; cooldowns; suspend/resume; mute; volume.
4. Wire `soundCue` from the manifest and engine-emitted `SoundCue`s.
5. Squash/hop/landing transforms from `04 → 4`.

Exit: petting shows hearts + purr; kiss shows big heart + "mwah"; Zzz while sleeping; bubbles obey limits; all silent when muted.

## Phase 8 — Settings window, modes, performance

Tasks
1. `settings.html`, `src/settings/{main.ts,form.ts,settings.css}` implementing `03 → 5` and `04 → 7` (accessible controls, saved tick, reset button).
2. Autostart end-to-end on both OSes; monitor selector; always-on-top; scale live-resize.
3. Low-power + FPS cap + reduce-motion behaviour (`02 → 8`, `03 → 2.5`).
4. Tray/menu state sync (`set_tray_state`).
5. Contrast unit test for UI token pairs (AA).

Exit: every setting persists across restarts and takes effect immediately; keyboard-only operation of the settings window works.

## Phase 9 — Performance, packaging, release (Gate G4)

Tasks
1. Measure against `02 → 8` on Windows and macOS (Task Manager / Activity Monitor, 5-minute samples: awake-idle, sleeping, chasing, hidden). Put numbers in `docs/PERF.md`. Fix regressions (common fixes in the table below).
2. `release.yml`: on tag `v*`, matrix `windows-latest` (NSIS `.exe`) and `macos-latest` (`--target universal-apple-darwin`, needs `rustup target add aarch64-apple-darwin x86_64-apple-darwin`) via `tauri-apps/tauri-action`, upload to a draft GitHub Release. Optional signing secrets documented; unsigned builds documented in README (Windows SmartScreen "More info → Run anyway"; macOS right-click → Open, or `xattr -dr com.apple.quarantine`).
3. Write `README.md` (use `docs/README.md` as the draft), `LICENSE`, `CHANGELOG.md`, `docs/PERF.md`.
4. Icons via `npm run tauri icon`.
5. Manual QA checklist (below).

**Manual QA checklist (each OS)**
- [ ] Fresh install → puppy drops in, bubble shows once.
- [ ] Transparent everywhere; clicks pass through outside the body (test on a busy app).
- [ ] No taskbar/dock icon; tray works; hotkey works.
- [ ] Hover-petting, face-kiss, double-click, hold-drag-drop, right-click menu.
- [ ] Chase (fast mouse), notice/look, paw-reach, scared (fast approach).
- [ ] Sleep at low energy / manual; wake on click, on return; Zzz.
- [ ] Multi-monitor drag; unplug monitor; DPI 100% and 150–200%.
- [ ] Sleep/resume laptop; hide/show; quit and relaunch keeps position and settings.
- [ ] Mute, volume, size 0.5/1/2, mini mode, low-power mode.
- [ ] Autostart on/off works after reboot.

Exit (Gate G4): budgets met, installers produced, checklist done, user accepts.

---

## Deployment checklist

- [ ] `npm run typecheck && npm run test && python tools/validate_assets.py --tier mvp && cargo test && cargo clippy -- -D warnings`
- [ ] Version bumped in `package.json`, `Cargo.toml`, `tauri.conf.json` (single commit)
- [ ] `git tag v0.1.0 && git push --tags` → CI builds → draft release → download and smoke-test both installers
- [ ] Publish release notes (features, known limitations: full-screen apps, Linux unsupported, unsigned warnings)

## Post-launch monitoring

No telemetry. Monitoring = GitHub issues template asking for OS, version, `Stage` JSON (from a hidden "Copy diagnostics" tray item, no cursor data) and performance numbers.

## Common failure points

| Symptom | Likely cause | Fix |
|---|---|---|
| Opaque black/white box on Windows | Transparent flag or WebView2 background | Ensure `transparent: true`; body/canvas background `transparent`; no CSS backgrounds |
| Opaque box on macOS | `macOSPrivateApi` missing | Set in `tauri.conf.json` and Cargo feature |
| Puppy blocks clicks everywhere | Hitbox `null`/stale or `set_ignore_cursor_events` never toggled back | Log hitbox updates; verify Rust hit-test uses logical→physical conversion |
| Puppy floats above/sinks below the taskbar | `FEET_Y_LOGICAL` or scaleFactor mishandled | Recheck `ground_y` tests; use `work_area` not monitor size |
| Jitter when dragging | Frontend driving position over IPC | Keep drag-follow in Rust (`begin_drag`) |
| High idle CPU | rAF loop running while idle | Check scheduler mode; redraw-on-change; cursor poll rate |
| Memory creep | Strips never evicted / bitmaps not closed | LRU with `bitmap.close()`; test with all animations cycled |
| Audio silent on first launch | AudioContext blocked until gesture | Resume on first pointer event; synth fallback |
| Sprites blurry on Retina | Canvas not DPR-scaled or `imageSmoothing` off | Size canvas by DPR; enable smoothing |
| Flicker between look directions | Missing hysteresis | Implement 150/250 ms rules and test |
| Validator fails after spec edit | Stale generated files | `npm run assets:spec` then `assets:build` |
