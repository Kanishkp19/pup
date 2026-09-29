# PUPPY — App Flow, Behaviour & Interaction Specification

> A desktop pet has no routes and screens in the web sense. Its "screens" are: the **pet window**, the **context menu**, the **tray menu**, and the **settings window**. Its "flows" are the **behaviour state machine** and the **interaction rules**. All animation names below exist in `assets/spec/animations.spec.json`; code must import them from `src/generated/animations.ts`.
> Units: px = logical pixels at scale 1.0; multiply every distance/speed by the current `scale`. Times in ms unless stated.

## 1. Windows and surfaces

| Surface | Label / file | Size | Purpose |
|---|---|---|---|
| Pet window | `pet` → `index.html`, `src/pet/main.ts` | `256×scale` square | Draws puppy, FX, bubble; click-through except on body |
| Settings window | `settings` → `settings.html`, `src/settings/main.ts` | 480×620, decorated, non-resizable, centred, normal taskbar entry while open | Edit settings |
| Context menu | Native menu opened by Rust `show_context_menu` | native | Right-click on puppy |
| Tray / menu-bar menu | `tray.rs` | native | Always-available control surface |

First-run flow: app starts → create settings/state defaults → puppy **drops in from above** the work area (fall + landing squash) → `surprised` → `happy` → bubble "Hi! I'm {name}!" (once ever, flag `firstRunDone`).

Quit flow: tray/menu Quit → save pet state → exit. Closing the settings window only closes that window.

## 2. Behaviour engine

### 2.1 Inputs and derived cursor metrics (all in `input/cursor.ts`, pure)

- `pet center` = window centre horizontally, vertically `FEET_Y − 70·scale` (window-local logical px).
- `d` = distance cursor→pet centre. `v` = cursor speed, EMA α = 0.35 (px/s). `approaching` = velocity·(toward pet) > 0. `dwell` = ms the cursor has stayed within a radius.
- Radii: `NOTICE_R = 260`, `CURIOUS_R = 160`, `NEAR_R = 90`, `WAKE_R = 120`, `CHASE_MAX_D = 500` (all × scale; `affectionate` multiplies NOTICE/CURIOUS by 1.3).
- **Look direction** (from angle to cursor): if `d < 40·scale` → center. Else if `|dx| > 0.8·|dy|` → `left`/`right` by sign of dx (viewer's left = negative x), else `up`/`down`. A new sector must be held ≥ 150 ms and ≥ 250 ms must pass since the last switch (hysteresis; prevents flicker).
- `userPresence`: `stillMs` = ms since cursor last moved > 3 px. `returned` event fires when the cursor moves after `stillMs ≥ 300000` (5 min).
- Cursor input is `null` when `cursorInteraction` is off or the app is degraded; the engine must then behave sanely with autonomous behaviour only.

### 2.2 State table (MVP)

Sequence bridges from the pose-family rules in 2.6 apply on every transition.

| State | Animation(s) | Duration / exit | Movement | Enter when | Interrupted by |
|---|---|---|---|---|---|
| `IDLE` | `idle_sit` (or `look_*` frame while cursor within NOTICE_R) | 4–12 s random, then weighted pick (2.3) | none | default | any pointer event, cursor rules |
| `WANDER` | `stand_up` → `walk` (or `run` if chaotic 15%) → `stand_idle` 0.6–2.5 s → `sit_down` | until arrival at target | `move_to` random ground point 200–700 px away on same monitor, speed 70 px/s walk / 260 px/s run | weighted pick from IDLE | pointer event, chase trigger |
| `CURIOUS` | `curious` once, hold last frame | until cursor leaves `1.3×CURIOUS_R` or 8 s; cooldown 6 s | none | cursor in CURIOUS_R, `dwell` > 600 ms, `v` < 200 | click, fast cursor |
| `CHASING_CURSOR` | `stand_up` → `run` → `stand_idle` | ≤ 6 s or until horizontally within 60 px of cursor | `move_to(cursor.x)` on ground, 260 px/s, re-targeted every 100 ms | `v` > 900 and `d` < CHASE_MAX_D, cooldown 20 s, `chase` weight by personality | click, drag |
| `PAW_REACH` | `paw_reach` once | 1 play; cooldown 30 s | none | after chase arrival or cursor within NEAR_R and `dwell` > 1500 | any pointer event |
| `PETTING` | `petting` loop | while gesture active (2.7) | none | petting gesture | leaving body ≥ 600 ms |
| `KISSING` | `kiss` once (sound at frame 2, big heart burst) | 1 play → `HAPPY` | none | click in face zone, cooldown 2 s | none (uninterruptible) |
| `HAPPY` | `happy` loop | 2–4 s → `IDLE` | none | after petting/kiss/click | pointer event |
| `EXCITED` | `bark` once → `excited` loop | 2.5 s → `HAPPY` | none | double-click; wake-on-return | none |
| `SURPRISED` | `surprised` once | 1 play → `IDLE` | none | spam clicks (≥ 4 in 1.5 s); sudden `v` > 1600 within NEAR_R (→ `SCARED`) | none |
| `SCARED` | `scared` loop | 1.5–2.5 s → `IDLE` | none | `v` > 1600, `approaching`, `d` < 200, cooldown 60 s | click |
| `SAD` | `sad` loop | until interaction (→ `HAPPY`) or 8 s | none | `boredom` > 85 or `affection` < 20 while awake | any interaction |
| `BORED` | `bored_sigh` once | 1 play → `IDLE` | none | `boredom` > 60, cooldown 90 s | pointer |
| `FUNNY_*` | `yawn`, `scratch_ear`, `stretch`, `sneeze`, `roll_over`, `bark` | 1 play → `IDLE` (`stretch` → `stand_idle`) | none | weighted pick from IDLE (2.3) | pointer (except mid-`sneeze`) |
| `SLEEPING` | `sleep_down` once → `sleep_loop` loop, Zzz FX | until wake condition | none | energy < 25 and idle 30 s; stillness 10 min; menu "Sleep" | wake conditions below |
| `WAKING` | `wake_up` once | 1 play → `EXCITED` if woken by `returned`, else `IDLE` | none | wake condition | none |
| `DRAGGED` | `drag` loop | until release → `FALLING` | Rust follows cursor | press-hold > 250 ms then move > 8 px | none |
| `FALLING` | `drag` frame 0 + code squash/stretch | until landed → `stand_idle` → `IDLE` | Rust gravity 2400 px/s² | drag release / first-run drop | none |

**Wake conditions:** click on body; cursor within `WAKE_R` with `v` > 300; `returned` event (if `wakeOnReturn`, default true); natural wake when energy ≥ 90 after ≥ 20 min asleep. A sleeping puppy **never** starts CHASE, CURIOUS or FUNNY.

V2 states (not built in MVP): `PLAYING`, `WATCHING_TV`, `HUNGRY`, `DANCING`, `CHASING_TAIL`, `GAME_*`.

### 2.3 IDLE exit — weighted pick

Weights before personality multipliers (re-rolled each exit; zero-weight entries are impossible):

| Choice | Weight | Condition |
|---|---|---|
| Stay IDLE (re-roll) | 30 | always |
| `WANDER` | 30 | not in Mini mode |
| Random `FUNNY_*` | 25 | global funny gap ≥ 25 s and at least one funny off cooldown |
| `BORED` | `max(0, boredom − 50)` | cooldown ok |
| `SLEEPING` | `max(0, 60 − energy)` | energy < 40 |

Funny cooldowns: `yawn` 90 s, `scratch_ear` 120 s, `stretch` 150 s (only after a WANDER stop, when standing), `sneeze` 240 s, `roll_over` 300 s, `bark` 180 s. **Trip:** while `run` is playing, 12% chance once per chase, cooldown 60 s → `trip` → `stand_idle`. All cooldowns × `personality.cooldownScale`. Speech bubble "Look what I found!" may accompany `roll_over` (5%).

### 2.4 Needs (persisted in `pet-state.json`)

| Need | Range | Start | Change |
|---|---|---|---|
| `energy` | 0–100 | 80 | −1 / 60 s awake (× personality.energyDecay); +2 / 10 s asleep |
| `boredom` | 0–100 | 20 | +1 / 20 s without interaction; interaction sets `boredom = max(0, boredom − 40)`; funny event −5 |
| `affection` | 0–100 | 50 | +8 per petting burst, +12 per kiss, +3 per click (× personality.petGain); −1 / 5 min with no interaction |

On startup apply offline decay for elapsed time since `savedAt`, capped at 8 h of effect, then clamp.

### 2.5 Personalities (multipliers over 2.3 weights and 2.2 triggers)

| Personality | wander | funny | sleep | reaction (happy/excited) | petGain | chase | cooldownScale | energyDecay | radiiScale |
|---|---|---|---|---|---|---|---|---|---|
| `happy` (default) | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| `lazy` | 0.5 | 0.6 | 2.0 | 0.8 | 1.0 | 0.5 | 1.4 | 1.3 | 1.0 |
| `chaotic` | 1.6 | 1.8 | 0.7 | 1.2 | 1.0 | 1.5 | 0.6 | 1.2 | 1.0 |
| `affectionate` | 0.8 | 0.8 | 1.0 | 1.4 | 1.5 | 1.0 | 1.0 | 1.0 | 1.3 |
| `chill` | 0.7 | 0.7 | 1.4 | 0.8 | 1.0 | 0.6 | 1.2 | 0.9 | 1.0 |

`reaction` scales durations of HAPPY/EXCITED and the number of hearts. `reduceMotion` setting: forces `wander`, `funny`, `chase` multipliers to 0.3 and disables trip.

### 2.6 Pose families and bridges (prevents visual pops)

| Family | Camera | Animations |
|---|---|---|
| Sit-front | front | `idle_sit`, `look_*`, `happy`, `excited`, `petting`, `kiss`, `surprised`, `sad`, `curious`, `scared`, `bored_sigh`, `bark`, `yawn`, `sneeze`, `paw_reach`, `roll_over`, `drag` |
| Stand-side | side_right | `stand_idle`, `walk`, `run`, `stretch`, `trip`, `sit_down`, `stand_up` |
| Sit/lie 3-quarter | three_quarter_right | `scratch_ear`, `sleep_down`, `sleep_loop`, `wake_up` |

Rules (implemented in `render/animator.ts`, unit-tested):
1. Same camera → **hard cut** (spec guarantees matching start/end poses).
2. Camera changes → **crossfade 120 ms** between last frame of the old animation and first frame of the new one.
3. Stand-side → Sit-front always goes through `stand_idle` → `sit_down` → crossfade → `idle_sit`. Sit-front → Stand-side goes through `stand_up` (crossfade at its start).
4. Facing: for `side_right`/`three_quarter_right` animations, `facing = left` mirrors the sprite horizontally (only if `mirrorable` and `character.bible.json → symmetry.mirror_ok` is true; otherwise the `_left` variant strip is used). Front animations ignore facing.
5. Animation requests are queued: uninterruptible ones (`kiss`, `sneeze`, `sit_down`, `stand_up`, `wake_up`) finish before the next starts; interruptible ones can be cut at frame boundaries.

## 3. Pointer & gesture rules (`input/pointer.ts`, `gestures.ts`)

Click, hold and drag use DOM pointer events on the canvas (pointer capture on press). Petting and hover use `cursor://tick` positions converted to window-local coordinates (DOM events are unreliable while click-through toggles).

| Gesture | Rule |
|---|---|
| Hitbox | The current frame's alpha bbox from the manifest (`frames[i].bbox`), scaled to the window; sent via `set_hitbox` whenever it changes by > 4 px. |
| Click | down+up ≤ 250 ms, movement < 6 px. |
| Face zone | Upper 45% of the hitbox height × central 60% of its width. Click in zone → `KISSING`. Click elsewhere on body → `HAPPY` (hop) . |
| Double-click | Second click within 320 ms and 12 px of the first → `EXCITED` (cancels the pending single-click reaction; delay single-click reaction by 320 ms only when double-click could still occur). |
| Spam clicks | ≥ 4 clicks in 1.5 s → `SURPRISED`, then 2 s ignore window. |
| Petting | No button pressed, cursor over hitbox, ≥ 3 horizontal direction reversals (each |Δx| > 8 px) inside a sliding 1200 ms window → `PETTING`. Ends when off-body ≥ 600 ms or no reversal for 1500 ms. Hearts: 1 burst per 800 ms, 5–7 hearts. |
| Hold & drag | Left down on body ≥ 250 ms then movement > 8 px → `DRAGGED`. Frontend calls `begin_drag({grabX, grabY})`; Rust follows the cursor. On pointer up (or 30 s safety timeout) call `end_drag()` → `FALLING`. Dropping on another monitor re-homes the puppy. |
| Right-click | Calls `show_context_menu`. |
| Keyboard | None on the pet window (focus never taken). Global shortcut `CommandOrControl+Shift+P` toggles visibility. |

## 4. Menus

**Context menu (right-click on puppy):** header `{name}` (disabled) · `Sleep now` / `Wake up` (toggles) · `Mini mode` (checkbox) · `Hide puppy` · separator · `Settings…` · `Quit PUPPY`.

**Tray / menu-bar menu:** `Show puppy` / `Hide puppy` · `Sleep now` / `Wake up` · `Mini mode` · `Mute sounds` (checkbox) · separator · `Settings…` · `Quit PUPPY`. Tray icon: `src-tauri/icons/tray.png` (+ `tray@2x.png`; macOS template image). Left-click on tray toggles visibility (Windows), opens the menu (macOS).

Menu actions arrive in TS through `tray://action` / `menu://action` events with `{ action: "sleep"|"wake"|"mini"|"hide"|"show"|"mute"|... }` — see `05 → 3`.

## 5. Settings window specification

Route: `settings.html`. Layout: single column, four collapsible-free section cards in this order. Every control writes through `update_settings` immediately (debounced 150 ms for sliders) and shows a 1.2 s "Saved" text next to the section title. `Reset to defaults` button at the bottom (confirm via inline two-step button, not a dialog).

| Section | Control | Type | Default | Validation |
|---|---|---|---|---|
| General | Pet name | text | `Biscuit` | 1–20 chars, trimmed; empty → revert to default; error text "Name must be 1–20 characters" |
| General | Personality | select (`happy, lazy, chaotic, affectionate, chill`) | `happy` | enum |
| General | Size | slider 0.5–2.0 step 0.1 with numeric readout | `1.0` | clamp; changing calls `set_window_scale` |
| General | Always on top | toggle | on | — |
| General | Start with computer | toggle | on | calls autostart plugin via Rust; on failure toggle reverts + inline error "Couldn't change startup setting" |
| General | Monitor | select (`Auto`, `Primary`, `Monitor 2…`) | `Auto` | options from `get_stage().monitors` |
| Interaction | Follow cursor | toggle | on | off ⇒ engine cursor input `null` |
| Interaction | Petting & kisses | toggle | on | off ⇒ gestures 3 ignored except click reaction |
| Interaction | Random behaviours | toggle | on | off ⇒ no FUNNY/WANDER |
| Interaction | Speech bubbles | toggle | on | — |
| Interaction | Wake when I return | toggle | on | — |
| Audio | Sounds | toggle | on | — |
| Audio | Volume | slider 0–100 | 50 | disabled when Sounds off |
| Performance | FPS cap | segmented `15 / 30 / 60` | 30 | — |
| Performance | Low-power mode | toggle | off | forces cap 15 and lower logic rates |
| Performance | Reduce motion | toggle | off | 2.5 rule |
| About | Version, "Open data folder" (Rust command `reveal_data_dir`) | text/button | — | — |

Loading state: fields render defaults synchronously, then hydrate from `get_settings()`. Error state: if `get_settings` fails show banner "Couldn't load settings — showing defaults" and keep controls usable. Empty state: n/a.

## 6. Speech bubbles

| Text | Trigger | Notes |
|---|---|---|
| "Hi! I'm {name}!" | first run, after first `happy` | once ever |
| "I missed you!" | `returned` event after `stillMs ≥ 30 min` | with `EXCITED` |
| "Play with me?" | `boredom > 80` | max once per 30 min |
| "I'm sleepy…" | just before `sleep_down` | — |
| "Look what I found!" | 5% of `roll_over` | rare |

Global limit: 1 bubble per 10 min (except first-run). Duration 3500 ms with 200 ms fade in/out. Never shown while `DRAGGED`, and only when the setting is on. Visual spec: `04 → 6`.

## 7. Global error / degraded states

| Condition | Behaviour |
|---|---|
| Cursor polling failing (`app://degraded`) | Engine runs without cursor input; tray tooltip "PUPPY (limited mode)" |
| Settings file corrupt | Defaults loaded, bad file kept as `settings.json.bak` |
| Strip fails to load | `idle_sit` shown; error logged once |
| Monitor layout changed (`stage://changed`) | Clamp puppy into the nearest work area; if it was falling, restart fall |
| Machine wake from sleep | Emit `returned`-equivalent if stillness ≥ 5 min; refresh stage |
| No manifest (dev before assets) | Red "ASSETS MISSING" dev badge; run `npm run assets:placeholders` |
