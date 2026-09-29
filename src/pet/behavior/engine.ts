import type { AnimationName } from "../../generated/animations";
import type {
  BehaviorState,
  BubbleSpec,
  CursorInfo,
  Facing,
  FxSpawn,
  MoveIntent,
  PetState,
  PointerEvents,
  Settings,
  SoundCue,
  StageInfo,
  UserPresence,
} from "../../shared/types";
import { NeedsSystem } from "./needs";
import { getEffectiveProfile } from "./personalities";
import type { Clock, Rng } from "./rng";

export interface EngineInputs {
  cursor: CursorInfo | null;
  pointer: PointerEvents;
  presence: UserPresence;
  stage: StageInfo;
  settings: Settings;
}

export interface EngineOutputs {
  state: BehaviorState;
  animation: AnimationName;
  facing: Facing;
  moveIntent: MoveIntent | null;
  fx: FxSpawn[];
  sound: SoundCue[];
  bubble: BubbleSpec | null;
  cursorRateMode: "active" | "idle" | "sleep" | "off";
}

export class BehaviorEngine {
  private rng: Rng;
  private clock: Clock;
  private settings: Settings;
  private needs: NeedsSystem;
  private state: BehaviorState = "IDLE";
  private facing: Facing = "right";
  private stateTimerMs: number = 0;
  private stateDurationMs: number = 6000;
  private subStep: number = 0;
  private wanderTargetX: number = 0;
  private isWokenByReturned: boolean = false;
  private lastPettingSpawnMs: number = 0;

  constructor(options: { rng: Rng; clock: Clock; settings: Settings; state?: Partial<PetState> }) {
    this.rng = options.rng;
    this.clock = options.clock;
    this.settings = options.settings;
    this.needs = new NeedsSystem(options.state, this.clock.now(), this.settings.personality);
  }

  public getState(): BehaviorState {
    return this.state;
  }

  public getNeeds(): NeedsSystem {
    return this.needs;
  }

  /** Context menu / tray: put the pet to sleep immediately. */
  public forceSleep() {
    if (this.state !== "SLEEPING") {
      this.transitionTo("SLEEPING");
    }
  }

  /** Context menu / tray: wake the pet up immediately. */
  public forceWake() {
    if (this.state === "SLEEPING") {
      this.isWokenByReturned = false;
      this.transitionTo("WAKING");
    }
  }

  /** Called when the Rust motion thread reports the walk target was reached. */
  public notifyArrived() {
    if (this.state === "WANDER" && this.subStep === 1) {
      // Jump ahead to the post-walk rest step
      this.subStep = 2;
      this.stateTimerMs = 0;
    } else if (this.state === "CHASING_CURSOR") {
      this.transitionTo("PAW_REACH");
    }
  }

  /** Called when the Rust motion thread reports a drag-drop landing. */
  public notifyLanded() {
    if (this.state === "FALLING") {
      this.transitionTo("IDLE");
    }
  }

  public update(dtSeconds: number, inputs: EngineInputs): EngineOutputs {
    const now = this.clock.now();

    // Defensive: never allow an invalid state to wedge the machine.
    const VALID_STATES: BehaviorState[] = [
      "IDLE", "WANDER", "CURIOUS", "CHASING_CURSOR", "PAW_REACH", "PETTING",
      "KISSING", "HAPPY", "EXCITED", "SURPRISED", "SCARED", "SAD", "BORED",
      "FUNNY_YAWN", "FUNNY_SCRATCH", "FUNNY_STRETCH", "FUNNY_SNEEZE",
      "FUNNY_ROLL", "FUNNY_BARK", "SLEEPING", "WAKING", "DRAGGED", "FALLING",
      "ATTENTION", "TV_WATCH", "TV_LAUGH", "BALL_POUNCE", "DANCE",
      "CHASE_TAIL", "HUNGRY",
    ];
    if (!VALID_STATES.includes(this.state)) {
      this.transitionTo("IDLE");
    }
    const dtMs = dtSeconds * 1000;
    this.stateTimerMs += dtMs;
    this.settings = inputs.settings;

    const prof = getEffectiveProfile(this.settings.personality, this.settings.reduceMotion);
    this.needs.update(dtSeconds, this.settings.personality, now);

    const fx: FxSpawn[] = [];
    const sound: SoundCue[] = [];
    let bubble: BubbleSpec | null = null;
    let moveIntent: MoveIntent | null = null;
    let anim: AnimationName = "idle_sit";

    // 1. High priority pointer interrupts (drag, click, petting, kissing)
    if (inputs.pointer.dragStart) {
      this.transitionTo("DRAGGED");
    } else if (this.state === "DRAGGED") {
      if (inputs.pointer.dragEnd) {
        this.transitionTo("FALLING");
      }
    } else if (this.state === "FALLING") {
      // The Rust motion thread emits pet://landed (notifyLanded); but if that
      // event is ever missed, release the pet after a beat so it never wedges.
      if (this.stateTimerMs > 600) {
        this.transitionTo("IDLE");
      }
    }

    // Wake conditions while asleep
    if (this.state === "SLEEPING") {
      let shouldWake = false;
      if (inputs.pointer.clicks.length > 0) {
        shouldWake = true;
      } else if (inputs.cursor && inputs.cursor.distance < 120 * inputs.stage.scale && inputs.cursor.speed > 300) {
        shouldWake = true;
      } else if (inputs.presence.returned && this.settings.wakeOnReturn) {
        shouldWake = true;
        this.isWokenByReturned = true;
      }

      if (shouldWake) {
        this.transitionTo("WAKING");
      }
    }

    // Process gestures if not sleeping, dragged, or falling
    if (this.state !== "SLEEPING" && this.state !== "WAKING" && this.state !== "DRAGGED" && this.state !== "FALLING") {
      if (inputs.pointer.spamClicks) {
        this.transitionTo("SURPRISED");
        fx.push({ kind: "exclaim" });
        sound.push({ id: "bark", volumeScale: 0.8 });
      } else if (inputs.pointer.doubleClick) {
        this.transitionTo("EXCITED");
        sound.push({ id: "yip" });
      } else if (inputs.pointer.clicks.some((c) => c.inFaceZone)) {
        this.transitionTo("KISSING");
        this.needs.onInteract("kiss", this.settings.personality, now);
        sound.push({ id: "kiss" });
        fx.push({ kind: "hearts", count: 3, big: true });
      } else if (inputs.pointer.pettingActive) {
        if (this.state !== "PETTING") {
          this.transitionTo("PETTING");
        }
        if (this.stateTimerMs - this.lastPettingSpawnMs > 800) {
          this.lastPettingSpawnMs = this.stateTimerMs;
          this.needs.onInteract("pet", this.settings.personality, now);
          fx.push({ kind: "hearts", count: 6 });
          sound.push({ id: "purr", volumeScale: 0.6 });
        }
      } else if (inputs.pointer.clicks.length > 0) {
        this.needs.onInteract("click", this.settings.personality, now);
        sound.push({ id: "pop" });
        this.transitionTo("HAPPY");
      }
    }

    // 2. Cursor fast approach -> SCARED
    if (this.state === "IDLE" && inputs.cursor && inputs.cursor.speed > 1600 && inputs.cursor.approaching && inputs.cursor.distance < 200) {
      if (this.needs.isOffCooldown("scared", now)) {
        this.needs.setCooldown("scared", 60, this.settings.personality, now);
        this.transitionTo("SCARED");
        fx.push({ kind: "exclaim" });
      }
    }

    // 3. Cursor chase trigger (eager: any brisk approach within reach)
    if (this.state === "IDLE" && this.settings.cursorInteraction && inputs.cursor && inputs.cursor.speed > 350 && inputs.cursor.distance < 420 * inputs.stage.scale) {
      if (this.needs.isOffCooldown("chase", now)) {
        this.needs.setCooldown("chase", 20 * prof.cooldownScale, this.settings.personality, now);
        this.transitionTo("CHASING_CURSOR");
        sound.push({ id: "yip" });
      }
    }

    // 4. Cursor curious trigger
    if (this.state === "IDLE" && this.settings.cursorInteraction && inputs.cursor && inputs.cursor.distance < 160 * inputs.stage.scale && inputs.cursor.dwellCuriousMs > 600 && inputs.cursor.speed < 200) {
      if (this.needs.isOffCooldown("curious", now)) {
        this.needs.setCooldown("curious", 6, this.settings.personality, now);
        this.transitionTo("CURIOUS");
        fx.push({ kind: "question" });
      }
    }

    // 5. State Machine execution
    switch (this.state) {
      case "IDLE": {
        // Face cursor if nearby
        if (inputs.cursor && inputs.cursor.distance < 260 * inputs.stage.scale) {
          if (inputs.cursor.look === "left") {
            anim = "look_left";
            this.facing = "left";
          } else if (inputs.cursor.look === "right") {
            anim = "look_right";
            this.facing = "right";
          } else if (inputs.cursor.look === "up") {
            anim = "look_up";
          } else if (inputs.cursor.look === "down") {
            anim = "look_down";
          } else {
            anim = "idle_sit";
          }
        } else {
          anim = "idle_sit";
        }

        if (this.stateTimerMs >= this.stateDurationMs) {
          this.pickNextIdleState(now, prof, inputs.stage.window.x);
        }
        break;
      }

      case "WANDER": {
        // Sub-steps: 0: stand_up, 1: walk/run, 2: stand_idle, 3: sit_down
        if (this.subStep === 0) {
          anim = "stand_up";
          if (this.stateTimerMs >= 500) {
            this.subStep = 1;
            this.stateTimerMs = 0;
            const dist = this.rng.nextFloat(200, 700);
            const dir = this.rng.chance(0.5) ? 1 : -1;
            this.facing = dir > 0 ? "right" : "left";
            this.wanderTargetX = inputs.stage.window.x + dist * dir;
          }
        } else if (this.subStep === 1) {
          const isRun = this.settings.personality === "chaotic" && this.rng.chance(0.15);
          anim = isRun ? "run" : "walk";
          const speed = isRun ? 260 : 70;
          // Walk horizontally, level with wherever the pet currently is
          // (it may be mid-screen after a drop — do not snap it to the bottom).
          moveIntent = { targetX: this.wanderTargetX, speed };

          const distRemaining = Math.abs(this.wanderTargetX - inputs.stage.window.x);
          if (distRemaining < 10 || this.stateTimerMs >= 8000) {
            this.subStep = 2;
            this.stateTimerMs = 0;
            moveIntent = null;
          }
        } else if (this.subStep === 2) {
          anim = "stand_idle";
          if (this.stateTimerMs >= this.rng.nextFloat(600, 2500)) {
            this.subStep = 3;
            this.stateTimerMs = 0;
          }
        } else if (this.subStep === 3) {
          anim = "sit_down";
          if (this.stateTimerMs >= 500) {
            this.transitionTo("IDLE");
          }
        }
        break;
      }

      case "CHASING_CURSOR": {
        if (inputs.cursor) {
          this.facing = inputs.cursor.x > 128 ? "right" : "left";
          anim = "run";
          // cursor.x is window-LOCAL logical px — convert to a screen-space
          // physical target so the pet actually chases toward the cursor.
          const cursorScreenX =
            inputs.stage.window.x + inputs.cursor.x * inputs.stage.scaleFactor;
          moveIntent = { targetX: cursorScreenX, speed: 260 };

          // Trip chance
          if (!this.settings.reduceMotion && this.needs.isOffCooldown("trip", now) && this.rng.chance(0.01)) {
            this.needs.setCooldown("trip", 60, this.settings.personality, now);
            this.transitionTo("FUNNY_ROLL"); // trip / roll
            fx.push({ kind: "dizzy" });
            sound.push({ id: "thud" });
            break;
          }

          if (this.stateTimerMs >= 6000 || inputs.cursor.distance < 60) {
            this.transitionTo("PAW_REACH");
          }
        } else {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "PAW_REACH": {
        anim = "paw_reach";
        if (this.stateTimerMs >= 1000) {
          this.transitionTo("HAPPY");
        }
        break;
      }

      case "CURIOUS": {
        anim = "curious";
        if (this.stateTimerMs >= 4000) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "PETTING": {
        anim = "petting";
        if (!inputs.pointer.pettingActive && this.stateTimerMs - this.lastPettingSpawnMs > 600) {
          this.transitionTo("HAPPY");
        }
        break;
      }

      case "KISSING": {
        anim = "kiss";
        if (this.stateTimerMs >= 1200) {
          this.transitionTo("HAPPY");
        }
        break;
      }

      case "HAPPY": {
        anim = "happy";
        if (this.stateTimerMs >= 3000) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "EXCITED": {
        anim = "excited";
        if (this.stateTimerMs >= 2500) {
          this.transitionTo("HAPPY");
        }
        break;
      }

      case "SURPRISED": {
        anim = "surprised";
        if (this.stateTimerMs >= 1200) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "SCARED": {
        anim = "scared";
        if (this.stateTimerMs >= 2000) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "SAD": {
        anim = "sad";
        if (this.stateTimerMs >= 6000) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "BORED": {
        anim = "bored_sigh";
        if (this.stateTimerMs >= 1500) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "FUNNY_YAWN": {
        anim = "yawn";
        if (this.stateTimerMs >= 1800) this.transitionTo("IDLE");
        break;
      }
      case "FUNNY_SCRATCH": {
        anim = "scratch_ear";
        if (this.stateTimerMs >= 2000) this.transitionTo("IDLE");
        break;
      }
      case "FUNNY_STRETCH": {
        anim = "stretch";
        if (this.stateTimerMs >= 1800) this.transitionTo("IDLE");
        break;
      }
      case "FUNNY_SNEEZE": {
        anim = "sneeze";
        if (this.stateTimerMs >= 1500) this.transitionTo("IDLE");
        break;
      }
      case "FUNNY_ROLL": {
        anim = "roll_over";
        if (this.stateTimerMs >= 2400) this.transitionTo("IDLE");
        break;
      }
      case "FUNNY_BARK": {
        anim = "bark";
        if (this.stateTimerMs >= 1000) this.transitionTo("IDLE");
        break;
      }

      case "SLEEPING": {
        anim = "sleep_loop";
        if (Math.floor(this.stateTimerMs / 1400) > Math.floor((this.stateTimerMs - dtMs) / 1400)) {
          fx.push({ kind: "zzz" });
        }
        // Snore: gentle saw-wave breath sound every ~4 s (60% of cycles)
        if (!this.settings.reduceMotion && Math.floor(this.stateTimerMs / 4200) > Math.floor((this.stateTimerMs - dtMs) / 4200) && this.rng.chance(0.6)) {
          sound.push({ id: "snore", volumeScale: 0.35 });
        }
        break;
      }

      case "WAKING": {
        anim = "wake_up";
        if (this.stateTimerMs >= 1200) {
          this.needs.asleep = false;
          if (this.isWokenByReturned) {
            this.isWokenByReturned = false;
            this.transitionTo("EXCITED");
            sound.push({ id: "happy" });
          } else {
            this.transitionTo("IDLE");
          }
        }
        break;
      }

      case "ATTENTION": {
        // Attention-seeking: bark + paw reach until noticed (petted/clicked/kissed)
        anim = this.stateTimerMs % 2000 < 1000 ? "bark" : "paw_reach";
        if (this.stateTimerMs > 400 && Math.floor(this.stateTimerMs / 1400) > Math.floor((this.stateTimerMs - dtMs) / 1400)) {
          sound.push({ id: "bark", volumeScale: 0.9 });
          bubble = { text: ["Woof!", "Hey!", "Play with me?", "Pet me? 🥺"][Math.floor(this.rng.nextFloat(0, 4))] || "Woof!", durationMs: 1600 };
        }
        if (inputs.pointer.pettingActive || inputs.pointer.clicks.length > 0 || inputs.pointer.doubleClick) {
          this.needs.onInteract("click", this.settings.personality, now);
          this.needs.setCooldown("attention", 240, this.settings.personality, now);
          this.transitionTo("HAPPY");
        } else if (this.stateTimerMs >= 6000) {
          this.needs.setCooldown("attention", 180, this.settings.personality, now);
          this.transitionTo("SAD");
        }
        break;
      }

      case "TV_WATCH": {
        anim = "tv_watch";
        if (this.stateTimerMs > 3000 && this.rng.chance(0.35)) {
          this.transitionTo("TV_LAUGH");
        } else if (this.stateTimerMs >= 9000) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "TV_LAUGH": {
        anim = "tv_laugh";
        if (Math.floor(this.stateTimerMs / 700) > Math.floor((this.stateTimerMs - dtMs) / 700)) {
          fx.push({ kind: "laugh" });
        }
        if (this.stateTimerMs >= 3500) {
          this.transitionTo("TV_WATCH");
        }
        break;
      }

      case "BALL_POUNCE": {
        // pounce loop toward the ball: run at it, then pounce; ends happy
        if (this.subStep === 0) {
          anim = "run";
          this.facing = this.wanderTargetX >= inputs.stage.window.x ? "right" : "left";
          // draw the ball at its landing spot (window-local): target minus window x
          if (this.stateTimerMs < 50) {
            fx.push({ kind: "ball", x: 128 + (this.wanderTargetX - inputs.stage.window.x) });
          }
          moveIntent = { targetX: this.wanderTargetX, speed: 240 };
          if (Math.abs(this.wanderTargetX - inputs.stage.window.x) < 80 || this.stateTimerMs > 2500) {
            this.subStep = 1;
            this.stateTimerMs = 0;
            moveIntent = null;
          }
        } else {
          anim = "ball_pounce";
          if (this.subStep === 1 && this.stateTimerMs >= 600) {
            this.subStep = 2;
            sound.push({ id: "pop" });
            fx.push({ kind: "sparkles", count: 6 });
            // punt the ball away on impact
            fx.push({ kind: "ball", x: 128 + (this.wanderTargetX - inputs.stage.window.x) });
          }
          if (this.stateTimerMs >= 1300) {
            this.needs.onInteract("play", this.settings.personality, now);
            this.transitionTo("HAPPY");
          }
        }
        break;
      }

      case "DANCE": {
        anim = "dance";
        if (Math.floor(this.stateTimerMs / 1000) > Math.floor((this.stateTimerMs - dtMs) / 1000)) {
          fx.push({ kind: "note" });
        }
        if (this.stateTimerMs >= 3600) {
          this.transitionTo("HAPPY");
        }
        break;
      }

      case "CHASE_TAIL": {
        anim = "chase_tail";
        if (this.stateTimerMs >= 3200) {
          fx.push({ kind: "dizzy" });
          this.transitionTo("IDLE");
        }
        break;
      }

      case "HUNGRY": {
        anim = "hungry";
        if (this.stateTimerMs % 2400 < dtMs) {
          bubble = { text: "🐶 hungry…", durationMs: 1800 };
          sound.push({ id: "whimper", volumeScale: 0.7 });
        }
        if (inputs.pointer.clicks.length > 0 || inputs.pointer.pettingActive) {
          this.needs.onInteract("feed", this.settings.personality, now);
          fx.push({ kind: "hearts", count: 4 });
          this.transitionTo("HAPPY");
        } else if (this.stateTimerMs >= 5000) {
          this.transitionTo("IDLE");
        }
        break;
      }

      case "DRAGGED": {
        anim = "drag";
        break;
      }

      case "FALLING": {
        anim = "drag";
        if (inputs.stage.ground) {
          sound.push({ id: "thud" });
          fx.push({ kind: "dust" });
          this.transitionTo("IDLE");
        }
        break;
      }
    }

    // Determine cursor polling mode
    let cursorRateMode: "active" | "idle" | "sleep" | "off" = "idle";
    if (this.state === "SLEEPING") {
      cursorRateMode = "sleep";
    } else if (this.state === "CHASING_CURSOR" || this.state === "PETTING" || this.state === "DRAGGED") {
      cursorRateMode = "active";
    } else if (!this.settings.cursorInteraction) {
      cursorRateMode = "off";
    }

    return {
      state: this.state,
      animation: anim,
      facing: this.facing,
      moveIntent,
      fx,
      sound,
      bubble,
      cursorRateMode,
    };
  }

  private transitionTo(newState: BehaviorState) {
    this.state = newState;
    this.stateTimerMs = 0;
    this.subStep = 0;
    if (newState === "SLEEPING") {
      this.needs.asleep = true;
    }
  }

  private pickNextIdleState(now: number, prof: { wander: number; funny: number; sleep: number; chase: number; reaction: number }, stageX: number) {
    this.stateDurationMs = this.rng.nextFloat(4000, 12000);

    const ignoredMs = now - this.needs.lastInteractionAt;
    const weights: { item: BehaviorState | "FUNNY" | "PLAY"; weight: number }[] = [
      { item: "IDLE", weight: 14 },
      // Roaming is the pet's signature behaviour — make it clearly dominant
      { item: "WANDER", weight: this.settings.miniMode ? 0 : 46 * prof.wander },
      {
        item: "SLEEPING" as BehaviorState,
        weight: this.needs.energy < 40 ? Math.max(0, 60 - this.needs.energy) * prof.sleep : 0,
      },
      {
        item: "BORED" as BehaviorState,
        weight: this.needs.boredom > 60 && this.needs.isOffCooldown("bored", now) ? Math.max(0, this.needs.boredom - 50) : 0,
      },
      // Attention-seeking: ignored for 2+ minutes and off cooldown
      {
        item: "ATTENTION" as BehaviorState,
        weight:
          ignoredMs > 120_000 && this.needs.isOffCooldown("attention", now)
            ? 18 * prof.reaction
            : 0,
      },
      // Hungry: low energy but not sleepy yet
      {
        item: "HUNGRY" as BehaviorState,
        weight:
          this.needs.energy < 45 && this.needs.isOffCooldown("hungry", now) ? 12 : 0,
      },
      // TV time (V2 feature, art exists): watching TV when you're around but busy
      {
        item: "TV_WATCH" as BehaviorState,
        weight: !this.settings.miniMode && this.needs.isOffCooldown("tv", now) ? 10 : 0,
      },
      // PLAY bundle: ball pounce, dance, chase tail
      {
        item: "PLAY" as const,
        weight:
          !this.settings.miniMode && this.needs.boredom > 35 && this.needs.isOffCooldown("play_global", now)
            ? 22 * prof.funny
            : 0,
      },
      {
        item: "FUNNY" as const,
        weight: this.needs.isOffCooldown("funny_global", now) ? 25 * prof.funny : 0,
      },
    ];

    const pick = this.rng.weightedPick(weights);
    if (pick === "FUNNY") {
      this.needs.setCooldown("funny_global", 25, this.settings.personality, now);
      this.needs.onFunnyEvent();
      const funnies: { item: BehaviorState; key: string; cdSec: number }[] = [
        { item: "FUNNY_YAWN", key: "yawn", cdSec: 90 },
        { item: "FUNNY_SCRATCH", key: "scratch_ear", cdSec: 120 },
        { item: "FUNNY_STRETCH", key: "stretch", cdSec: 150 },
        { item: "FUNNY_SNEEZE", key: "sneeze", cdSec: 240 },
        { item: "FUNNY_ROLL", key: "roll_over", cdSec: 300 },
        { item: "FUNNY_BARK", key: "bark", cdSec: 180 },
      ];

      const available = funnies.filter((f) => this.needs.isOffCooldown(f.key, now));
      if (available.length > 0) {
        const chosen = this.rng.pick(available);
        this.needs.setCooldown(chosen.key, chosen.cdSec, this.settings.personality, now);
        this.transitionTo(chosen.item);
        return;
      }
    }

    if (pick === "PLAY") {
      const plays: { item: BehaviorState; key: string; cdSec: number }[] = [
        { item: "BALL_POUNCE", key: "ball", cdSec: 120 },
        { item: "DANCE", key: "dance", cdSec: 150 },
        { item: "CHASE_TAIL", key: "chase_tail", cdSec: 180 },
      ];
      const available = plays.filter((p) => this.needs.isOffCooldown(p.key, now));
      if (available.length > 0) {
        this.needs.setCooldown("play_global", 40, this.settings.personality, now);
        const chosen = this.rng.pick(available);
        this.needs.setCooldown(chosen.key, chosen.cdSec, this.settings.personality, now);
        if (chosen.item === "BALL_POUNCE") {
          // spawn the ball 150–400 px away, in a random direction
          const dist = this.rng.nextFloat(150, 400);
          const dir = this.rng.chance(0.5) ? 1 : -1;
          this.wanderTargetX = stageX + dist * dir;
          this.subStep = 0;
        }
        this.transitionTo(chosen.item);
        return;
      }
      // all plays on cooldown → just stay idle this round
      this.stateTimerMs = 0;
      return;
    }

    if (pick === "TV_WATCH") {
      this.needs.setCooldown("tv", 200, this.settings.personality, now);
      this.transitionTo("TV_WATCH");
      return;
    }

    if (pick === "IDLE" || pick === "FUNNY") {
      this.stateTimerMs = 0; // stay idle for another period
    } else {
      this.transitionTo(pick as BehaviorState);
    }
  }
}
