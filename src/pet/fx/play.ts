import { PALETTE } from "../../generated/palette";
import type { Particle } from "./particles";

/** "Ha ha" laugh puff for TV_LAUGH. */
export class LaughParticle implements Particle {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number = -30;
  public life: number = 0;
  public maxLife: number = 900;
  private text: string;

  constructor(x: number = 150, y: number = 110, seed: number = 0) {
    this.x = x + (seed % 3) * 10 - 10;
    this.y = y - (seed % 2) * 8;
    this.vx = (seed % 2 === 0 ? 1 : -1) * (14 + (seed % 3) * 6);
    this.text = seed % 2 === 0 ? "ha" : "Ha";
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
    const alpha = progress < 0.7 ? 1.0 : 1.0 - (progress - 0.7) / 0.3;
    ctx.save();
    ctx.font = `bold ${Math.round(11 + progress * 5)}px ui-rounded, system-ui, sans-serif`;
    ctx.fillStyle = PALETTE["--fx-heart"];
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

/** Music note for DANCE. */
export class NoteParticle implements Particle {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number = -34;
  public life: number = 0;
  public maxLife: number = 1200;
  private glyph: string;
  private wobble: number;

  constructor(x: number = 150, y: number = 110, seed: number = 0) {
    this.x = x + (seed % 4) * 9 - 14;
    this.y = y - (seed % 3) * 6;
    this.vx = (seed % 2 === 0 ? 1 : -1) * 10;
    this.glyph = seed % 2 === 0 ? "♪" : "♫";
    this.wobble = seed * 1.7;
  }

  public update(dtMs: number): boolean {
    this.life += dtMs;
    const dtSec = dtMs / 1000;
    this.wobble += dtSec * 6;
    this.x += (this.vx + Math.sin(this.wobble) * 12) * dtSec;
    this.y += this.vy * dtSec;
    return this.life < this.maxLife;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    const progress = this.life / this.maxLife;
    const alpha = progress < 0.75 ? 1.0 : 1.0 - (progress - 0.75) / 0.25;
    ctx.save();
    ctx.font = `bold ${Math.round(13 + progress * 4)}px system-ui, sans-serif`;
    ctx.fillStyle = PALETTE["--fx-zzz"];
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillText(this.glyph, this.x, this.y);
    ctx.restore();
  }
}

/** The toy ball for BALL_POUNCE: code-drawn, sits on the ground, drifts when pounced. */
export class BallParticle implements Particle {
  public x: number;
  public y: number = 242; // ground line (window-local logical)
  public vx: number = 0;
  public vy: number = 0;
  public life: number = 0;
  public maxLife: number = 3000;
  private readonly r = 11;

  constructor(x: number = 128) {
    this.x = x;
  }

  public update(dtMs: number): boolean {
    this.life += dtMs;
    const dtSec = dtMs / 1000;
    // gentle settle physics
    this.x += this.vx * dtSec;
    this.y += this.vy * dtSec;
    this.vy += 300 * dtSec; // small gravity so a punted ball bounces down
    if (this.y > 242) {
      this.y = 242;
      this.vy = this.vy > 60 ? -this.vy * 0.4 : 0;
    }
    this.vx *= 1 - 1.2 * dtSec; // friction
    return this.life < this.maxLife;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    const progress = this.life / this.maxLife;
    const alpha = progress > 0.85 ? 1.0 - (progress - 0.85) / 0.15 : 1.0;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    // ball body
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.r, this.r, 0, Math.PI * 2);
    ctx.fillStyle = "#E85D5D";
    ctx.fill();
    // stripe
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.r, this.r, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#FBE8C4";
    ctx.stroke();
    // shine
    ctx.beginPath();
    ctx.arc(this.x - 3.5, this.y - this.r - 3.5, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    // ground shadow
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, this.r * 0.9, 2.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(60,40,30,0.25)";
    ctx.fill();
    ctx.restore();
  }
}
