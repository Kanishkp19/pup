import { PALETTE } from "../../generated/palette";
import type { Particle } from "./particles";

export class ExclamationParticle implements Particle {
  public x: number = 128;
  public y: number = 75;
  public vx: number = 0;
  public vy: number = -15;
  public life: number = 0;
  public maxLife: number = 800;

  public update(dtMs: number): boolean {
    this.life += dtMs;
    this.y += (this.vy * dtMs) / 1000;
    return this.life < this.maxLife;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    const alpha = this.life < 600 ? 1.0 : 1.0 - (this.life - 600) / 200;
    ctx.save();
    ctx.font = "bold 24px ui-rounded, system-ui, sans-serif";
    ctx.fillStyle = PALETTE["--pup-outline"];
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillText("!", this.x, this.y);
    ctx.restore();
  }
}

export class QuestionParticle implements Particle {
  public x: number = 145;
  public y: number = 80;
  public vx: number = 0;
  public vy: number = -12;
  public life: number = 0;
  public maxLife: number = 1000;

  public update(dtMs: number): boolean {
    this.life += dtMs;
    this.y += (this.vy * dtMs) / 1000;
    return this.life < this.maxLife;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    const alpha = this.life < 800 ? 1.0 : 1.0 - (this.life - 800) / 200;
    ctx.save();
    ctx.font = "bold 22px ui-rounded, system-ui, sans-serif";
    ctx.fillStyle = PALETTE["--pup-outline"];
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillText("?", this.x, this.y);
    ctx.restore();
  }
}

export class DustParticle implements Particle {
  public x: number;
  public y: number = 240;
  public vx: number;
  public vy: number;
  public life: number = 0;
  public maxLife: number = 400;

  constructor(x: number = 128, dir: number = 1) {
    this.x = x;
    this.vx = dir * (20 + Math.random() * 30);
    this.vy = -(10 + Math.random() * 15);
  }

  public update(dtMs: number): boolean {
    this.life += dtMs;
    const dtSec = dtMs / 1000;
    this.x += this.vx * dtSec;
    this.y += this.vy * dtSec;
    return this.life < this.maxLife;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    const progress = this.life / this.maxLife;
    const r = 4 + progress * 6;
    const alpha = 1.0 - progress;

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180, 160, 140, " + Math.max(0, alpha * 0.5) + ")";
    ctx.fill();
    ctx.restore();
  }
}
