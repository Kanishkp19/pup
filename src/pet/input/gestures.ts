import { dist } from "../../shared/math";

export const FACE_CENTER = { x: 128, y: 165 };
export const FACE_RADIUS = 28;

export const HEAD_CENTER = { x: 128, y: 140 };
export const HEAD_RADIUS = 48;

export function isInFaceZone(x: number, y: number): boolean {
  return dist(x, y, FACE_CENTER.x, FACE_CENTER.y) <= FACE_RADIUS;
}

export function isInHeadZone(x: number, y: number): boolean {
  return dist(x, y, HEAD_CENTER.x, HEAD_CENTER.y) <= HEAD_RADIUS;
}

export function isInBodyZone(x: number, y: number): boolean {
  const dx = (x - 128) / 50;
  const dy = (y - 200) / 45;
  return dx * dx + dy * dy <= 1.0;
}

export interface StrokePoint {
  x: number;
  y: number;
  t: number;
}

export class GestureRecognizer {
  private recentClicks: { x: number; y: number; inFaceZone: boolean; t: number }[] = [];
  private strokeHistory: StrokePoint[] = [];

  public addClick(x: number, y: number, now: number): { isDoubleClick: boolean; isSpam: boolean } {
    const inFace = isInFaceZone(x, y);
    this.recentClicks.push({ x, y, inFaceZone: inFace, t: now });

    // Clean old clicks > 1.5s
    this.recentClicks = this.recentClicks.filter((c) => now - c.t <= 1500);

    const isSpam = this.recentClicks.length >= 4;

    let isDoubleClick = false;
    if (this.recentClicks.length >= 2) {
      const prev = this.recentClicks[this.recentClicks.length - 2]!;
      const curr = this.recentClicks[this.recentClicks.length - 1]!;
      if (curr.t - prev.t <= 350 && dist(curr.x, curr.y, prev.x, prev.y) <= 16) {
        isDoubleClick = true;
      }
    }

    return { isDoubleClick, isSpam };
  }

  public addPointerMove(x: number, y: number, now: number) {
    this.strokeHistory.push({ x, y, t: now });
    this.strokeHistory = this.strokeHistory.filter((p) => now - p.t <= 1200);
  }

  public isPettingActive(_now: number): boolean {
    if (this.strokeHistory.length < 6) return false;

    let inHeadCount = 0;
    let reversals = 0;
    let lastDx = 0;

    for (let i = 1; i < this.strokeHistory.length; i++) {
      const prev = this.strokeHistory[i - 1]!;
      const curr = this.strokeHistory[i]!;

      if (isInHeadZone(curr.x, curr.y)) {
        inHeadCount++;
      }

      const dx = curr.x - prev.x;
      if (Math.abs(dx) > 3) {
        if (lastDx !== 0 && Math.sign(dx) !== Math.sign(lastDx)) {
          reversals++;
        }
        lastDx = dx;
      }
    }

    const inHeadRatio = inHeadCount / this.strokeHistory.length;
    return inHeadRatio > 0.6 && reversals >= 2;
  }

  public getClicksAndClear(): { x: number; y: number; inFaceZone: boolean; t: number }[] {
    const clicks = [...this.recentClicks];
    return clicks;
  }
}
