import { describe, expect, it } from 'vitest';
import { CHARGE_TIME, OVERCHARGE_GRACE, PERFECT_SHOT_CHARGE } from '../config/gameplay';
import { CENTER_X, CENTER_Y, GOAL_BOTTOM, GOAL_TOP, ICE_X, ICE_Y, RINK_H, RINK_W } from '../config/rink';
import { aimTargetY, chargeFromHold, perfectWindowHold, shotDirection } from './shot';
import { v } from './vec2';

describe('chargeFromHold', () => {
  it('builds linearly to full, holds through the grace, then bleeds away', () => {
    expect(chargeFromHold(0)).toBe(0);
    expect(chargeFromHold(CHARGE_TIME / 2)).toBeCloseTo(0.5, 5);
    expect(chargeFromHold(CHARGE_TIME)).toBe(1);
    expect(chargeFromHold(CHARGE_TIME + OVERCHARGE_GRACE)).toBe(1);
    expect(chargeFromHold(CHARGE_TIME + OVERCHARGE_GRACE + 0.1)).toBeLessThan(1);
    expect(chargeFromHold(99)).toBe(0);
  });
  it('is monotonic up to the peak and monotonically non-increasing after it', () => {
    let prev = 0;
    for (let h = 0; h <= CHARGE_TIME + OVERCHARGE_GRACE; h += 0.01) {
      const c = chargeFromHold(h);
      expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = c;
    }
    for (let h = CHARGE_TIME + OVERCHARGE_GRACE; h < 3; h += 0.01) {
      const c = chargeFromHold(h);
      expect(c).toBeLessThanOrEqual(prev + 1e-9);
      prev = c;
    }
  });
});

describe('perfect window', () => {
  it('opens when charge reaches the perfect threshold and closes when it falls back under', () => {
    const { open, close } = perfectWindowHold();
    expect(chargeFromHold(open - 0.01)).toBeLessThan(PERFECT_SHOT_CHARGE);
    expect(chargeFromHold(open + 0.01)).toBeGreaterThanOrEqual(PERFECT_SHOT_CHARGE);
    expect(chargeFromHold(close - 0.01)).toBeGreaterThanOrEqual(PERFECT_SHOT_CHARGE);
    expect(chargeFromHold(close + 0.01)).toBeLessThan(PERFECT_SHOT_CHARGE);
  });
  it('is a real, humanly hittable window (0.25–0.6s)', () => {
    const { open, close } = perfectWindowHold();
    expect(close - open).toBeGreaterThan(0.25);
    expect(close - open).toBeLessThan(0.6);
  });
});

describe('aiming along the goal mouth', () => {
  const goalXs = [ICE_X + RINK_W, ICE_X]; // either end
  /** y where the shot crosses the goal line. */
  const crossing = (from: { x: number; y: number }, goalX: number, aimY: number) => {
    const d = shotDirection(from, goalX, aimY);
    return from.y + d.y * ((goalX - from.x) / d.x);
  };

  it('aim ±1 is always ON NET (inside the posts), from any spot that is in front of the goal', () => {
    for (const goalX of goalXs) {
      const dir = goalX > CENTER_X ? 1 : -1;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        // sample points at least 40px from the goal line, anywhere across the rink height
        const x = goalX - dir * (40 + (i / 8) * (RINK_W - 80));
        const y = ICE_Y + 20 + (j / 8) * (RINK_H - 40);
        for (const aimY of [-1, -0.5, 0, 0.5, 1]) {
          const cy = crossing({ x, y }, goalX, aimY);
          expect(cy).toBeGreaterThanOrEqual(GOAL_TOP);
          expect(cy).toBeLessThanOrEqual(GOAL_BOTTOM);
        }
      }
    }
  });

  it('aim 0 is the middle of the mouth; positive is lower, negative is higher; symmetric', () => {
    expect(aimTargetY(0)).toBe(CENTER_Y);
    expect(aimTargetY(1)).toBeGreaterThan(CENTER_Y);
    expect(aimTargetY(-1)).toBeLessThan(CENTER_Y);
    expect(aimTargetY(1) - CENTER_Y).toBeCloseTo(CENTER_Y - aimTargetY(-1), 6);
  });

  it('values beyond ±1 (AI only) can miss wide', () => {
    expect(aimTargetY(1.6)).toBeGreaterThan(GOAL_BOTTOM);
    expect(aimTargetY(-1.6)).toBeLessThan(GOAL_TOP);
  });

  it('is a unit vector pointing toward the goal, even when standing on the goal line', () => {
    const d = shotDirection(v(500, 200), ICE_X + RINK_W, 0.3);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    expect(d.x).toBeGreaterThan(0);
    const e = shotDirection(v(ICE_X + RINK_W, CENTER_Y), ICE_X + RINK_W, 0);
    expect(Math.hypot(e.x, e.y)).toBeCloseTo(1, 6);
  });
});
