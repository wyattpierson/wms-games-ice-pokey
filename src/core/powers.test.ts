import { describe, expect, it } from 'vitest';
import { PowerRuntime, validatePowerDefinitions, type PowerDefinition } from './powers';
import { POWER_DEFINITIONS } from '../config/powers';

const passPower: PowerDefinition = {
  id: 'pass-boost', name: 'Pass Boost', description: 'test', trigger: 'passComplete', cooldownSeconds: 5,
  effects: [
    { type: 'statMultiplier', stat: 'speed', multiplier: 1.2, durationSeconds: 2 },
    { type: 'nextActionMultiplier', action: 'shot', multiplier: 1.1 },
  ],
};
const ctx = { actorKey: '0:0', team: 0 as const, role: 'field' as const, hasPuck: false, now: 10 };

describe('PowerRuntime', () => {
  it('applies timed stat effects and expires them', () => {
    const runtime = new PowerRuntime([passPower], ['pass-boost']);
    runtime.emit('passComplete', ctx);
    expect(runtime.statMultiplier('0:0', 'speed', 11)).toBe(1.2);
    expect(runtime.statMultiplier('0:0', 'speed', 12.1)).toBe(1);
  });
  it('consumes next-action effects once', () => {
    const runtime = new PowerRuntime([passPower], ['pass-boost']);
    runtime.emit('passComplete', ctx);
    expect(runtime.consumeActionMultiplier('0:0', 'shot')).toBe(1.1);
    expect(runtime.consumeActionMultiplier('0:0', 'shot')).toBe(1);
  });
  it('respects cooldowns and ignores opponent triggers', () => {
    const runtime = new PowerRuntime([passPower], ['pass-boost']);
    runtime.emit('passComplete', ctx);
    expect(runtime.emit('passComplete', { ...ctx, now: 11 })).toHaveLength(0);
    expect(runtime.emit('passComplete', { ...ctx, team: 1, now: 20 })).toHaveLength(0);
    expect(runtime.emit('passComplete', { ...ctx, now: 16 })).toHaveLength(1);
  });
  it('keeps the shipped power definitions valid', () => {
    expect(validatePowerDefinitions(POWER_DEFINITIONS)).toEqual([]);
  });
  it('validates duplicate ids and invalid values', () => {
    expect(validatePowerDefinitions([passPower, { ...passPower, cooldownSeconds: -1 }])).toContain('Duplicate power id: pass-boost');
    expect(validatePowerDefinitions([{ ...passPower, cooldownSeconds: -1 }])).toContain('pass-boost: cooldownSeconds must be a non-negative number.');
  });
});
