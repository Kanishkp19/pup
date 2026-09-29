# PUPPY — Technical Requirements Document

> Assumptions: `00-MASTER-PROMPT.md → 0`. Types and IPC contracts live in `05-DATA-AND-IPC-CONTRACT.md` (single source; do not duplicate).
> Version policy: use the **latest stable release within the stated major** at scaffold time and pin the exact version in `package.json` / `Cargo.lock`. If a newer major of Vite/Vitest is compatible, you may use it — record the change in the phase-1 commit message.

## 1. Tech stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Desktop shell | Tauri | 2.x | Small footprint, Rust backend, system webview, Win + macOS |
| Backend | Rust | stable (≥ 1.77) | Window control, cursor polling, tray, persistence |
| Frontend language | TypeScript | ^5.6, `strict: true` | Safety without runtime cost |
| Bundler | Vite | ^6 (or newer compatible) | Multi-page (pet + settings), fast HMR |
| Rendering | Canvas 2D | — | Sufficient for sprites, lighter than WebGL, easy low-power redraw |
| Tests | Vitest ^3, `cargo test` | — | Pure logic tested headlessly |
| Persistence | `tauri-plugin-store` | 2.x | JSON in app-data dir, no DB |
| Autostart | `tauri-plugin-autostart` | 2.x | Start with system on both OSes |
| Shortcuts | `tauri-plugin-global-shortcut` | 2.x | Show/hide hotkey |
| Asset tooling | Python 3.11+ | `pillow>=10`, `numpy`, `scikit-image`, `google-genai`, `pytest` | Chroma key, QA, Gemini API |
| CI | GitHub Actions + `tauri-apps/tauri-action` | — | Windows + macOS builds |

## 2. Architecture

```
┌───────────────────────────── Rust (src-tauri) ─────────────────────────────┐
│ cursor.rs  ── global cursor poll (adaptive Hz) ──► emit "cursor://tick"     │
│ window.rs  ── pet window (transparent, click-through toggling, work area)   │
│ kinematics.rs ── move_to / drag-follow / gravity fall (owns window motion)  │
│ settings.rs / state.rs ── store plugin (settings.json, pet-state.json)      │
│ tray.rs / shortcuts.rs ── tray menu, Ctrl/Cmd+Shift+P                       │
│ commands.rs ── the IPC surface (see 05)                                     │
└──────────────▲───────────────────────────────────────────────┬─────────────┘
       invoke()│                                               │ events
┌──────────────┴───────────── WebView (pet window) ────────────▼─────────────┐
│ input/cursor.ts   ── smooths cursor, computes distance/speed/dwell          │
│ input/pointer.ts  ── DOM pointer events on the canvas (click, hold, drag)   │
│ input/gestures.ts ── petting / kiss-zone / double-click detection (pure)    │
│ behavior/engine.ts── FSM + needs + personalities + cooldowns (pure)         │
│ render/animator.ts── plays manifest animations, transitions, mirroring      │
│ render/renderer.ts── canvas draw: shadow, sprite, FX, bubble               │
│ fx/*  audio/*     ── code-drawn particles, WebAudio                        │
└─────────────────────────────────────────────────────────────────────────────┘
        ▲ reads (build-time generated)                ▲ reads
 src/generated/animations.ts                 public/assets/{animations.json,sprites/*}
```

Data flow per tick: `cursor://tick` → `input/cursor.ts` → `behavior/engine.update(dt, inputs)` → returns `{animation, facing, moveIntent, fx[], sound[]}` → animator/renderer/IPC (`move_to`) apply it.

## 3. Windowing model (critical)

**One small pet window that Rust moves** (not a full-screen overlay): full-screen overlays break on macOS Spaces/fullscreen, multi-monitor and DPI mixes.

- Logical window size = `256 × scale` square (`window_size_logical_px` in the spec). The 192-px sprite is drawn bottom-centred, leaving the top 64 px for hearts, Zzz and bubbles.
- Config: `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `resizable: false`, `skipTaskbar: true`, `shadow: false`, `focus: false`, `visibleOnAllWorkspaces: true`.
- **macOS:** `"macOSPrivateApi": true` in `tauri.conf.json` + Cargo feature `macos-private-api`; call `app.set_activation_policy(ActivationPolicy::Accessory)` (no Dock icon). Known limits: not shown over other apps' native full-screen Spaces; the private API prevents Mac App Store distribution (acceptable, documented in README).
- **Windows:** WebView2 transparent background; `WS_EX_TOOLWINDOW` behaviour is achieved by `skipTaskbar`. Not shown over exclusive-fullscreen games (documented).
- **Click-through:** default `set_ignore_cursor_events(true)`. Rust already polls the global cursor, so each tick it tests the cursor against the **hitbox** last sent by the frontend (`set_hitbox`, window-local logical px). Cursor inside hitbox → `set_ignore_cursor_events(false)` (puppy receives pointer events); outside → back to `true`. Only call the OS when the boolean changes. Add 6 px hysteresis on exit.
- **Ground line (exact):** the sprite (192 logical px) is drawn bottom-flush in the 256-px window, so its top-left is `(32, 64)`. The feet baseline sits at frame-y 356 of 384, i.e. window-y `64 + 356/384*192 = 242` logical px (at scale 1.0). `gen_from_spec.py` emits this as `FEET_Y_LOGICAL = (window - display) + baseline/canvas*display` into `src/generated/animations.ts` and into `src-tauri/src/generated_consts.rs`. Then:
  `window_y_logical = work_area_bottom_logical - FEET_Y_LOGICAL * scale` (feet exactly on the bottom edge of the work area). Convert to physical with `scaleFactor`. Implement as `kinematics.rs::ground_y()` with unit tests for scale 0.5, 1.0, 2.0 and scaleFactor 1.0, 1.5, 2.0. Use `monitor.work_area()` when available, otherwise `monitor.size - 48 px` bottom margin.
- **Multi-monitor:** puppy may be dragged between monitors; on drop it falls to the ground of the monitor under the window centre. Roaming stays on the current monitor. Settings has "Monitor" (auto/primary/N).
- **DPI:** all IPC coordinates are **physical pixels in virtual-desktop space** plus `scaleFactor` (from `get_stage`); the frontend divides by `scaleFactor` for logic in logical px.

## 4. Rendering

- Canvas size = `window logical size × devicePixelRatio`; sprites are pre-authored at 384 px (2× of the 192-logical display size) so they are crisp on 2× displays; `imageSmoothingQuality = "high"`.
- Draw order: shadow ellipse → sprite (mirrored via `ctx.scale(-1,1)` when facing left and the animation is `mirrorable`) → FX particles → speech bubble.
- Sprite strips loaded lazily with `createImageBitmap`. **Pinned core set** (never evicted): `idle_sit`, `look_*`, `stand_idle`, `walk`, `run`, `sit_down`, `stand_up`, `happy`, `petting`, `kiss`. Others live in an LRU cache capped at **48 MB decoded** (`w*h*4`). Evicted strips reload in < 30 ms from disk.
- Redraw only when something changed (frame index, position offset, active particles, bubble visible).
- Squash/stretch, bob, and landing squash are **code transforms** on the sprite (scale about the baseline anchor), not extra frames.

## 5. Behaviour engine

Pure TypeScript module, deterministic with injected `Rng` and `Clock`. Full tables in `03-APP-FLOW.md`. Public API:

```ts
export interface EngineInputs { dtMs: number; cursor: CursorInfo | null; pointer: PointerEvents; user: UserPresence; stage: StageInfo; }
export interface EngineOutput { animation: AnimationName; facing: "left"|"right"; move: MoveIntent | null; fx: FxSpawn[]; sounds: SoundCue[]; bubble: BubbleSpec | null; state: BehaviorState; }
export function createEngine(deps: { rng: Rng; settings: Settings; petState: PetState; }): { update(i: EngineInputs): EngineOutput; setSettings(s: Settings): void; snapshot(): PetState; }
```
Types are defined in `05-DATA-AND-IPC-CONTRACT.md → 4`.

## 6. Audio

WebAudio. `audio.manifest.json` maps `SoundId → { file?: string; synth: SynthPatch; cooldownMs: number; volume: number }`. If `file` is missing or fails to decode, the synth patch plays. Files are mono 128 kbps **MP3** (not Ogg — WKWebView on macOS 12 cannot decode Vorbis). One shared `AudioContext`, created on first user gesture; suspended when hidden/sleeping.

## 7. Persistence

`settings.json` and `pet-state.json` via `tauri-plugin-store` in the OS app-data dir (Windows `%APPDATA%\com.puppy.desktop`, macOS `~/Library/Application Support/com.puppy.desktop`). Schemas, defaults, migration rules: `05 → 1–2`. Pet state saves debounced every 30 s and on quit/hide/sleep.

## 8. Performance requirements and how to hit them

| Budget | Target | How |
|---|---|---|
| Idle RAM (awake) | 50–120 MB total process tree | No frameworks; ≤ 48 MB LRU + pinned set; single canvas; no DOM churn |
| Idle CPU (awake, idle animation) | ≤ 2% of one core | Redraw only on frame change (≈ 6 fps idle); logic tick 10 Hz idle |
| Sleeping CPU | ≤ 0.3% | Logic tick 2 Hz, sleep_loop at 2 fps, cursor poll 4 Hz, AudioContext suspended |
| Hidden CPU | ≈ 0% | All timers cleared; Rust cursor thread parks on a condvar |
| Active (chase/run) | ≤ 8% one core | Frame cap (default 30 fps), cursor 30 Hz, no allocations in the hot loop |
| Cold start | < 3 s to first frame | Preload only `idle_sit` strip; load others after first paint |
| Installer size | < 60 MB | PNG strips → optionally lossless WebP later; no unused plugins |

**Scheduler modes** (`render/scheduler.ts`, pure + unit-tested): `ACTIVE` (rAF gated to `fpsCap`), `IDLE` (`setTimeout` to the next frame boundary), `SLEEP` (`setTimeout` 500 ms), `HIDDEN` (nothing). Engine picks the mode from state and settings (`lowPowerMode` forces IDLE→SLEEP cadence and FPS cap 15).

Cursor poll rate (Rust): 30 Hz when cursor within 500 px of the pet or moving > 300 px/s; 10 Hz otherwise; 4 Hz sleeping; 0 hidden. Emit only when position changed.

## 9. Folder / file structure

The complete tree is in `00-MASTER-PROMPT.md → 5`. It is normative; every file listed must exist by the end of the phase that owns it (`06-IMPLEMENTATION-PLAN.md`).

## 10. Packages

**npm (runtime):** `@tauri-apps/api@^2` (invoke/event/window), `@tauri-apps/plugin-autostart@^2` (settings UI toggle → via Rust command, kept for types), nothing else. **No** UI, state, or animation libraries.

**npm (dev):** `typescript`, `vite`, `vitest`, `@tauri-apps/cli@^2`, `eslint` + `@typescript-eslint/*`, `prettier`, `@types/node`.

**Cargo:** `tauri` (features `tray-icon`, `macos-private-api`, `image-png`), `tauri-plugin-store`, `tauri-plugin-autostart`, `tauri-plugin-global-shortcut`, `serde`, `serde_json`, `parking_lot`, `log`, `env_logger`. No async runtime beyond what Tauri provides.

**Python (`tools/requirements.txt`):** `pillow`, `numpy`, `scikit-image`, `google-genai`, `python-dotenv`, `tqdm`, `pytest`.

## 11. Configuration files (copy-paste starting points)

`src-tauri/tauri.conf.json`
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "PUPPY",
  "version": "0.1.0",
  "identifier": "com.puppy.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "withGlobalTauri": false,
    "windows": [
      {
        "label": "pet", "url": "index.html", "title": "PUPPY",
        "width": 256, "height": 256,
        "transparent": true, "decorations": false, "alwaysOnTop": true,
        "resizable": false, "skipTaskbar": true, "shadow": false, "focus": false,
        "visibleOnAllWorkspaces": true, "acceptFirstMouse": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "dmg", "app"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "category": "Entertainment"
  }
}
```

`vite.config.ts` must define **two inputs** (`index.html`, `settings.html`), `server.port = 1420`, `clearScreen = false`.

`tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `target ES2022`, `moduleResolution bundler`.

`src-tauri/capabilities/default.json`: windows `["pet","settings"]`, permissions `core:default`, `core:event:default`. **Do not** enable `fs`, `shell`, `http`, `opener`, `dialog`. Window mutation happens only in Rust commands.

## 12. Environment variables (tooling only — the app itself needs none)

| Name | Type | Example | Used by |
|---|---|---|---|
| `GEMINI_API_KEY` | secret string | `AIza…` | `tools/nb_generate.py` (skip if using Antigravity's built-in image tool) |
| `NANO_BANANA_MODEL` | string | `gemini-3-pro-image-preview` | `nb_generate.py` — **verify the current model id in Google's docs; fallback `gemini-2.5-flash-image`** |
| `NB_IMAGE_SIZE` | `1K`/`2K` | `1K` | `nb_generate.py` |
| `NB_MAX_RETRIES` | int | `3` | `nb_generate.py` |
| `NB_CONCURRENCY` | int | `2` | `nb_generate.py` (keep low: character consistency and rate limits) |
| `RUST_LOG` | string | `puppy=info` | Rust |
| `APPLE_CERTIFICATE`, `APPLE_ID`, … | secrets | — | optional macOS signing/notarization in `release.yml` |

`.env.example` must list these; `.env` is git-ignored.

## 13. Error handling strategy

| Layer | Failure | Behaviour |
|---|---|---|
| Rust: store read fails / corrupt JSON | Log, rename bad file to `*.bak`, load defaults, continue |
| Rust: `cursor_position()` error | Skip tick; after 20 consecutive errors emit `app://degraded` and stop chase/notice behaviours (puppy stays cute and idle) |
| Rust: monitor list empty | Use last known stage; fall back to 1920×1080 primary |
| Frontend: strip fails to load | Log once, substitute `idle_sit`; never throw in the render loop |
| Frontend: manifest/spec mismatch | `console.error` + red debug badge in dev builds; in release, fall back to `idle_sit` |
| Audio decode fails / autoplay blocked | Fall back to synth; retry `resume()` on next user gesture |
| Behaviour engine throws | Catch at the loop boundary, reset engine to IDLE, log; never leave the puppy frozen |
| Asset tooling: API error | Exponential backoff (2 s → 30 s), resume from the log; never overwrite existing `raw/` files without `--force` |

## 14. Security & privacy checklist

- [ ] No network permission or HTTP client in the app; CSP `connect-src` limited to IPC.
- [ ] Cursor data is never persisted or logged (log only aggregate counters in debug builds).
- [ ] No `fs`/`shell`/`dialog` plugins; no remote content; no `eval`.
- [ ] Settings values validated and clamped on load (`05 → 1`).
- [ ] API keys only in `.env`, never committed; `assets/raw` may be large — see `07 → 9`.
- [ ] Release artifacts built in CI from tagged commits; unsigned-build warnings documented.
