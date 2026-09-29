import {
  CANVAS_PX,
  DISPLAY_LOGICAL_PX,
  SPRITE_OFFSET_X,
  SPRITE_OFFSET_Y,
  FEET_Y_LOGICAL,
} from "../../shared/constants";
import type { SpriteCache } from "./sprite-cache";
import type { Animator } from "./animator";
import { drawShadow } from "./shadow";

export interface MotionTransform {
  offsetY: number; // hop / bounce
  scaleX: number;  // squash / stretch
  scaleY: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spriteCache: SpriteCache;
  private animator: Animator;

  constructor(canvas: HTMLCanvasElement, spriteCache: SpriteCache, animator: Animator) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Could not get 2D rendering context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.spriteCache = spriteCache;
    this.animator = animator;
  }

  public render(
    motion: MotionTransform = { offsetY: 0, scaleX: 1, scaleY: 1 },
    drawFx?: (ctx: CanvasRenderingContext2D) => void,
    drawBubble?: (ctx: CanvasRenderingContext2D) => void
  ) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw ground shadow
    drawShadow(ctx, Math.max(0, -motion.offsetY));

    // 2. Draw puppy sprite
    const renderState = this.animator.getRenderState();
    const stripImg = this.spriteCache.get(renderState.animation);

    if (stripImg) {
      ctx.save();

      // Anchor transformations at baseline feet: (128, FEET_Y_LOGICAL)
      const anchorX = 128;
      const anchorY = FEET_Y_LOGICAL;

      ctx.translate(anchorX, anchorY + motion.offsetY);
      if (renderState.mirror) {
        ctx.scale(-1, 1);
      }
      ctx.scale(motion.scaleX, motion.scaleY);
      ctx.translate(-anchorX, -anchorY);

      // Draw primary frame
      const sx = renderState.frameIndex * CANVAS_PX;
      const sy = 0;
      const sw = CANVAS_PX;
      const sh = CANVAS_PX;

      const dx = SPRITE_OFFSET_X;
      const dy = SPRITE_OFFSET_Y;
      const dw = DISPLAY_LOGICAL_PX;
      const dh = DISPLAY_LOGICAL_PX;

      if (renderState.crossfade) {
        ctx.globalAlpha = 1.0 - renderState.crossfade.alpha;
      }
      ctx.drawImage(stripImg, sx, sy, sw, sh, dx, dy, dw, dh);

      // Draw crossfade frame if active
      if (renderState.crossfade) {
        const fromImg = this.spriteCache.get(renderState.crossfade.fromAnimation);
        if (fromImg) {
          ctx.globalAlpha = renderState.crossfade.alpha;
          const fromSx = renderState.crossfade.fromFrame * CANVAS_PX;
          ctx.drawImage(fromImg, fromSx, sy, sw, sh, dx, dy, dw, dh);
        }
      }

      ctx.restore();
    }

    // 3. Draw FX
    if (drawFx) {
      ctx.save();
      drawFx(ctx);
      ctx.restore();
    }

    // 4. Draw speech bubble
    if (drawBubble) {
      ctx.save();
      drawBubble(ctx);
      ctx.restore();
    }
  }
}
