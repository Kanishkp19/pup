import { PALETTE } from "../../generated/palette";
import type { BubbleSpec } from "../../shared/types";

export class SpeechBubble {
  private spec: BubbleSpec | null = null;
  private elapsedMs: number = 0;
  private totalDurationMs: number = 3900; // 200 pop-in + 3500 hold + 200 fade

  public show(spec: BubbleSpec) {
    this.spec = spec;
    this.elapsedMs = 0;
    this.totalDurationMs = 200 + spec.durationMs + 200;
  }

  public hide() {
    this.spec = null;
  }

  public update(dtMs: number) {
    if (!this.spec) return;
    this.elapsedMs += dtMs;
    if (this.elapsedMs >= this.totalDurationMs) {
      this.spec = null;
    }
  }

  public isVisible(): boolean {
    return this.spec !== null;
  }

  public draw(ctx: CanvasRenderingContext2D, scale: number = 1.0, nearTopEdge: boolean = false) {
    if (!this.spec || nearTopEdge) return;

    const popInMs = 200;
    const fadeOutStart = this.totalDurationMs - 200;

    let alpha = 1.0;
    let animScale = 1.0;

    if (this.elapsedMs < popInMs) {
      const t = this.elapsedMs / popInMs;
      animScale = 0.85 + 0.15 * t;
      alpha = t;
    } else if (this.elapsedMs > fadeOutStart) {
      alpha = 1.0 - (this.elapsedMs - fadeOutStart) / 200;
    }

    alpha = Math.max(0, Math.min(1, alpha));

    ctx.save();
    ctx.globalAlpha = alpha;

    const maxW = Math.min(224 * scale, 240);
    const fontSize = Math.max(11, Math.round(13 * scale));
    ctx.font = `600 ${fontSize}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;

    const text = this.spec.text;
    const paddingX = 12;
    const paddingY = 8;
    const metrics = ctx.measureText(text);
    const boxW = Math.min(maxW, metrics.width + paddingX * 2);
    const boxH = fontSize * 1.3 + paddingY * 2;

    const boxX = 128 - boxW / 2;
    const boxY = Math.max(4, 52 - boxH);

    // Apply pop-in scale centered around tail base
    ctx.translate(128, boxY + boxH);
    ctx.scale(animScale, animScale);
    ctx.translate(-128, -(boxY + boxH));

    // Shadow
    ctx.shadowColor = "rgba(90, 59, 39, 0.12)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    // Rounded box with tail
    ctx.beginPath();
    const r = 12;
    ctx.roundRect(boxX, boxY, boxW, boxH, r);

    // Tail
    ctx.moveTo(124, boxY + boxH);
    ctx.lineTo(128, boxY + boxH + 8);
    ctx.lineTo(132, boxY + boxH);

    ctx.fillStyle = PALETTE["--bubble-bg"];
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = PALETTE["--pup-outline"];
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text
    ctx.fillStyle = PALETTE["--bubble-text"];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, boxY + boxH / 2);

    ctx.restore();
  }
}
