import { describe, expect, it } from 'vitest';
import { getMeta } from '../state/metaStore';
import { abyssFirstVisit, bossVictory, islandOpening, secondCoastalBossVictory, yearEndReflection, yearOpening } from './story';
import { buildWorldState } from '../core/worldState';

describe('campaign story milestones', () => {
  it('opens with an invitation, rivalry, ordinary ambition, and a faint signal', () => {
    const text = yearOpening(1).lines.map(l => l.text).join(' ');
    expect(text).toContain('invited');
    expect(text).toContain('fully evolved');
    expect(text).toContain('best team');
    expect(text).toContain('hurry');
    expect(yearOpening(3).lines).toEqual([]);
  });
  it('varies loss confidence with tournament progress', () => {
    const current = getMeta();
    const early = yearEndReflection(buildWorldState({ ...current, towerFloor: 0 }))!;
    const late = yearEndReflection(buildWorldState({ ...current, towerFloor: 3 }))!;
    expect(early.lines[0].text).not.toBe(late.lines[0].text);
    expect(late.lines[0].text).toContain('One match away');
  });

  it('keeps ordinary island openings silent and limits each authored beat to one line', () => {
    expect(islandOpening('HAUNTED RINKS', 2)).toEqual([]);
    expect(yearOpening(1).lines).toHaveLength(5);
    expect(abyssFirstVisit()).toHaveLength(1);
    expect(secondCoastalBossVictory()).toHaveLength(1);
  });

  it('has dedicated save-wide first-Abyss and second-Coastal-boss dialogue', () => {
    expect(abyssFirstVisit().map(line => line.text).join('\n')).toContain('fog moves against the wind');
    expect(secondCoastalBossVictory().map(line => line.text).join('\n')).toContain('we knew what to do');
    expect(bossVictory('Coastal Circuit', 'Heart Scale', 2, 'resource')[0].text).toContain('The resource is yours');
    expect(bossVictory('Coastal Circuit', 'Heart Scale', 2, 'recruit')[0].text).toContain('You took one of theirs');
    expect(bossVictory('Coastal Circuit', 'Heart Scale', 2, 'skipped')[0].text).toContain('You left the Heart Scale');
  });
});
