import { clamp } from "../../shared/math";
import type { PetState, Personality } from "../../shared/types";
import { PERSONALITY_PROFILES } from "./personalities";

export class NeedsSystem {
  public energy: number;
  public boredom: number;
  public affection: number;
  public asleep: boolean;
  public lastInteractionAt: number;
  public cooldownsUntil: Map<string, number>;
  public lastBubbleAt: number;

  constructor(initialState?: Partial<PetState>, now: number = Date.now(), personality: Personality = "happy") {
    this.energy = initialState?.energy ?? 80;
    this.boredom = initialState?.boredom ?? 20;
    this.affection = initialState?.affection ?? 50;
    this.asleep = initialState?.asleep ?? false;
    this.lastInteractionAt = initialState?.lastInteractionAt ?? now;
    this.cooldownsUntil = new Map(Object.entries(initialState?.cooldownsUntil ?? {}));
    this.lastBubbleAt = initialState?.lastBubbleAt ?? 0;

    // Apply offline decay if savedAt is provided
    if (initialState?.savedAt && initialState.savedAt < now) {
      const elapsedSec = Math.min(8 * 3600, (now - initialState.savedAt) / 1000);
      this.applyOfflineDecay(elapsedSec, personality);
    }
  }

  public update(dtSeconds: number, personality: Personality, now: number) {
    const prof = PERSONALITY_PROFILES[personality];

    // Energy
    if (this.asleep) {
      this.energy += (2 / 10) * dtSeconds; // +2 / 10 s
    } else {
      this.energy -= (1 / 60) * prof.energyDecay * dtSeconds; // -1 / 60 s
    }
    this.energy = clamp(this.energy, 0, 100);

    // Boredom
    if (!this.asleep) {
      const timeSinceInteractionSec = (now - this.lastInteractionAt) / 1000;
      if (timeSinceInteractionSec > 0) {
        this.boredom += (1 / 20) * dtSeconds; // +1 / 20 s
        this.boredom = clamp(this.boredom, 0, 100);
      }
    }

    // Affection passive decay (-1 / 300 s without interaction)
    if (!this.asleep) {
      const timeSinceInteractionSec = (now - this.lastInteractionAt) / 1000;
      if (timeSinceInteractionSec > 300) {
        this.affection -= (1 / 300) * dtSeconds;
        this.affection = clamp(this.affection, 0, 100);
      }
    }
  }

  public onInteract(kind: "click" | "pet" | "kiss" | "play" | "feed", personality: Personality, now: number) {
    const prof = PERSONALITY_PROFILES[personality];
    this.lastInteractionAt = now;
    this.boredom = Math.max(0, this.boredom - (kind === "play" ? 55 : 40));

    if (kind === "click") {
      this.affection = clamp(this.affection + 3 * prof.petGain, 0, 100);
    } else if (kind === "pet") {
      this.affection = clamp(this.affection + 8 * prof.petGain, 0, 100);
    } else if (kind === "kiss") {
      this.affection = clamp(this.affection + 12 * prof.petGain, 0, 100);
    } else if (kind === "play") {
      this.affection = clamp(this.affection + 10 * prof.petGain, 0, 100);
      this.energy = clamp(this.energy - 3, 0, 100);
    } else if (kind === "feed") {
      this.affection = clamp(this.affection + 6 * prof.petGain, 0, 100);
    }
  }

  public onFunnyEvent() {
    this.boredom = Math.max(0, this.boredom - 5);
  }

  public isOffCooldown(key: string, now: number): boolean {
    const until = this.cooldownsUntil.get(key) ?? 0;
    return now >= until;
  }

  public setCooldown(key: string, durationSec: number, personality: Personality, now: number) {
    const prof = PERSONALITY_PROFILES[personality];
    const durationMs = durationSec * 1000 * prof.cooldownScale;
    this.cooldownsUntil.set(key, now + durationMs);
  }

  public toState(now: number): PetState {
    const cdObj: Record<string, number> = {};
    for (const [k, v] of this.cooldownsUntil.entries()) {
      if (v > now) {
        cdObj[k] = v;
      }
    }

    return {
      schemaVersion: 1,
      energy: Math.round(this.energy * 10) / 10,
      boredom: Math.round(this.boredom * 10) / 10,
      affection: Math.round(this.affection * 10) / 10,
      asleep: this.asleep,
      savedAt: now,
      lastInteractionAt: this.lastInteractionAt,
      cooldownsUntil: cdObj,
      lastBubbleAt: this.lastBubbleAt,
    };
  }

  private applyOfflineDecay(elapsedSec: number, personality: Personality) {
    const prof = PERSONALITY_PROFILES[personality];
    if (this.asleep) {
      this.energy = clamp(this.energy + (2 / 10) * elapsedSec, 0, 100);
    } else {
      this.energy = clamp(this.energy - (1 / 60) * prof.energyDecay * elapsedSec, 0, 100);
      this.boredom = clamp(this.boredom + (1 / 20) * elapsedSec, 0, 100);
      this.affection = clamp(this.affection - (1 / 300) * elapsedSec, 0, 100);
    }
  }
}
