import { describe, expect, it } from 'vitest';
import { deriveStats } from './stats';

const base = {
  hp: 50, attack: 50, specialAttack: 50, defense: 50, specialDefense: 50, speed: 50,
};

describe('deriveStats', () => {
  it('maps mid stats to mid values', () => {
    const h = deriveStats(base);
    expect(h.moveSpeed).toBeGreaterThan(150);
    expect(h.shotPower).toBeCloseTo(1.0);
    expect(h.puckSense).toBeCloseTo(0.5);
    expect(h.maxHp).toBe(80);
  });

  it('monotonic: higher stats → faster, stronger, wider parry window', () => {
    const low = deriveStats({ ...base, hp: 10, attack: 10, specialAttack: 10, defense: 10, specialDefense: 10, speed: 10 });
    const high = deriveStats({ ...base, hp: 100, attack: 100, specialAttack: 100, defense: 100, specialDefense: 100, speed: 100 });
    expect(high.moveSpeed).toBeGreaterThan(low.moveSpeed);
    expect(high.shotPower).toBeGreaterThan(low.shotPower);
    expect(high.skill).toBeGreaterThan(low.skill);
    expect(high.checkPower).toBeGreaterThan(low.checkPower);
    expect(high.parryWindow).toBeGreaterThan(low.parryWindow);
    expect(high.puckSense).toBeGreaterThan(low.puckSense);
    expect(high.maxHp).toBeGreaterThan(low.maxHp);
  });
});
