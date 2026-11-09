import { dist, norm, sub, v, type Vec2 } from './vec2';

/** Reflect the receiver across a horizontal board to find a one-bounce lane. */
export function bankPassRoute(from: Vec2, to: Vec2, wallY: number): { bounce: Vec2; direction: Vec2; distance: number } {
  const reflected = v(to.x, 2 * wallY - to.y);
  const denominator = reflected.y - from.y;
  const t = Math.abs(denominator) > 1e-6 ? (wallY - from.y) / denominator : 0.5;
  const bounce = v(from.x + (reflected.x - from.x) * t, wallY);
  return { bounce, direction: norm(sub(reflected, from)), distance: dist(from, bounce) + dist(bounce, to) };
}
