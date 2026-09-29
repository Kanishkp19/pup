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

  public update(dtSeconds: number, inputs: EngineInputs): EngineOutputs {
    const now = this.clock.now();
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

    // 3. Cursor chase trigger
    if (this.state === "IDLE" && this.settings.cursorInteraction && inputs.cursor && inputs.cursor.speed > 900 && inputs.cursor.distance < 500) {
      if (this.needs.isOffCooldown("chase", now)) {
        this.needs.setCooldown("chase", 20, this.settings.personality, now);
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
          this.pickNextIdleState(now, prof);
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
          moveIntent = { targetX: inputs.cursor.x, speed: 260 };

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

  private pickNextIdleState(now: number, prof: { wander: number; funny: number; sleep: number }) {
    this.stateDurationMs = this.rng.nextFloat(4000, 12000);

    const weights = [
      { item: "IDLE" as BehaviorState, weight: 30 },
      { item: "WANDER" as BehaviorState, weight: this.settings.miniMode ? 0 : 30 * prof.wander },
      {
        item: "SLEEPING" as BehaviorState,
        weight: this.needs.energy < 40 ? Math.max(0, 60 - this.needs.energy) * prof.sleep : 0,
      },
      {
        item: "BORED" as BehaviorState,
        weight: this.needs.boredom > 60 && this.needs.isOffCooldown("bored", now) ? Math.max(0, this.needs.boredom - 50) : 0,
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

    if (pick === "IDLE" || pick === "FUNNY") {
      this.stateTimerMs = 0; // stay idle for another period
    } else {
      this.transitionTo(pick);
    }
  }
}
