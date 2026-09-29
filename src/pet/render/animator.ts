import { ANIMATIONS } from "../../generated/animations";
import type { AnimationName, AnimationMeta } from "../../generated/animations";
import type { Facing } from "../../shared/types";

export interface AnimatorRenderState {
  animation: AnimationName;
  frameIndex: number;
  facing: Facing;
  mirror: boolean;
  crossfade?: {
    fromAnimation: AnimationName;
    fromFrame: number;
    alpha: number; // 0 to 1
  };
}

export class Animator {
  private currentAnimation: AnimationName = "idle_sit";
  private currentMeta: AnimationMeta = ANIMATIONS.idle_sit;
  private frameIndex: number = 0;
  private elapsedInFrameMs: number = 0;
  private facing: Facing = "right";
  private crossfade: {
    fromAnimation: AnimationName;
    fromFrame: number;
    elapsedMs: number;
    durationMs: number;
  } | null = null;
  private isFinished: boolean = false;

  constructor() {}

  public play(name: AnimationName, reset: boolean = false, crossfadeDurationMs: number = 120) {
    if (this.currentAnimation === name && !reset && !this.isFinished) {
      return;
    }

    const nextMeta = ANIMATIONS[name];
    if (!nextMeta) {
      console.warn(`Animation "${name}" not found in metadata!`);
      return;
    }

    if (crossfadeDurationMs > 0 && this.currentAnimation !== name) {
      this.crossfade = {
        fromAnimation: this.currentAnimation,
        fromFrame: this.frameIndex,
        elapsedMs: 0,
        durationMs: crossfadeDurationMs,
      };
    } else {
      this.crossfade = null;
    }

    this.currentAnimation = name;
    this.currentMeta = nextMeta;
    this.frameIndex = 0;
    this.elapsedInFrameMs = 0;
    this.isFinished = false;
  }

  public setFacing(facing: Facing) {
    this.facing = facing;
  }

  public getFacing(): Facing {
    return this.facing;
  }

  public getCurrentAnimation(): AnimationName {
    return this.currentAnimation;
  }

  public getFrameIndex(): number {
    return this.frameIndex;
  }

  public update(dtMs: number): { changed: boolean; soundCue?: string | undefined } {
    let changed = false;
    let cue: string | undefined = undefined;

    if (this.crossfade) {
      this.crossfade.elapsedMs += dtMs;
      changed = true;
      if (this.crossfade.elapsedMs >= this.crossfade.durationMs) {
        this.crossfade = null;
      }
    }

    if (this.isFinished) {
      return { changed };
    }

    this.elapsedInFrameMs += dtMs;
    const frameMsList = this.currentMeta.frameMs;
    const currentFrameDuration = frameMsList[this.frameIndex] ?? (1000 / this.currentMeta.fps);

    if (this.elapsedInFrameMs >= currentFrameDuration) {
      this.elapsedInFrameMs -= currentFrameDuration;
      const nextIndex = this.frameIndex + 1;

      if (nextIndex >= this.currentMeta.frames) {
        if (this.currentMeta.loop) {
          this.frameIndex = 0;
          changed = true;
        } else {
          this.isFinished = true;
          this.frameIndex = this.currentMeta.frames - 1;
        }
      } else {
        this.frameIndex = nextIndex;
        changed = true;
      }

      if (this.currentMeta.soundCue && this.currentMeta.soundCue.frame === this.frameIndex) {
        cue = this.currentMeta.soundCue.sound;
      }
    }

    return { changed, soundCue: cue };
  }

  public getRenderState(): AnimatorRenderState {
    const mirror = this.facing === "left" && this.currentMeta.mirrorable;
    const state: AnimatorRenderState = {
      animation: this.currentAnimation,
      frameIndex: this.frameIndex,
      facing: this.facing,
      mirror,
    };

    if (this.crossfade) {
      const t = Math.min(1.0, this.crossfade.elapsedMs / this.crossfade.durationMs);
      state.crossfade = {
        fromAnimation: this.crossfade.fromAnimation,
        fromFrame: this.crossfade.fromFrame,
        alpha: 1.0 - t,
      };
    }

    return state;
  }
}
