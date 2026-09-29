import { FEET_Y_LOGICAL } from "../../shared/constants";
import { dist } from "../../shared/math";
import type { CursorInfo } from "../../shared/types";

export class CursorProcessor {
  private lastX: number = 0;
  private lastY: number = 0;
  private smoothedSpeed: number = 0;
  private dwellCuriousMs: number = 0;
  private dwellNearMs: number = 0;
  private currentLook: "center" | "left" | "right" | "up" | "down" = "center";
  private candidateLook: "center" | "left" | "right" | "up" | "down" = "center";
  private candidateHeldMs: number = 0;
  private timeSinceLastSwitchMs: number = 9999;

  public process(
    raw: { x: number; y: number; ts: number } | null,
    winPos: { x: number; y: number },
    scale: number,
    scaleFactor: number,
    dtMs: number
  ): CursorInfo | null {
    if (!raw) {
      this.smoothedSpeed = 0;
      this.dwellCuriousMs = 0;
      this.dwellNearMs = 0;
      return null;
    }

    const localX = (raw.x - winPos.x) / scaleFactor;
    const localY = (raw.y - winPos.y) / scaleFactor;

    const petCenterX = 128;
    const petCenterY = FEET_Y_LOGICAL - 70 * scale;

    const dx = localX - petCenterX;
    const dy = localY - petCenterY;
    const d = dist(localX, localY, petCenterX, petCenterY);

    const dtSec = dtMs > 0 ? dtMs / 1000 : 0.033;
    const moveDist = dist(localX, localY, this.lastX, this.lastY);
    const instantSpeed = moveDist / dtSec;
    const alpha = 0.35;
    this.smoothedSpeed = alpha * instantSpeed + (1 - alpha) * this.smoothedSpeed;

    const velX = localX - this.lastX;
    const velY = localY - this.lastY;
    const dot = velX * -dx + velY * -dy;
    const approaching = dot > 0;

    if (d < 160 * scale) {
      this.dwellCuriousMs += dtMs;
    } else {
      this.dwellCuriousMs = 0;
    }

    if (d < 90 * scale) {
      this.dwellNearMs += dtMs;
    } else {
      this.dwellNearMs = 0;
    }

    let sector: "center" | "left" | "right" | "up" | "down" = "center";
    if (d < 40 * scale) {
      sector = "center";
    } else if (Math.abs(dx) > 0.8 * Math.abs(dy)) {
      sector = dx < 0 ? "left" : "right";
    } else {
      sector = dy < 0 ? "up" : "down";
    }

    this.timeSinceLastSwitchMs += dtMs;
    if (sector === this.currentLook) {
      this.candidateHeldMs = 0;
    } else if (sector === this.candidateLook) {
      this.candidateHeldMs += dtMs;
      if (this.candidateHeldMs >= 150 && this.timeSinceLastSwitchMs >= 250) {
        this.currentLook = sector;
        this.timeSinceLastSwitchMs = 0;
      }
    } else {
      this.candidateLook = sector;
      this.candidateHeldMs = dtMs;
    }

    this.lastX = localX;
    this.lastY = localY;

    return {
      x: localX,
      y: localY,
      dx,
      dy,
      distance: d,
      speed: this.smoothedSpeed,
      approaching,
      dwellCuriousMs: this.dwellCuriousMs,
      dwellNearMs: this.dwellNearMs,
      look: this.currentLook,
    };
  }
}
