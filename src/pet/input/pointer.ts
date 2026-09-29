import type { PointerEvents } from "../../shared/types";
import { dist } from "../../shared/math";
import { GestureRecognizer, isInBodyZone } from "./gestures";

export class PointerTracker {
  private canvas: HTMLCanvasElement;
  private recognizer = new GestureRecognizer();
  private pendingClicks: { x: number; y: number; inFaceZone: boolean; t: number }[] = [];
  private hasDoubleClick = false;
  private hasSpamClicks = false;
  private hasRightClick = false;
  private isPointerDown = false;
  private pointerDownPos = { x: 0, y: 0 };
  private pointerDownTime = 0;
  private isDragging = false;
  private hasDragStart = false;
  private hasDragEnd = false;
  private currentPointerPos = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupListeners();
  }

  private setupListeners() {
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button === 0) {
        this.isPointerDown = true;
        this.pointerDownPos = { x: e.offsetX, y: e.offsetY };
        this.pointerDownTime = performance.now();
      } else if (e.button === 2) {
        this.hasRightClick = true;
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      this.currentPointerPos = { x: e.offsetX, y: e.offsetY };
      const now = performance.now();

      if (this.isPointerDown && !this.isDragging) {
        const moved = dist(e.offsetX, e.offsetY, this.pointerDownPos.x, this.pointerDownPos.y);
        const elapsed = now - this.pointerDownTime;
        if (elapsed > 200 && moved > 8) {
          this.isDragging = true;
          this.hasDragStart = true;
        }
      }

      this.recognizer.addPointerMove(e.offsetX, e.offsetY, now);
    });

    this.canvas.addEventListener("pointerup", (e) => {
      const now = performance.now();
      if (this.isDragging) {
        this.isDragging = false;
        this.hasDragEnd = true;
      } else if (e.button === 0) {
        const moved = dist(e.offsetX, e.offsetY, this.pointerDownPos.x, this.pointerDownPos.y);
        if (moved < 10) {
          const { isDoubleClick, isSpam } = this.recognizer.addClick(e.offsetX, e.offsetY, now);
          if (isDoubleClick) this.hasDoubleClick = true;
          if (isSpam) this.hasSpamClicks = true;
          this.pendingClicks = this.recognizer.getClicksAndClear();
        }
      }
      this.isPointerDown = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.hasRightClick = true;
    });
  }

  public pollEvents(): PointerEvents {
    const now = performance.now();
    const pettingActive = this.recognizer.isPettingActive(now);
    const overBody = isInBodyZone(this.currentPointerPos.x, this.currentPointerPos.y);

    const events: PointerEvents = {
      clicks: [...this.pendingClicks],
      doubleClick: this.hasDoubleClick,
      dragStart: this.hasDragStart,
      dragEnd: this.hasDragEnd,
      rightClick: this.hasRightClick,
      pettingActive,
      overBody,
      spamClicks: this.hasSpamClicks,
    };

    // Reset edge-triggered flags
    this.pendingClicks = [];
    this.hasDoubleClick = false;
    this.hasDragStart = false;
    this.hasDragEnd = false;
    this.hasRightClick = false;
    this.hasSpamClicks = false;

    return events;
  }
}
