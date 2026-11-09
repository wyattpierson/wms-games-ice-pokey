import { describe, it, expect } from 'vitest';
import { bankPassRoute } from './passing';

describe('bank pass geometry', () => {
  it.each([0, 560])('reflects toward the receiver from board y=%s, for either attack direction', wallY => {
    for (const [from, to] of [[{ x: 200, y: 180 }, { x: 800, y: 360 }], [{ x: 800, y: 360 }, { x: 200, y: 180 }]]) {
      const route = bankPassRoute(from, to, wallY);
      const travelAfterBounce = (to.y - wallY) / -route.direction.y;
      expect(route.bounce.x + route.direction.x * travelAfterBounce).toBeCloseTo(to.x, 8);
      expect(route.bounce.x).toBeGreaterThan(Math.min(from.x, to.x));
      expect(route.bounce.x).toBeLessThan(Math.max(from.x, to.x));
      expect(route.distance).toBeGreaterThan(Math.hypot(to.x - from.x, to.y - from.y));
    }
  });
});
