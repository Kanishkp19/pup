export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function easeOutQuad(x: number): number {
  const t = clamp(x, 0, 1);
  return 1 - (1 - t) * (1 - t);
}

export function easeInOutSine(x: number): number {
  const t = clamp(x, 0, 1);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
