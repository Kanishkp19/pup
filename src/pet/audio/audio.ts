import type { SoundId } from "../../shared/types";
import { playSynthPatch } from "./synth";

interface SoundMeta {
  cooldownMs: number;
  volume: number;
}

const SOUND_MANIFEST: Record<SoundId, SoundMeta> = {
  bark: { cooldownMs: 4000, volume: 0.8 },
  yip: { cooldownMs: 3000, volume: 0.7 },
  happy: { cooldownMs: 6000, volume: 0.7 },
  purr: { cooldownMs: 5000, volume: 0.6 },
  kiss: { cooldownMs: 2000, volume: 0.8 },
  sneeze: { cooldownMs: 6000, volume: 0.7 },
  yawn: { cooldownMs: 8000, volume: 0.6 },
  whimper: { cooldownMs: 10000, volume: 0.5 },
  pop: { cooldownMs: 200, volume: 0.6 },
  thud: { cooldownMs: 500, volume: 0.9 },
  snore: { cooldownMs: 4000, volume: 0.4 },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private lastPlayed = new Map<SoundId, number>();
  private masterVolume: number = 0.5;
  private isMuted: boolean = false;

  constructor() {}

  public initOnGesture() {
    if (!this.ctx && typeof AudioContext !== "undefined") {
      this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public suspend() {
    if (this.ctx && this.ctx.state === "running") {
      void this.ctx.suspend();
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  public play(id: SoundId, volumeScale: number = 1.0) {
    if (this.isMuted || this.masterVolume <= 0) return;

    const meta = SOUND_MANIFEST[id];
    if (!meta) return;

    const now = performance.now();
    const last = this.lastPlayed.get(id) ?? 0;
    if (now - last < meta.cooldownMs) {
      return;
    }
    this.lastPlayed.set(id, now);

    this.initOnGesture();
    if (!this.ctx) return;

    playSynthPatch(this.ctx, id, this.masterVolume * meta.volume, volumeScale);
  }
}
