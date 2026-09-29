import { PALETTE } from "../../generated/palette";
import type { Particle } from "./particles";

export class ZzzParticle implements Particle {
  public x: number;
  public y: number;
  public vx: number = 10;
  public vy: number = -24; // 24 px/s rise
  public life: number = 0;
  public maxLife: number = 2000;
  private letter: string;

  constructor(x: number = 145, y: number = 120, letterIndex: number = 0) {
    this.x = x;
    this.y = y;
    this.letter = letterIndex === 0 ? "z" : letterIndex === 1 ? "Z" : "Z";
  }

  public update(dtMs: number): boolean {
    this.life += dtMs;
    if (this.life >= this.maxLife) return false;

    const dtSec = dtMs / 1000;
    this.x += this.vx * dtSec;
    this.y += this.vy * dtSec;
    return true;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    const progress = this.life / this.maxLife;
    const fontSize = 10 + progress * 6; // 10 -> 16 px
    const alpha = progress < 0.8 ? 1.0 : 1.0 - (progress - 0.8) / 0.2;

    ctx.save();
    ctx.font = `bold ${Math.round(fontSize)}px ui-rounded, system-ui, sans-serif`;
    ctx.fillStyle = PALETTE["--fx-zzz"];
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillText(this.letter, this.x, this.y);
    ctx.restore();
  }
}
