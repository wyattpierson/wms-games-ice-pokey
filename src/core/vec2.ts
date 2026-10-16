/** Minimal 2D vector helpers (pure). */

export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < 1e-6 ? v(0, 0) : v(a.x / l, a.y / l);
};

export const clampLen = (a: Vec2, max: number): Vec2 => {
  const l = len(a);
  return l <= max || l < 1e-6 ? a : v((a.x / l) * max, (a.y / l) * max);
};

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));
