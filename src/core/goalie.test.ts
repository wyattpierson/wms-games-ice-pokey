import { describe, expect, it } from 'vitest';
import { chooseGoalieOutlet, goalieOutletScore, planGoalieResponse, readChance, respectAfterFool } from './goalie';
import { GOALIE_REPEAT_READ, GOALIE_RESPECT_GAIN, GOALIE_RESPECT_MAX } from '../config/gameplay';

const base = { moveId: 'deke' as const, lastFooled: null, respect: 0, puckSense: 0.5, readBase: 0.3, biteBase: 0.6 };

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function tally(over: Partial<typeof base>, n = 6000) {
  const rng = mulberry(7);
  const c = { read: 0, bite: 0, hold: 0 };
  for (let i = 0; i < n; i++) c[planGoalieResponse({ ...base, ...over, rng })]++;
  return { read: c.read / n, bite: c.bite / n, hold: c.hold / n };
}

describe('readChance', () => {
  it('rises with puckSense, with respect, and when the SAME move fooled it last', () => {
    expect(readChance({ ...base, puckSense: 0.9 })).toBeGreaterThan(readChance({ ...base, puckSense: 0.1 }));
    expect(readChance({ ...base, respect: 0.3 })).toBeGreaterThan(readChance(base));
    expect(readChance({ ...base, lastFooled: 'deke' })).toBeCloseTo(readChance(base) + GOALIE_REPEAT_READ, 6);
    expect(readChance({ ...base, lastFooled: 'spin' })).toBeCloseTo(readChance(base), 6); // a different move: no penalty
  });
  it('is capped so a goalie is never 100% unfoolable', () => {
    expect(readChance({ ...base, readBase: 1, respect: 0.5, puckSense: 1, lastFooled: 'deke' })).toBeLessThanOrEqual(0.92);
  });
});

describe('planGoalieResponse', () => {
  it('matches the stated probabilities (read = readChance; the rest splits bite : hold by biteBase)', () => {
    const t = tally({});
    const pRead = readChance(base);
    expect(t.read).toBeCloseTo(pRead, 1);
    expect(t.bite).toBeCloseTo((1 - pRead) * base.biteBase, 1);
    expect(t.hold).toBeCloseTo((1 - pRead) * (1 - base.biteBase), 1);
  });
  it('a goalie with no read skill and bite 1 always bites; with bite 0 never does', () => {
    expect(tally({ readBase: 0, puckSense: 0, biteBase: 1 }).bite).toBe(1);
    expect(tally({ readBase: 0, puckSense: 0, biteBase: 0 }).bite).toBe(0);
  });
  it('repeatedly beating the same goalie with the same move gets steadily harder', () => {
    let respect = 0;
    let last: 'deke' | null = null;
    const chances: number[] = [];
    for (let i = 0; i < 3; i++) {
      chances.push(readChance({ ...base, respect, lastFooled: last }));
      respect = respectAfterFool(respect);
      last = 'deke';
    }
    expect(chances[1]).toBeGreaterThan(chances[0] + GOALIE_RESPECT_GAIN * 0.9);
    expect(chances[2]).toBeGreaterThan(chances[1]);
  });
});

describe('respectAfterFool', () => {
  it('adds a fixed amount and caps', () => {
    expect(respectAfterFool(0)).toBeCloseTo(GOALIE_RESPECT_GAIN, 6);
    expect(respectAfterFool(GOALIE_RESPECT_MAX)).toBe(GOALIE_RESPECT_MAX);
  });
});


describe('goalie outlet selection', () => {
  const safe = { mate: 'open teammate', distance: 170, forwardProgress: 0.25, closestDefender: 150, passLaneClearance: 80 };
  const covered = { mate: 'covered teammate', distance: 210, forwardProgress: 0.95, closestDefender: 18, passLaneClearance: 8 };

  it('scores a safe open receiver above a covered receiver even when the covered option is farther forward', () => {
    expect(goalieOutletScore(safe)).toBeGreaterThan(goalieOutletScore(covered));
  });

  it('chooses an open receiver even if a covered receiver is more forward', () => {
    expect(chooseGoalieOutlet([covered, safe])).toEqual(safe);
  });

  it('holds the puck when every receiver or passing lane is covered', () => {
    expect(chooseGoalieOutlet([covered])).toBeNull();
  });
});
