# PUPPY — Product Requirements Document

> Status: v1 MVP + V2 backlog | Assumptions: see `00-MASTER-PROMPT.md → 0`

## 1. Overview

**Name:** PUPPY  **Tagline:** *A tiny puppy that lives on your desktop.*

**Pitch:** PUPPY is a lightweight cross-platform (Windows + macOS) virtual pet. A chibi golden/cream puppy lives in a transparent window above your other windows. It notices your cursor, follows it with its eyes, chases it when you move fast, leans into a pet, gives kisses, yawns, trips, naps and wakes up excited when you come back. It is not an app you use — it is a companion that lives on your computer.

**Reference character:** the user's uploaded golden/cream chibi puppy (`assets/reference/master_reference.png`): big expressive eyes, fluffy round body, floppy ears, small brown nose, tiny paws, big fluffy tail, warm pastel look. Cartoon, never realistic.

## 2. Problem statement

Desktop pets today are either static animated GIFs that ignore you, or heavy Electron apps with dashboards, accounts and ads. People who spend all day at a computer want a small, warm, non-demanding presence that reacts to *them*, costs almost no CPU, and never nags.

## 3. Personas

| Persona | Job | Goal | Frustration |
|---|---|---|---|
| **Aanya, 24** | Remote UX designer | A cute companion during long focus sessions | Pets that block clicks, cover her Figma canvas, or use fans-spinning CPU |
| **Rohan, 20** | CS student on a laptop | Something fun on his desktop that doesn't drain battery | Electron apps eating 400 MB RAM; pets that are repetitive after one hour |
| **Meera, 35** | Developer & new-dog-less apartment dweller | Companionship without a real pet; wants personality | Cutesy apps with accounts, cloud, notifications spam |

## 4. Core features (MVP) with acceptance criteria

### F1. Living desktop window
The puppy renders in a transparent, borderless, always-on-top, click-through window that moves around the screen.
It works when:
- No window frame, shadow, or background is visible on Windows and macOS.
- Clicks pass through to apps beneath everywhere except on the puppy's body (hit-tested against the sprite's opaque region).
- No taskbar/dock entry; a tray/menu-bar icon exists.
- Puppy stays inside the visible work area of the monitor it is on (never under the Windows taskbar or macOS Dock/menu bar).
- Position and monitor persist across restarts.

### F2. Autonomous behaviour
A finite-state machine with weighted random transitions, needs (energy, boredom, affection) and personalities drives behaviour (`03-APP-FLOW.md → 2`).
It works when:
- Over any 10 minutes of idle desktop the puppy shows ≥ 6 distinct animations with no visible repetition loop.
- The puppy sleeps after low energy or user inactivity and never sleeps during active interaction.
- No state change causes a visual "pop" (all transitions go through the defined bridge animations or a cross-pose hold).

### F3. Cursor awareness
Eyes/head follow the cursor; the puppy notices, gets curious, and chases fast cursor movement.
It works when:
- Within 260 px (at scale 1.0) the head turns toward the cursor via `look_*` frames with hysteresis (no flicker).
- Cursor speed > 900 px/s within 500 px triggers CHASING_CURSOR (max once per 20 s).
- Cursor polling drops to ≤ 4 Hz when the puppy sleeps or is hidden.
- No cursor coordinates are stored or sent anywhere.

### F4. Petting
Stroking over the puppy with no button pressed makes it happy.
It works when:
- ≥ 3 direction changes within 1.2 s while the cursor is over the body enters PETTING.
- During petting: eyes-closed animation, hearts spawn (5–7 per burst), a soft purr-chirp plays (cooldown 3 s).
- Leaving the body for > 600 ms ends petting and returns to HAPPY.

### F5. Kiss
Clicking the puppy's face plays a kiss.
It works when:
- A click in the face zone (upper 45% of the hitbox, central 60% width) triggers KISSING with the `kiss` animation, a big heart burst and "mwah" sound.
- Kiss has a 2 s cooldown; spam clicking produces SURPRISED then HAPPY instead of a stuck loop.

### F6. Click, double-click, drag, right-click
- Click on body → small hop/happy reaction.
- Double-click → EXCITED (`excited` animation, bark).
- Press-and-hold (> 250 ms) on body and drag → picked up (`drag` animation), window follows the cursor; release → gravity drop to ground line with squash.
- Right-click → context menu (Sleep/Wake, Mini mode, Hide, Settings, Quit).

### F7. Random funny behaviours
`yawn`, `scratch_ear`, `stretch`, `sneeze`, `roll_over`, `bark`, `trip` (only while running), `scared` (cursor comes too fast right at it) — each with independent cooldowns (`03-APP-FLOW.md → 2.3`).

### F8. Sleep system
Sleep transition (`sleep_down` → `sleep_loop`), Zzz particles (code-drawn), wake on click, on cursor moving within 120 px at speed > 300 px/s, or when a "user returned" event fires (cursor moves after > 5 min of stillness) → `wake_up` → `excited`.

### F9. Sound
Short local sounds with master volume, mute, and per-sound cooldowns (bark, happy, kiss, sneeze, yawn, step-tick optional). MVP ships synthesized placeholders.

### F10. Settings window & tray
Separate small window: name, personality, size (0.5–2.0×), volume/mute, sound on/off, start with system, always on top, cursor interaction on/off, random behaviours on/off, low-power mode, FPS cap (15/30/60), reduce-motion, monitor selection. Tray/menu-bar menu: Show/Hide, Sleep/Wake, Mini mode, Settings, Quit. Global shortcut `CommandOrControl+Shift+P` shows/hides the puppy.

### F11. Speech bubbles (notifications-lite)
Occasional tiny in-window bubbles: "I missed you!" (after user returns), "Play with me?" (very bored), "I'm sleepy…" (before sleeping), "Look what I found!" (rare funny event). Max 1 bubble per 10 minutes overall, never while user is typing-active (proxy: cursor idle < 2 s during a click-drag), toggleable in settings. No OS notifications.

### F12. Modes
- **Normal:** roams the bottom of the work area.
- **Mini mode:** scale 0.5×, sits in the bottom-right corner, reduced activity.
- **Sleep mode:** forced sleep until woken.
- **Hidden:** window hidden, process alive, all timers and polling stopped.

### F13. Performance & privacy
Idle RAM ≈ 50–120 MB, idle CPU ≈ 0–2%, startup < 3 s, no network, no login, no camera/mic/location. See `02-TRD.md → 8` for measurable budgets.

## 5. V2 backlog (labelled, not in MVP)

TV feature (`tv_watch`, `tv_laugh`), mini-games (Catch the Ball, Paw Tap, Find the Bone, Cursor Chase), `dance`, `chase_tail`, `hungry` + feeding, toys (ball/bone props), day/night behaviour, achievements, more personalities tuning, additional skins (same pipeline, new reference), Windows ARM64 build.

## 6. Personalities (MVP data only, tuning in V2)

`happy` (default), `lazy`, `chaotic`, `affectionate`, `chill`. Each is a multiplier table over transition weights and cooldowns (`03-APP-FLOW.md → 2.5`). Changing personality takes effect immediately.

## 7. User stories

1. As **Aanya**, I want clicks to pass through the transparent parts of the window so that the puppy never blocks my design tool.
2. As **Aanya**, I want to hide the puppy with a global shortcut so that I can screen-share without it.
3. As **Rohan**, I want the puppy to nearly stop using CPU when asleep so that my battery lasts.
4. As **Rohan**, I want random funny behaviours with cooldowns so that it stays fun after hours.
5. As **Meera**, I want the puppy to react when I come back to the computer so that it feels attached to me.
6. As **Meera**, I want to choose a personality so that the puppy matches my mood.
7. As a **user**, I want to pet the puppy by stroking the cursor over it so that it feels like real petting.
8. As a **user**, I want to click its face for a kiss so that I get a cute reward.
9. As a **user**, I want to drag the puppy anywhere and drop it so that I can place it where I like.
10. As a **user**, I want the puppy to stay where I left it after restart so that it feels persistent.
11. As a **user**, I want to resize the puppy so that it suits my screen density.
12. As a **user**, I want to mute it in one click so that it never disturbs a meeting.
13. As a **user**, I want it to start with my computer so that it is always there when I open my laptop.
14. As a **privacy-minded user**, I want zero network access so that my cursor data never leaves my machine.

## 8. Non-goals (and why)

- No AI/LLM at runtime — cost, RAM, privacy.
- No accounts, cloud sync, analytics — local-first principle.
- No streaming video for TV — CPU/RAM; TV content is code-drawn.
- No Linux in MVP — window transparency/click-through behaviour varies across compositors.
- No microphone/camera reactions — privacy.
- No in-app store, dashboards, or stats screens.
- No reading other apps' content or window titles (only cursor position).

## 9. Success metrics

| Metric | Target | Window |
|---|---|---|
| Idle RAM (pet awake, idle) | ≤ 120 MB | every release |
| Idle CPU (awake, no interaction) | ≤ 2% of one core avg | 5-minute sample |
| Sleeping CPU | ≤ 0.3% | 5-minute sample |
| Cold start to first frame | < 3 s | every release |
| Distinct animations seen in 10 idle minutes | ≥ 6 | every release |
| Frame QA pass rate at first generation | ≥ 70% (rest retried) | asset gates |
| Crash-free sessions | ≥ 99% | first 30 days of use |
| Asset drift incidents (validator failures on main) | 0 | ongoing |
