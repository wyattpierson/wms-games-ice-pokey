import { describe, expect, it } from 'vitest';
import { zoneDifficultyBand } from './zoneDifficulty';
import { TOWER_STAGES, ZONES } from './progression';

describe('overworld threat indicators', () => {
  it('maps the current campaign AI settings to increasing threat bands', () => {
    expect(ZONES.map(zone => zoneDifficultyBand(zone.difficulty).tier)).toEqual([1, 2, 3, 4]);
    expect(TOWER_STAGES.every(stage => zoneDifficultyBand(stage.difficulty).tier === 5)).toBe(true);
  });

  it('follows the configured AI level instead of a realm name or position', () => {
    expect(zoneDifficultyBand(0.24).label).toBe('APPROACHABLE');
    expect(zoneDifficultyBand(0.25).label).toBe('CHALLENGING');
    expect(zoneDifficultyBand(0.50).tier).toBe(3);
    expect(zoneDifficultyBand(0.75).tier).toBe(4);
    expect(zoneDifficultyBand(0.95).label).toBe('EXTREME');
    expect(zoneDifficultyBand(-1).tier).toBe(1);
    expect(zoneDifficultyBand(2).tier).toBe(5);
  });
});
