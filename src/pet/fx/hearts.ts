import { PALETTE } from "../../generated/palette";
import type { Particle } from "./particles";

export class HeartParticle implements Particle {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public life: number = 0;
  public maxLife: number;
  private startX: number;
  private size: number;
  private isBig: boolean;
  private swayFreq: number;

  constructor(x: number, y: number, isBig: boolean = false) {
    this.startX = x;
    this.x = x;
    this.y = y;
    this.isBig = isBig;
    this.size = isBig ? 24 : 12 + Math.random() * 4;
    this.maxLife = isBig ? 1400 : 1200;
    this.vx = (Math.random() - 0.5) * 10;
    this.vy = -(50 + Math.random() * 20); // rise ~60 px/s
    this.swayFreq = 2 + Math.random() * 2;
  }

  public update(dtMs: number): boolean {
    this.life += dtMs;
    if (this.life >= this.maxLife) return false;

    const t = this.life / 1000;
    this.y += (this.vy * dtMs) / 1000;
    this.x = this.startX + Math.sin(t * this.swayFreq * Math.PI) * 8;
    return true;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    const progress = this.life / this.maxLife;
    let alpha = 1.0;
    if (progress > 0.6) {
      alpha = 1.0 - (progress - 0.6) / 0.4;
    }

    let scale = 1.0;
    if (this.isBig) {
      scale = 1.0 + Math.sin(progress * Math.PI * 4) * 0.15;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const s = this.size;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.3);
    ctx.bezierCurveTo(-s * 0.5, -s * 0.2, -s * 0.5, -s * 0.6, 0, -s * 0.3);
    ctx.bezierCurveTo(s * 0.5, -s * 0.6, s * 0.5, -s * 0.2, 0, s * 0.3);

    ctx.fillStyle = PALETTE["--fx-heart"];
    ctx.fill();

    ctx.strokeStyle = PALETTE["--pup-outline"];
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Highlight
    ctx.beginPath();
    ctx.ellipse(-s * 0.15, -s * 0.35, s * 0.1, s * 0.06, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE["--fx-heart-light"];
    ctx.fill();

    ctx.restore();
  }
}

export function spawnPettingBurst(): HeartParticle[] {
  const count = 5 + Math.floor(Math.random() * 3);
  const hearts: HeartParticle[] = [];
  const headX = 128;
  const headY = 110;

  for (let i = 0; i < count; i++) {
    const x = headX + (Math.random() - 0.5) * 60;
    const y = headY + (Math.random() - 0.5) * 20;
    hearts.push(new HeartParticle(x, y, false));
  }
  return hearts;
}

export function spawnKissHearts(): HeartParticle[] {
  const hearts: HeartParticle[] = [];
  const headX = 128;
  const headY = 120;
  hearts.push(new HeartParticle(headX, headY, true));
  for (let i = 0; i < 3; i++) {
    const x = headX + (Math.random() - 0.5) * 40;
    const y = headY + (Math.random() - 0.5) * 20;
    hearts.push(new HeartParticle(x, y, false));
  }
  return hearts;
}
