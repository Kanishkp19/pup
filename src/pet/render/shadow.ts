import { FEET_Y_LOGICAL } from "../../shared/constants";

export function drawShadow(
  ctx: CanvasRenderingContext2D,
  heightOffsetLogical: number = 0,
  _scale: number = 1.0
) {
  const cx = 128;
  const cy = FEET_Y_LOGICAL;

  // Height offset reduces shadow size and opacity
  const heightRatio = Math.max(0.1, 1.0 - heightOffsetLogical / 100);
  const rx = 42 * heightRatio;
  const ry = 9 * heightRatio;
  const alpha = 0.18 * heightRatio;

  ctx.save();
  ctx.fillStyle = `rgba(90, 59, 39, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
