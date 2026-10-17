import { describe, expect, it } from 'vitest';
import { difficultyAt } from '../config/difficulty';
import { planAiResponse } from './aiPlan';
import { ALL_MOVES, MOVE_DEFS, parryTiming, type MoveId } from './moves';
import { deriveStats } from './stats';
import { CHECK_TIME } from '../config/gameplay';

/** Seeded RNG so the simulation is deterministic. */
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What happens when ONE AI defender meets ONE tell, many times. */
function outcomes(level: number, move: MoveId, spd: number, n = 20000) {
  const diff = difficultyAt(level);
  const stats = deriveStats({ hp: 50, attack: 50, specialAttack: 50, defense: 50, specialDefense: spd, speed: 50 });
  const tell = MOVE_DEFS[move].tell * diff.aiTellScale;
  const effect = MOVE_DEFS[move].effect;
  const rng = mulberry(42);
  const r = { steal: 0, whiffEarly: 0, whiffLate: 0, whiffWrong: 0, tooSlow: 0, guard: 0, none: 0 };
  for (let i = 0; i < n; i++) {
    const plan = planAiResponse({ moveId: move, moves: ALL_MOVES, tell, windowFrac: stats.parryFrac, diff, puckSense: stats.puckSense, rng });
    if (plan.kind === 'none') r.none++;
    else if (plan.kind === 'guard') {
      // a check only stuffs the move if it is up when the move resolves at `tell`
      if (plan.at <= tell && plan.at + CHECK_TIME >= tell) r.guard++;
    }
    else if (plan.at > tell + effect) r.tooSlow++; // press would land after the move is over: nothing happens
    else {
      const t = parryTiming(tell, plan.at, stats.parryFrac);
      if (plan.key !== move) r.whiffWrong++;
      else if (t === 'success') r.steal++;
      else if (t === 'early') r.whiffEarly++;
      else r.whiffLate++;
    }
  }
  const pct = (x: number) => x / n;
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, pct(v)])) as Record<keyof typeof r, number>;
}

describe('AI response ramps with difficulty', () => {
  it('a level-0 AI almost never steals; a level-1 AI steals often', () => {
    for (const m of ALL_MOVES) {
      const easy = outcomes(0, m, 80).steal;
      const hard = outcomes(1, m, 80).steal;
      expect(easy).toBeLessThan(0.12);
      expect(hard).toBeGreaterThan(0.18);
      expect(hard).toBeGreaterThan(easy * 3);
    }
  });

  it('the AI genuinely whiffs sometimes (wrong key or bad timing) — it is punishable', () => {
    for (const lv of [0, 0.25, 0.5]) {
      const o = outcomes(lv, 'deke', 80);
      expect(o.whiffWrong + o.whiffEarly + o.whiffLate).toBeGreaterThan(0.06);
    }
  });

  it('even a full-difficulty defender does not neutralise every juke (parry + check < 80%)', () => {
    for (const m of ALL_MOVES) {
      const o = outcomes(1, m, 100);
      expect(o.steal + o.guard).toBeLessThan(0.8);
      expect(o.steal + o.guard).toBeGreaterThan(0.4);
    }
  });

  it('steal rate is monotonic in level', () => {
    for (const m of ALL_MOVES) {
      let prev = -1;
      for (const lv of [0, 0.25, 0.5, 0.75, 1]) {
        const s = outcomes(lv, m, 80).steal;
        expect(s).toBeGreaterThanOrEqual(prev - 0.01);
        prev = s;
      }
    }
  });

  it('a high-SpD AI defender is meaningfully better than a low-SpD one', () => {
    const lo = outcomes(0.75, 'spin', 45).steal;
    const hi = outcomes(0.75, 'spin', 110).steal;
    expect(hi).toBeGreaterThan(lo * 1.5);
  });
});

describe('difficulty', () => {
  it('is monotonic and clamped', () => {
    const a = difficultyAt(-1), b = difficultyAt(0), c = difficultyAt(0.5), d = difficultyAt(1), e = difficultyAt(9);
    expect(a).toEqual(b);
    expect(d).toEqual(e);
    expect(b.aiSpeed).toBeLessThan(c.aiSpeed);
    expect(c.aiSpeed).toBeLessThan(d.aiSpeed);
    expect(b.aiTellScale).toBeGreaterThan(d.aiTellScale);
    expect(b.aiReaction).toBeGreaterThan(d.aiReaction);
  });
  it('starts slow, reads the key for you, and ends at full speed without hints', () => {
    expect(difficultyAt(0).aiSpeed).toBeLessThan(0.6);
    expect(difficultyAt(0).showKeyHint).toBe(true);
    expect(difficultyAt(1).showKeyHint).toBe(false);
    expect(difficultyAt(1).aiSpeed).toBeGreaterThan(0.9);
  });
});
