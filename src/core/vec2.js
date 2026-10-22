/** Minimal 2D vector helpers (pure). */
export const v = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => v(a.x + b.x, a.y + b.y);
export const sub = (a, b) => v(a.x - b.x, a.y - b.y);
export const scale = (a, k) => v(a.x * k, a.y * k);
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const norm = (a) => {
    const l = len(a);
    return l < 1e-6 ? v(0, 0) : v(a.x / l, a.y / l);
};
export const clampLen = (a, max) => {
    const l = len(a);
    return l <= max || l < 1e-6 ? a : v((a.x / l) * max, (a.y / l) * max);
};
export const lerp = (a, b, t) => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
