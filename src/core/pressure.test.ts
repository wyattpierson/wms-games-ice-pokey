import { describe, expect, it } from 'vitest';
import { pressureRate, stepPressure } from './pressure';
import {
  PRESSURE_BEHIND_RATE, PRESSURE_FILL_TIME, PRESSURE_SECOND_PRESSER, PRESSURE_STAGGER_RATE,
} from '../config/gameplay';

const front = { front: true };
const behind = { front: false };

describe('pressureRate', () => {
  it('nobody pressing = 0; one presser in front fills the meter in PRESSURE_FILL_TIME', () => {
    expect(pressureRate([], false)).toBe(0);
    expect(1 / pressureRate([front], false)).toBeCloseTo(PRESSURE_FILL_TIME, 6);
  });
  it('a presser chasing from behind counts less', () => {
    expect(pressureRate([behind], false)).toBeCloseTo(pressureRate([front], false) * PRESSURE_BEHIND_RATE, 6);
  });
  it('a second presser helps, but less than twice as much', () => {
    const one = pressureRate([front], false), two = pressureRate([front, front], false);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThan(one * 2);
    expect(two).toBeCloseTo(one * (1 + PRESSURE_SECOND_PRESSER), 6);
  });
  it('a stunned carrier (just checked) is stripped faster', () => {
    expect(pressureRate([front], true)).toBeCloseTo(pressureRate([front], false) * PRESSURE_STAGGER_RATE, 6);
  });
});

describe('stepPressure', () => {
  it('fills to exactly 1 and stops there', () => {
    let m = 0;
    for (let i = 0; i < 600; i++) m = stepPressure(m, [front], false, 1, 1 / 60);
    expect(m).toBe(1);
  });
  it('a lone in-front presser strips a standing carrier in ≈ PRESSURE_FILL_TIME', () => {
    let m = 0, t = 0;
    while (m < 1 && t < 10) { m = stepPressure(m, [front], false, 1, 1 / 60); t += 1 / 60; }
    expect(t).toBeCloseTo(PRESSURE_FILL_TIME, 1);
  });
  it('drains when nobody is close, and never goes below 0', () => {
    let m = 0.6;
    for (let i = 0; i < 20; i++) m = stepPressure(m, [], false, 1, 1 / 60);
    expect(m).toBeLessThan(0.6);
    for (let i = 0; i < 600; i++) m = stepPressure(m, [], false, 1, 1 / 60);
    expect(m).toBe(0);
  });
  it('the difficulty scale slows it down (forgiving at low levels)', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) { a = stepPressure(a, [front], false, 1, 1 / 60); b = stepPressure(b, [front], false, 0.5, 1 / 60); }
    expect(b).toBeCloseTo(a / 2, 5);
  });
});
