import { AudioManager } from "./audio/audio";
import { BehaviorEngine } from "./behavior/engine";
import { SeededRng, SystemClock } from "./behavior/rng";
import { SpeechBubble } from "./fx/bubble";
import { DustParticle, ExclamationParticle, QuestionParticle } from "./fx/emotes";
import { spawnKissHearts, spawnPettingBurst } from "./fx/hearts";
import { ParticlePool } from "./fx/particles";
import { ZzzParticle } from "./fx/zzz";
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
      this.settings = newSettings;
      this.audioManager.setMasterVolume(newSettings.volume);
      this.audioManager.setMuted(!newSettings.soundEnabled);
    });

    // Set initial hitbox on pet body (window-local logical px)
    void ipc.setHitbox({ x: 60, y: 100, width: 136, height: 145 });

    // Say first run greeting if not done
    if (!this.settings.firstRunDone) {
      this.speechBubble.show({ text: `Hi! I'm ${this.settings.name}! 🐾`, durationMs: 4000 });
      void ipc.updateSettings({ firstRunDone: true });
    }

    this.isRunning = true;
    this.lastTickTime = performance.now();
    this.loop();
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
      ground: true,
      nearTopEdge: this.stage.window.y < 30,
      window: this.stage.window,
    };

    // Engine update
    const outputs = this.engine.update(dtSec, {
      cursor: cursorInfo,
      pointer: pointerEvents,
      presence: { stillMs: 0, returned: false, systemResumed: false },
      stage: stageInfo,
      settings: this.settings,
    });

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

    // Handle movement
    if (outputs.moveIntent) {
      void ipc.moveTo(outputs.moveIntent.targetX, outputs.moveIntent.speed);
    }

    // Debounced state save (every 30 seconds)
    if (now - this.lastSavedTime >= 30000) {
      this.lastSavedTime = now;
      const state = this.engine.getNeeds().toState(Date.now());
      void ipc.savePetState(state);
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
    }
  }
}
