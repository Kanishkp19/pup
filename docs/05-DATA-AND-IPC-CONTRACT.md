# PUPPY — Data, IPC & Asset Contracts

> Replaces the "backend schema" of a web app. PUPPY has no server or database; its contracts are: **persisted JSON**, the **Tauri command/event surface**, and the **generated asset manifests**. Anything not listed here must not cross the Rust/TypeScript boundary.
> Conventions: JSON keys are `camelCase` (Rust uses `#[serde(rename_all = "camelCase")]`). Timestamps are epoch milliseconds. **Coordinates crossing IPC are physical pixels in virtual-desktop space**; `Stage.scaleFactor` converts to logical.

## 1. `settings.json` (Rust-authoritative)

```ts
export type Personality = "happy" | "lazy" | "chaotic" | "affectionate" | "chill";

export interface Settings {
  schemaVersion: 1;
  name: string;                         // 1–20 chars, default "Biscuit"
  personality: Personality;             // default "happy"
  scale: number;                        // 0.5–2.0, default 1.0
  alwaysOnTop: boolean;                 // default true
  startWithSystem: boolean;             // default true
  monitor: "auto" | "primary" | number; // default "auto"; number = MonitorInfo.id
  cursorInteraction: boolean;           // "Follow cursor", default true
  pettingEnabled: boolean;              // default true
  randomBehaviours: boolean;            // default true
  speechBubbles: boolean;               // default true
  wakeOnReturn: boolean;                // default true
  soundEnabled: boolean;                // default true
  volume: number;                       // 0–1, default 0.5 (UI shows 0–100)
  fpsCap: 15 | 30 | 60;                 // default 30
  lowPowerMode: boolean;                // default false
  reduceMotion: boolean;                // default false
  miniMode: boolean;                    // default false (mini = scale 0.5 in bottom-right, reduced activity; restores previous scale when off)
  visible: boolean;                     // default true
  position: { x: number; y: number } | null; // physical px; null = bottom-right of primary work area
  previousScale: number | null;         // stored while miniMode is on
  firstRunDone: boolean;                // default false
}
```

**Sanitize on load and on every `update_settings` (Rust `settings.rs::sanitize`)**: drop unknown keys; fill missing keys with defaults; clamp `scale` to [0.5, 2.0] rounded to 0.1; clamp `volume` to [0, 1]; trim `name` and revert to default if empty or > 20 chars; coerce `fpsCap` to the nearest of 15/30/60; validate `personality` enum else `"happy"`; if `position` is off every monitor, set to `null`. Migration: `schemaVersion` missing → treat as 1; future `schemaVersion` > 1 → load best effort and keep unknown keys untouched on save.

## 2. `pet-state.json`

```ts
export interface PetState {
  schemaVersion: 1;
  energy: number;         // 0–100, default 80
  boredom: number;        // 0–100, default 20
  affection: number;      // 0–100, default 50
  asleep: boolean;        // default false
  savedAt: number;        // epoch ms
  lastInteractionAt: number;
  cooldownsUntil: Record<string, number>; // key = CooldownKey (see 3.x), value = epoch ms
  lastBubbleAt: number;   // 0 if never
}
```
Written debounced every 30 s and on hide, sleep, quit. `save_pet_state` is the only writer.

## 3. Tauri commands (frontend → Rust)

All commands return `Result<T, String>`; on the TS side `ipc.ts` wraps each in a typed function and never lets a rejection escape into the render loop (log + fallback).

| Command | Args | Returns | Behaviour |
|---|---|---|---|
| `get_settings` | — | `Settings` | Sanitised current settings |
| `update_settings` | `{ patch: Partial<Settings> }` | `Settings` | Merge → sanitize → persist → apply side effects (scale, alwaysOnTop, autostart, visibility) → emit `settings://changed` |
| `reset_settings` | — | `Settings` | Defaults, keeps `firstRunDone` |
| `get_pet_state` | — | `PetState` | Loaded state (with offline decay applied by TS engine) |
| `save_pet_state` | `{ state: PetState }` | `void` | Persist |
| `get_stage` | — | `Stage` | See below |
| `set_hitbox` | `{ rect: {x:number;y:number;w:number;h:number} \| null }` | `void` | Window-local **logical** px; `null` = whole window inert (click-through) |
| `set_window_scale` | `{ scale: number }` | `void` | Resize window to `256×scale` keeping feet anchored at the same screen point |
| `move_to` | `{ x: number; speed: number }` | `void` | Start moving horizontally along the ground toward physical x at `speed` logical px/s; replaces any current target |
| `stop_move` | — | `void` | Stop; emits `pet://arrived` |
| `set_position` | `{ x:number; y:number }` | `void` | Teleport (physical); clamps into a work area |
| `begin_drag` | `{ grabX:number; grabY:number }` | `void` | Window-local logical grab offset; Rust follows the cursor each tick |
| `end_drag` | — | `void` | Stop following; start gravity fall; emits `pet://landed` |
| `start_fall` | `{ fromTop?: boolean }` | `void` | First-run drop (`fromTop`) or manual fall |
| `set_cursor_rate` | `{ mode: "active"\|"idle"\|"sleep"\|"off" }` | `void` | Selects poll rate (30/10/4/0 Hz) |
| `show_context_menu` | `{ isAsleep: boolean }` | `void` | Native menu at cursor |
| `set_tray_state` | `{ asleep:boolean; muted:boolean; visible:boolean }` | `void` | Updates check marks / labels |
| `show_pet` / `hide_pet` | — | `void` | Visibility; hide emits `app://visibility` |
| `open_settings` | — | `void` | Create/focus settings window |
| `reveal_data_dir` | — | `void` | Opens the app-data folder in Explorer/Finder |
| `quit_app` | — | `void` | Save + exit |

```ts
export interface MonitorInfo {
  id: number; name: string | null; isPrimary: boolean; scaleFactor: number;
  x: number; y: number; width: number; height: number;                       // physical
  workArea: { x: number; y: number; width: number; height: number };         // physical
}
export interface Stage {
  monitors: MonitorInfo[]; activeMonitorId: number; scaleFactor: number;
  window: { x: number; y: number; width: number; height: number };           // physical
  groundY: number;            // physical window y at which the feet are on the ground
  feetYLogical: number;       // = FEET_Y_LOGICAL (242 @ scale 1)
}
```

`CooldownKey` = `"yawn"|"scratch_ear"|"stretch"|"sneeze"|"roll_over"|"bark"|"trip"|"chase"|"curious"|"paw_reach"|"scared"|"bored"|"kiss"|"bubble"|"funny_global"`.

## 4. Events (Rust → frontend)

| Event | Payload | Rate / when |
|---|---|---|
| `cursor://tick` | `{ x:number; y:number; ts:number; buttons:number }` physical px, `buttons` bitmask if available else 0 | On position change, at the current cursor rate; never when hidden |
| `pet://moved` | `{ x:number; y:number }` physical window position | ≤ 30 Hz while moving/dragging/falling |
| `pet://arrived` | `{ x:number; y:number }` | When `move_to` target reached or `stop_move` |
| `pet://landed` | `{ x:number; y:number; impactSpeed:number }` | After a fall |
| `settings://changed` | `Settings` | After any update |
| `menu://action` | `{ action: "sleep"\|"wake"\|"mini"\|"mute"\|"hide"\|"show"\|"settings"\|"quit" }` | Context or tray menu selection |
| `stage://changed` | `Stage` | Monitor layout / DPI changes, wake from system sleep |
| `app://visibility` | `{ visible:boolean }` | Show/hide |
| `app://degraded` | `{ reason:string }` | Cursor polling failing |
| `system://resume` | `{ stillMs:number }` | Machine resumed from sleep |

Rust performs `set_ignore_cursor_events` toggling itself using the last `set_hitbox` — the frontend never toggles it.

## 5. Engine types (`src/shared/types.ts`, pure TS)

```ts
import type { AnimationName } from "../generated/animations";

export type Facing = "left" | "right";
export type SoundId = "bark"|"yip"|"happy"|"purr"|"kiss"|"sneeze"|"yawn"|"whimper"|"pop"|"thud";

export type BehaviorState =
  | "IDLE"|"WANDER"|"CURIOUS"|"CHASING_CURSOR"|"PAW_REACH"|"PETTING"|"KISSING"|"HAPPY"
  | "EXCITED"|"SURPRISED"|"SCARED"|"SAD"|"BORED"|"FUNNY_YAWN"|"FUNNY_SCRATCH"|"FUNNY_STRETCH"
  | "FUNNY_SNEEZE"|"FUNNY_ROLL"|"FUNNY_BARK"|"SLEEPING"|"WAKING"|"DRAGGED"|"FALLING";

export interface CursorInfo {        // window-local logical px, already smoothed
  x: number; y: number; dx: number; dy: number; distance: number; speed: number;
  approaching: boolean; dwellCuriousMs: number; dwellNearMs: number; look: "center"|"left"|"right"|"up"|"down";
}
export interface PointerEvents {     // events since last tick
  clicks: { x:number; y:number; inFaceZone:boolean; t:number }[];
  doubleClick: boolean; dragStart: boolean; dragEnd: boolean; rightClick: boolean;
  pettingActive: boolean; overBody: boolean; spamClicks: boolean;
}
export interface UserPresence { stillMs: number; returned: boolean; systemResumed: boolean; }
export interface MoveIntent { targetX: number /* physical */; speed: number /* logical px/s */ }
export type FxSpawn =
  | { kind: "hearts"; count: number; big?: boolean }
  | { kind: "zzz" } | { kind: "sparkles"; count: number }
  | { kind: "exclaim" } | { kind: "question" } | { kind: "dizzy" } | { kind: "dust" };
export interface SoundCue { id: SoundId; volumeScale?: number }
export interface BubbleSpec { text: string; durationMs: number }
export interface StageInfo { scale: number; scaleFactor: number; ground: boolean; nearTopEdge: boolean }
```

## 6. Generated: `src/generated/animations.ts` (by `tools/gen_from_spec.py`)

```ts
export const CANVAS_PX = 384; export const BASELINE_Y_PX = 356; export const CENTER_X_PX = 192;
export const DISPLAY_LOGICAL_PX = 192; export const WINDOW_LOGICAL_PX = 256; export const FEET_Y_LOGICAL = 242;
export const ANIMATION_NAMES = [ /* every name in the spec, priority mvp + v2 */ ] as const;
export type AnimationName = typeof ANIMATION_NAMES[number];
export type Camera = "front" | "three_quarter_right" | "side_right";
export interface AnimationMeta {
  name: AnimationName; category: string; priority: "mvp"|"v2"; camera: Camera; mirrorable: boolean;
  frames: number; fps: number; loop: boolean; frameMs: number[]; // resolved per-frame durations
  soundCue?: { frame: number; sound: string };
}
export const ANIMATIONS: Record<AnimationName, AnimationMeta> = { /* generated */ };
```
`src-tauri/src/generated_consts.rs` contains the same numeric constants. V2 animations appear in the type but their strips may be absent; the loader treats a missing V2 strip as "unavailable" and the engine never selects it.

## 7. Runtime manifest `public/assets/animations.json` (by `pack_strips.py`)

```json
{
  "version": 1, "canvas": 384, "baseline": 356, "centerX": 192, "display": 192, "window": 256, "feetYLogical": 242,
  "specSha256": "<sha256 of assets/spec/animations.spec.json>",
  "animations": {
    "idle_sit": {
      "strip": "sprites/idle_sit.png", "frames": 6, "frameWidth": 384, "frameHeight": 384,
      "fps": 6, "loop": true, "frameMs": [1400,700,500,70,90,900],
      "camera": "front", "mirrorable": true,
      "bbox": [[x,y,w,h], "… one per frame, alpha bounding box in frame px"],
      "soundCue": null
    }
  }
}
```
The loader must verify `specSha256` against the value embedded in `src/generated/animations.ts` (`SPEC_SHA256`); on mismatch dev builds show the red badge and CI (`assets:validate`) fails.

## 8. Asset-tool contracts

**`assets/spec/palette.json`**
```json
{ "version": 1, "source": "approved/master/master_front.png", "method": "kmeans-lab-k8",
  "tokens": { "--pup-fur-base": "#RRGGBB", "--pup-fur-light": "#RRGGBB", "--pup-fur-shadow": "#RRGGBB",
              "--pup-ear": "#RRGGBB", "--pup-outline": "#RRGGBB", "--pup-nose": "#RRGGBB", "--pup-eye": "#RRGGBB",
              "--pup-blush": "#RRGGBB", "--fx-heart": "#RRGGBB", "--fx-heart-light": "#RRGGBB",
              "--fx-zzz": "#RRGGBB", "--fx-spark": "#RRGGBB", "--bubble-bg": "#RRGGBB", "--bubble-text": "#RRGGBB" } }
```
Tokens the extractor cannot infer (fx/bubble) keep the fallback defaults from `04 → 2`.

**`assets/qa/generation_log.jsonl`** — one JSON object per generation attempt:
`{ "ts": "ISO-8601", "animation": "walk", "frame": 3, "attempt": 1, "model": "gemini-…", "promptSha256": "…", "refImages": ["approved/master/master_side_right.png", "…"], "output": "assets/raw/walk/walk_03.png", "qa": "pass|fail|pending", "qaReasons": [] }`

**`assets/qa/reports/<anim>.json`** — per frame: `{ frame, alphaCoverage, bboxTouchesBorder, greenSpillRatio, furDeltaE, areaRatioToPrev, baselineErrorPx, pass, reasons[] }`; plus animation-level `loopSeamDeltaE` for looping animations.

**File naming (normative):** `assets/raw/<anim>/<anim>_<NN>.png` with zero-padded 2-digit `NN` starting at `00`; processed files identical names under `assets/processed/`; strips `public/assets/sprites/<anim>.png` (frames left→right, no padding, 384 px each). Left-facing strips are **not** stored; they are mirrored at runtime (unless `mirror_ok` is false, in which case `<anim>_left` animations are added to the spec).

**`tools/expected_files.json`** (generated): the complete list of files that must exist per priority tier; `validate_assets.py --tier mvp|v2|placeholder` checks existence, dimensions (`384×384` per frame), RGBA mode, and manifest ↔ spec ↔ strip agreement.
