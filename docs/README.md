# 🐶 PUPPY

### A tiny puppy that lives on your desktop.

PUPPY is a lightweight virtual pet for **Windows and macOS**. It isn't an animated image — it watches your cursor, leans into a pet, gives kisses, chases your mouse, trips over its own paws, yawns, and eventually curls up and falls asleep. Local-first: no account, no cloud, no network.

> Not an app you use. A little companion that lives on your computer.

## Features (MVP)

- Transparent, borderless, always-on-top puppy that walks and runs along the bottom of your screen
- Click-through everywhere except on the puppy itself
- Eyes/head follow your cursor; notices you; chases fast mouse movement
- Pet it (stroke the cursor over it), click its face for a kiss, double-click to excite it, drag it and drop it
- Funny random behaviours: yawn, scratch ear, stretch, sneeze, roll over, trip
- Needs and personalities: happy, lazy, chaotic, affectionate, chill
- Sleep system with Zzz; wakes when you return
- Cute synthesized sounds (volume and mute)
- Settings window, tray/menu-bar control, global show/hide shortcut `Ctrl/Cmd + Shift + P`
- Start with your computer, low-power mode, adjustable size

Coming in V2: TV time, mini-games, dance, toys, day/night behaviour, achievements.

## Design principle

> **Cute first. Lightweight second. Features third.**
> Every feature must answer: *"Does this make the puppy feel more alive?"*

## Tech stack

Tauri 2 · Rust · TypeScript · Vite · Canvas 2D · Vitest · Python asset tooling · Art generated with Google's Nano Banana

## Install (unsigned builds)

Download the installer from **Releases**.
- **Windows:** run the `.exe`; if SmartScreen appears choose *More info → Run anyway*.
- **macOS:** open the `.dmg`, drag PUPPY to Applications, then right-click → *Open* the first time (or `xattr -dr com.apple.quarantine /Applications/PUPPY.app`).

Known limitations: the puppy does not appear over exclusive-fullscreen games or macOS full-screen Spaces. Linux is not supported.

## Develop

```bash
npm install
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r tools/requirements.txt
npm run assets:spec && npm run assets:placeholders
npm run tauri dev
```

## Build the art

The whole character is generated from `assets/reference/master_reference.png` using Nano Banana. Animations, frame counts and timings are defined **once** in `assets/spec/animations.spec.json`; code, prompts, manifests and validators are all generated from it.

```bash
cp .env.example .env                       # add GEMINI_API_KEY if using the API path
npm run assets:generate -- --anim idle_sit # one animation
npm run assets:build                       # key → normalise → pack → validate (offline)
npm run assets:qa                          # contact sheets, GIF previews, report
```

See `docs/07-ASSET-PIPELINE.md`.

## Docs

`docs/00-MASTER-PROMPT.md` (start here) → `01-PRD` → `02-TRD` → `03-APP-FLOW` → `04-UI-UX-ART-BIBLE` → `05-DATA-AND-IPC-CONTRACT` → `06-IMPLEMENTATION-PLAN` → `07-ASSET-PIPELINE`.

## Privacy

No login, no camera, no microphone, no location, no network at runtime. Cursor position is used in memory only and is never stored or transmitted.

## License

MIT (default assumption — change before first release if you prefer another license).
