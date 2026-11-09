import { describe, expect, it } from 'vitest';
import { ContextCoach, type CoachContext } from './coach';

const context: CoachContext = { carrying: false, charging: false, pressure: 0, incomingPass: false, enemyMove: null, closeCarrier: false };

describe('first-match coach', () => {
  it('teaches movement first, spaces out hints and never repeats a shown hint', () => {
    const shown: string[] = [];
    const coach = new ContextCoach([], id => shown.push(id));
    expect(coach.update(context, .1)?.id).toBe('move');
    expect(coach.update(context, 6)).toBeNull();
    expect(coach.update(context, 3)?.id).toBe('defense');
    expect(coach.update(context, 10)).toBeNull();
    expect(shown).toEqual(['move', 'defense']);
  });
  it('prioritizes pressure and removes stale offensive advice on a turnover', () => {
    const coach = new ContextCoach(['move']);
    expect(coach.update({ ...context, carrying: true }, .1)?.id).toBe('possession');
    expect(coach.update({ ...context, carrying: true, pressure: .7 }, .1)?.id).toBe('pressure');
    expect(coach.update(context, .1)).toBeNull();
  });
  it('shows the matching counter key only for a nearby active move', () => {
    const coach = new ContextCoach(['move', 'defense']);
    expect(coach.update({ ...context, enemyMove: 'deke' }, .1)?.text).toContain('press F');
    expect(coach.update(context, .1)).toBeNull();
    expect(coach.update({ ...context, enemyMove: 'spin' }, .1)?.text).toContain('press E');
  });
  it('remembers shown hints across sessions and distinguishes a pass from a defensive check', () => {
    const coach = new ContextCoach(['move', 'charge', 'possession', 'defense']);
    expect(coach.update({ ...context, incomingPass: true, closeCarrier: true }, .1)?.id).toBe('receive');
    expect(coach.update(context, .1)).toBeNull();
    expect(coach.update({ ...context, closeCarrier: true }, 10)?.id).toBe('check');
  });
});
