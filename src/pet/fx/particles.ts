import { MAX_PARTICLES } from "../../shared/constants";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  update(dtMs: number): boolean; // returns false if dead
  draw(ctx: CanvasRenderingContext2D): void;
}

export class ParticlePool {
  private particles: Particle[] = [];

  public spawn(particle: Particle) {
    if (this.particles.length < MAX_PARTICLES) {
      this.particles.push(particle);
    }
  }

  public update(dtMs: number) {
    this.particles = this.particles.filter((p) => p.update(dtMs));
  }

  public draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.save();
      p.draw(ctx);
      ctx.restore();
    }
  }

  public clear() {
    this.particles = [];
  }

  public get count(): number {
    return this.particles.length;
  }
}
