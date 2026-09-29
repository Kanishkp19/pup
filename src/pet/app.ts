import { AudioManager } from "./audio/audio";
import { BehaviorEngine } from "./behavior/engine";
import { SeededRng, SystemClock } from "./behavior/rng";
import { SpeechBubble } from "./fx/bubble";
import { DustParticle, ExclamationParticle, QuestionParticle } from "./fx/emotes";
import { spawnKissHearts, spawnPettingBurst } from "./fx/hearts";
import { ParticlePool } from "./fx/particles";
import { ZzzParticle } from "./fx/zzz";
import { BallParticle, LaughParticle, NoteParticle } from "./fx/play";
import { CursorProcessor } from "./input/cursor";
import { PointerTracker } from "./input/pointer";
import { ipc } from "./ipc";
import { Animator } from "./render/animator";
import { Renderer } from "./render/renderer";
import { SpriteCache } from "./render/sprite-cache";
import type { CursorTickPayload, FxSpawn, Settings, Stage, StageInfo } from "../shared/types";

export class PuppyApp {
  private spriteCache: SpriteCache;
  private animator: Animator;
  private renderer: Renderer;
  private engine: BehaviorEngine;
  private pointerTracker: PointerTracker;
  private cursorProcessor: CursorProcessor;
  private audioManager: AudioManager;
  private particlePool: ParticlePool;
  private speechBubble: SpeechBubble;

  private settings!: Settings;
  private stage!: Stage;
  private lastCursorPayload: CursorTickPayload | null = null;
  private lastCursorPos: { x: number; y: number } = { x: 0, y: 0 };
  private stillMs: number = 0;
  private lastMoveTime: number = performance.now();
  private presenceReturned: boolean = false;
  private lastDustTime: number = 0;
  private lastTickTime: number = performance.now();
  private lastSavedTime: number = performance.now();
  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.spriteCache = new SpriteCache();
    this.animator = new Animator();
    this.renderer = new Renderer(canvas, this.spriteCache, this.animator);
    this.pointerTracker = new PointerTracker(canvas);
    this.cursorProcessor = new CursorProcessor();
    this.audioManager = new AudioManager();
    this.particlePool = new ParticlePool();
    this.speechBubble = new SpeechBubble();

    // Default engine
    const rng = new SeededRng();
    const clock = new SystemClock();
    this.engine = new BehaviorEngine({
      rng,
      clock,
      settings: {
        schemaVersion: 1,
        name: "Biscuit",
        personality: "happy",
        scale: 1.0,
        alwaysOnTop: true,
        startWithSystem: true,
        monitor: "auto",
        cursorInteraction: true,
        pettingEnabled: true,
        randomBehaviours: true,
        speechBubbles: true,
        wakeOnReturn: true,
        soundEnabled: true,
        volume: 0.5,
        fpsCap: 30,
        lowPowerMode: false,
        reduceMotion: false,
        miniMode: false,
        visible: true,
        position: null,
        previousScale: null,
        firstRunDone: true,
      },
    });
  }

  public async start() {
    this.settings = await ipc.getSettings();
    this.stage = await ipc.getStage();

    this.audioManager.setMasterVolume(this.settings.volume);
    this.audioManager.setMuted(!this.settings.soundEnabled);

    // Preload pinned core sprite strips
    await this.spriteCache.preloadPinned();

    // Listen to cursor events from Rust
    await ipc.onCursorTick((payload) => {
      this.lastCursorPayload = payload;
    });

    // Listen to settings changes
    await ipc.onSettingsChanged((newSettings) => {
      const scaleChanged = newSettings.scale !== this.settings?.scale || newSettings.miniMode !== this.settings?.miniMode;
      this.settings = newSettings;
      this.audioManager.setMasterVolume(newSettings.volume);
      this.audioManager.setMuted(!newSettings.soundEnabled);

      // Mini mode: 0.5x window (PRD F12) — applied through the same scale path
      if (scaleChanged) {
        void this.applyScale();
      }
    });

    // Context / tray menu actions
    await ipc.onMenuAction((action) => this.handleMenuAction(action));

    // Motion feedback from the Rust motion thread
    await ipc.onArrived(() => {
      this.engine.notifyArrived();
    });
    await ipc.onLanded(() => {
      this.engine.notifyLanded();
      void ipc.getStage().then((stage) => {
        this.stage = stage;
      });
    });

    // Keep stage fresh while the window walks / falls / gets dragged, so
    // wander targets and cursor math use the live window position.
    await ipc.onMoved(() => {
      void ipc.getStage().then((stage) => {
        this.stage = stage;
      });
    });

    // Hitbox covering the real sprite content (window-local logical px):
    // measured content spans x 60..196, y 92..242 at 1.0 scale.
    void ipc.setHitbox({ x: 56, y: 88, width: 144, height: 160 });

    // Say first run greeting if not done
    if (!this.settings.firstRunDone) {
      this.speechBubble.show({ text: `Hi! I'm ${this.settings.name}! 🐾`, durationMs: 4000 });
      void ipc.updateSettings({ firstRunDone: true });
    }

    this.isRunning = true;
    this.lastTickTime = performance.now();

    // Apply persisted scale (and mini-mode) once at startup
    await this.applyScale();

    this.loop();
  }

  /** Push the effective window scale (user scale × mini-mode 0.5×) to Rust. */
  private async applyScale(): Promise<void> {
    const effective = this.settings.miniMode ? this.settings.scale * 0.5 : this.settings.scale;
    await ipc.setWindowScale(effective);
    // Re-show in case a scale change raced with the window state, and refresh
    void ipc.getStage().then((stage) => {
      this.stage = stage;
    });
  }

  private loop = () => {
    if (!this.isRunning) return;

    const now = performance.now();
    const dtMs = Math.min(100, now - this.lastTickTime);
    this.lastTickTime = now;

    this.tick(dtMs);

    // Gate to fpsCap
    const targetIntervalMs = 1000 / this.settings.fpsCap;
    setTimeout(() => {
      requestAnimationFrame(this.loop);
    }, Math.max(0, targetIntervalMs - (performance.now() - now)));
  };

  private tick(dtMs: number) {
    const dtSec = dtMs / 1000;
    const now = performance.now();

    // Process inputs
    const pointerEvents = this.pointerTracker.pollEvents();
    const cursorInfo = this.cursorProcessor.process(
      this.lastCursorPayload,
      { x: this.stage.window.x, y: this.stage.window.y },
      this.settings.scale,
      this.stage.scaleFactor,
      dtMs
    );

    const stageInfo: StageInfo = {
      scale: this.settings.scale,
      scaleFactor: this.stage.scaleFactor,
      // "on ground" = window bottom is resting at the ground line (physical px)
      ground: Math.abs(this.stage.window.y - this.stage.groundY) < 4,
      nearTopEdge: this.stage.window.y < 30,
      window: this.stage.window,
    };

    // Engine update
    const outputs = this.engine.update(dtSec, {
      cursor: cursorInfo,
      pointer: pointerEvents,
      presence: {
        stillMs: this.stillMs,
        returned: this.presenceReturned,
        systemResumed: false,
      },
      stage: stageInfo,
      settings: this.settings,
    });
    this.presenceReturned = false;

    // Apply animation & facing
    this.animator.play(outputs.animation);
    this.animator.setFacing(outputs.facing);
    const { soundCue } = this.animator.update(dtMs);
    if (soundCue) {
      this.audioManager.play(soundCue as any);
    }

    // Play sounds from engine
    for (const s of outputs.sound) {
      this.audioManager.play(s.id, s.volumeScale);
    }

    // Spawn FX from engine
    for (const f of outputs.fx) {
      this.handleFx(f);
    }

    // Speech bubble
    if (outputs.bubble && this.settings.speechBubbles) {
      this.speechBubble.show(outputs.bubble);
    }
    this.speechBubble.update(dtMs);

    // Update particles
    this.particlePool.update(dtMs);

    // Render frame
    this.renderer.render(
      { offsetY: 0, scaleX: 1, scaleY: 1 },
      (ctx) => this.particlePool.draw(ctx),
      (ctx) => this.speechBubble.draw(ctx, this.settings.scale, stageInfo.nearTopEdge)
    );

    // Handle movement (Rust walks the window; re-issue while the engine wants motion)
    if (outputs.moveIntent) {
      void ipc.moveTo(outputs.moveIntent.targetX, outputs.moveIntent.speed, outputs.moveIntent.targetY);
      // occasional dust puffs while trotting
      if (now - this.lastDustTime > 400) {
        this.lastDustTime = now;
        const dir = outputs.facing === "right" ? -1 : 1;
        this.particlePool.spawn(new DustParticle(128 + dir * 30, dir));
      }
    }

    // Drag start/end -> Rust owns the window while grabbed
    if (pointerEvents.dragStart) {
      const grab = this.pointerTracker.getLastPointerPos();
      void ipc.beginDrag(grab.x, grab.y);
    }
    if (pointerEvents.dragEnd) {
      void ipc.endDrag();
    }

    // Right-click -> native context menu
    if (pointerEvents.rightClick) {
      void ipc.showContextMenu();
    }

    // Track user presence (stillness / return) for the sleep system
    if (this.lastCursorPayload) {
      const moved =
        this.lastCursorPayload.x !== this.lastCursorPos.x ||
        this.lastCursorPayload.y !== this.lastCursorPos.y;
      if (moved) {
        this.lastCursorPos = { x: this.lastCursorPayload.x, y: this.lastCursorPayload.y };
        this.stillMs = 0;
        if (now - this.lastMoveTime > 30000 && this.settings.wakeOnReturn) {
          this.presenceReturned = true;
        }
        this.lastMoveTime = now;
      } else {
        this.stillMs += dtMs;
      }
    }

    // Debounced state save (every 30 seconds)
    if (now - this.lastSavedTime >= 30000) {
      this.lastSavedTime = now;
      const state = this.engine.getNeeds().toState(Date.now());
      void ipc.savePetState(state);
    }
  }

  private handleMenuAction(action: string) {
    switch (action) {
      case "sleep":
        this.engine.forceSleep();
        break;
      case "wake":
        this.engine.forceWake();
        break;
      case "sleep_toggle": {
        // Context menu uses a single toggle item labelled by current state.
        if (this.engine.getState() === "SLEEPING") {
          this.engine.forceWake();
        } else {
          this.engine.forceSleep();
        }
        break;
      }
      case "mini":
        this.settings.miniMode = !this.settings.miniMode;
        void ipc.updateSettings({ miniMode: this.settings.miniMode });
        break;
      case "mute":
        this.settings.soundEnabled = !this.settings.soundEnabled;
        this.audioManager.setMuted(!this.settings.soundEnabled);
        void ipc.updateSettings({ soundEnabled: this.settings.soundEnabled });
        break;
      case "hide":
        void ipc.hidePet();
        break;
      case "show":
        void ipc.showPet();
        break;
      case "settings":
        // Rust opens the settings window directly
        break;
      case "quit":
        // Rust exits directly
        break;
    }
  }

  private handleFx(fx: FxSpawn) {
    if (fx.kind === "hearts") {
      if (fx.big) {
        for (const h of spawnKissHearts()) {
          this.particlePool.spawn(h);
        }
      } else {
        for (const h of spawnPettingBurst()) {
          this.particlePool.spawn(h);
        }
      }
    } else if (fx.kind === "zzz") {
      this.particlePool.spawn(new ZzzParticle(145, 120, Math.floor(Math.random() * 3)));
    } else if (fx.kind === "exclaim") {
      this.particlePool.spawn(new ExclamationParticle());
    } else if (fx.kind === "question") {
      this.particlePool.spawn(new QuestionParticle());
    } else if (fx.kind === "dust") {
      this.particlePool.spawn(new DustParticle(128, 1));
      this.particlePool.spawn(new DustParticle(128, -1));
    } else if (fx.kind === "laugh") {
      this.particlePool.spawn(new LaughParticle(150, 110, Math.floor(Math.random() * 6)));
    } else if (fx.kind === "note") {
      this.particlePool.spawn(new NoteParticle(150, 110, Math.floor(Math.random() * 6)));
    } else if (fx.kind === "ball") {
      this.particlePool.spawn(new BallParticle(fx.x));
    }
  }
}
