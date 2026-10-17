import { describe, expect, it } from 'vitest';
import { ALL_MOVES, dashSpeedAt, MOVE_DEFS, movePhase, parryTiming, windowSeconds } from './moves';

describe('windowSeconds', () => {
  it('is a fraction of the tell', () => {
    expect(windowSeconds(0.5, 0.5)).toBeCloseTo(0.25, 5);
    expect(windowSeconds(1.0, 0.35)).toBeCloseTo(0.35, 5);
  });
  it('has a floor and never swallows the whole tell', () => {
    expect(windowSeconds(0.3, 0.01)).toBeCloseTo(0.07, 5);
    expect(windowSeconds(0.3, 5)).toBeCloseTo(0.27, 5);
  });
  it('scales with the tell (longer tell → longer window at the same stat)', () => {
    expect(windowSeconds(0.9, 0.5)).toBeGreaterThan(windowSeconds(0.3, 0.5));
  });
});

describe('parryTiming', () => {
  const TELL = 0.5;
  const FRAC = 0.5; // window = last 0.25s → opens at 0.25
  it('presses before the window opens are early', () => {
    expect(parryTiming(TELL, 0.01, FRAC)).toBe('early');
    expect(parryTiming(TELL, 0.24, FRAC)).toBe('early');
  });
  it('presses inside the window succeed (inclusive at both ends)', () => {
    expect(parryTiming(TELL, 0.25, FRAC)).toBe('success');
    expect(parryTiming(TELL, 0.4, FRAC)).toBe('success');
    expect(parryTiming(TELL, TELL, FRAC)).toBe('success');
  });
  it('presses after the tell ends are late', () => {
    expect(parryTiming(TELL, TELL + 0.01, FRAC)).toBe('late');
  });
});

describe('movePhase', () => {
  it('walks tell → effect → done for a given tell/effect length', () => {
    expect(movePhase(0.5, 0.2, 0)).toBe('tell');
    expect(movePhase(0.5, 0.2, 0.49)).toBe('tell');
    expect(movePhase(0.5, 0.2, 0.5)).toBe('effect');
    expect(movePhase(0.5, 0.2, 0.69)).toBe('effect');
    expect(movePhase(0.5, 0.2, 0.7)).toBe('done');
  });
});

describe('move set', () => {
  it('ships with exactly 2 moves enabled: a fast one and a slow, bigger one', () => {
    expect(ALL_MOVES).toEqual(['spin', 'deke']);
    expect(MOVE_DEFS.deke.tell).toBeGreaterThan(MOVE_DEFS.spin.tell);
    expect(MOVE_DEFS.deke.dash * MOVE_DEFS.deke.effect).toBeGreaterThan(MOVE_DEFS.spin.dash * MOVE_DEFS.spin.effect);
  });
});

describe('dashSpeedAt', () => {
  it('starts at full speed, eases out, never goes backwards', () => {
    expect(dashSpeedAt(500, 0)).toBe(500);
    expect(dashSpeedAt(500, 1)).toBeCloseTo(275, 5);
    expect(dashSpeedAt(500, 0.5)).toBeLessThan(500);
    expect(dashSpeedAt(500, 0.5)).toBeGreaterThan(dashSpeedAt(500, 1));
    expect(dashSpeedAt(500, 9)).toBeCloseTo(275, 5); // clamped
  });
  it('a landed move carries you well past a body-width (≥70px even at the bottom of the skill range)', () => {
    for (const id of ALL_MOVES) {
      const d = MOVE_DEFS[id];
      let dist = 0;
      const N = 100;
      for (let i = 0; i < N; i++) dist += dashSpeedAt(d.dash * 0.75, i / N) * (d.effect / N);
      expect(dist).toBeGreaterThan(70);
    }
  });
});
