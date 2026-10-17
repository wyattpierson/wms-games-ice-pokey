import { describe, expect, it } from 'vitest';
import { deriveStats, guardRadiusFor, statNorm, stuffRangeFor } from './stats';
import { PARRY_RANGE } from '../config/gameplay';
import { windowSeconds } from './moves';
import { MOVE_DEFS } from './moves';
import { OPPONENTS, USER_TEAM } from '../config/teams';

const base = { hp: 50, attack: 50, specialAttack: 50, defense: 50, specialDefense: 50, speed: 50 };
const all = (n: number) => ({ hp: n, attack: n, specialAttack: n, defense: n, specialDefense: n, speed: n });

describe('statNorm', () => {
  it('maps the realistic range onto 0..1 and clamps outside it', () => {
    expect(statNorm(40)).toBe(0);
    expect(statNorm(120)).toBe(1);
    expect(statNorm(80)).toBeCloseTo(0.5);
    expect(statNorm(10)).toBe(0);
    expect(statNorm(200)).toBe(1);
  });
});

describe('deriveStats', () => {
  it('monotonic: higher stats → faster, stronger, wider parry window', () => {
    const low = deriveStats(all(40));
    const high = deriveStats(all(120));
    expect(high.moveSpeed).toBeGreaterThan(low.moveSpeed);
    expect(high.shotPower).toBeGreaterThan(low.shotPower);
    expect(high.skill).toBeGreaterThan(low.skill);
    expect(high.checkPower).toBeGreaterThan(low.checkPower);
    expect(high.parryFrac).toBeGreaterThan(low.parryFrac);
    expect(high.puckSense).toBeGreaterThan(low.puckSense);
    expect(high.maxHp).toBeGreaterThan(low.maxHp);
    expect(high.tellMult).toBeLessThan(low.tellMult); // high SpA = snappier tell
  });

  it('every stat spans a meaningful range (≥1.5× low→high)', () => {
    const lo = deriveStats(all(40));
    const hi = deriveStats(all(120));
    expect(hi.moveSpeed / lo.moveSpeed).toBeGreaterThan(1.5);
    expect(hi.shotPower / lo.shotPower).toBeGreaterThan(1.5);
    expect(hi.skill / lo.skill).toBeGreaterThan(1.5);
    expect(hi.parryFrac / lo.parryFrac).toBeGreaterThan(1.5);
  });

  // REGRESSION: the old model clamped the window to 70% of the tell, so spin &
  // crossover windows were IDENTICAL for every Pokémon with SpD >= 25/42.
  it('Special Defense changes the parry window for EVERY move (no saturation)', () => {
    for (const id of Object.keys(MOVE_DEFS) as Array<keyof typeof MOVE_DEFS>) {
      const tell = MOVE_DEFS[id].tell;
      const w = [40, 60, 80, 100, 120].map((spd) =>
        windowSeconds(tell, deriveStats({ ...base, specialDefense: spd }).parryFrac),
      );
      for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1] + 0.005);
    }
  });

  it('the shipped rosters have a real spread in the stats that matter', () => {
    const field = [USER_TEAM, ...OPPONENTS].flatMap((t) => t.players).filter((p) => !p.goalie);
    const h = field.map((p) => deriveStats(p.stats));
    const ratio = (k: (x: (typeof h)[number]) => number) => {
      const a = h.map(k);
      return Math.max(...a) / Math.min(...a);
    };
    expect(ratio((x) => x.moveSpeed)).toBeGreaterThan(1.4);
    // (placeholder roster data has a narrow Sp.Atk band 55–100; the mapping itself spans ≥1.5×, see above)
    expect(ratio((x) => x.skill)).toBeGreaterThan(1.3);
    expect(ratio((x) => x.shotPower)).toBeGreaterThan(1.5);
    expect(ratio((x) => x.parryFrac)).toBeGreaterThan(1.3);
  });
});

describe('check (block) geometry', () => {
  it('a block always reaches at least as far as a parry — even at 0 Defense', () => {
    // (a carrier you could parry but not block would make a low-Defense check silently useless)
    expect(stuffRangeFor(0)).toBeGreaterThanOrEqual(PARRY_RANGE);
  });
  it('Defense widens the wall and the reach', () => {
    expect(guardRadiusFor(1)).toBeGreaterThan(guardRadiusFor(0) * 1.3);
    expect(stuffRangeFor(1)).toBeGreaterThan(stuffRangeFor(0));
  });
});
