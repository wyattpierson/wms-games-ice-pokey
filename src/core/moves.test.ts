import { describe, expect, it } from 'vitest';
import { MOVE_DEFS, effectiveWindow, movePhase, parryTiming, type MoveId } from './moves';

describe('effectiveWindow', () => {
  it('clamps a wide stat window to 70% of the tell', () => {
    for (const id of Object.keys(MOVE_DEFS) as MoveId[]) {
      expect(effectiveWindow(id, 5)).toBeCloseTo(MOVE_DEFS[id].tell * 0.7, 5);
    }
  });

  it('keeps a narrow window as-is (with a 0.05s floor)', () => {
    expect(effectiveWindow('spin', 0.1)).toBeCloseTo(0.1, 5);
    expect(effectiveWindow('spin', 0)).toBeCloseTo(0.05, 5);
  });
});

describe('parryTiming', () => {
  const TELL = MOVE_DEFS.spin.tell; // 0.30

  it('presses before the window opens are early', () => {
    const win = effectiveWindow('spin', 0.36);
    expect(parryTiming('spin', TELL - win - 0.01, 0.36)).toBe('early');
    expect(parryTiming('spin', 0.01, 0.36)).toBe('early');
  });

  it('presses inside the window (last part of the tell) succeed', () => {
    const win = effectiveWindow('spin', 0.36);
    expect(parryTiming('spin', TELL - win, 0.36)).toBe('success');
    expect(parryTiming('spin', TELL - win / 2, 0.36)).toBe('success');
    expect(parryTiming('spin', TELL, 0.36)).toBe('success'); // exactly at the end
  });

  it('presses after the tell ends are late', () => {
    expect(parryTiming('spin', TELL + 0.01, 0.36)).toBe('late');
  });

  it('a tiny window still has a succeedable sliver at the very end', () => {
    expect(parryTiming('spin', TELL - 0.02, 0.05)).toBe('success');
  });
});

describe('movePhase', () => {
  it('walks tell → effect → done', () => {
    const t = MOVE_DEFS.deke.tell;
    const e = MOVE_DEFS.deke.effect;
    expect(movePhase('deke', 0)).toBe('tell');
    expect(movePhase('deke', t - 0.01)).toBe('tell');
    expect(movePhase('deke', t)).toBe('effect');
    expect(movePhase('deke', t + e - 0.01)).toBe('effect');
    expect(movePhase('deke', t + e)).toBe('done');
  });
});
