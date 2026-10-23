import { describe, expect, it } from 'vitest';
import { getMeta } from '../state/metaStore';
import { abyssFirstVisit, bossVictory, islandOpening, secondCoastalBossVictory, yearEndReflection, yearOpening } from './story';
import { buildWorldState } from '../core/worldState';

describe('campaign story milestones', () => {
  it('composes year-opening dialogue from tower progress, realm clears, starter evolution, and world events', () => {
    const current = getMeta();
    const meta = {
      ...current,
      seasonYear: 6,
      towerFloor: 0,
      bestTowerFloor: 2,
      yearStartingBestTowerFloor: 2,
      starter: 'gible' as const,
      starterXp: { ...current.starterXp, gible: 40 },
      zoneBossWins: { coastal: 1, haunted: 1, summit: 1, abyss: 1 },
      everEnteredZones: ['coastal', 'haunted', 'summit', 'abyss'],
      flags: [],
    };
    const world = buildWorldState(meta);
    const opening = yearOpening(6, world);
    const combined = opening.lines.map(line => line.text).join('\n');
    expect(combined).toContain('You reached 2 Tower teams');
    expect(combined).toContain('Every realm has fallen');
    expect(combined).toContain('I have changed');
    expect(combined).toContain('The birds have changed');
    expect(opening.flags).toContain('world-event-seen-galarian-legendary-flyers');
  });

  it('only offers a year-end reflection when current Tower progress is below the season baseline', () => {
    const current = getMeta();
    const behind = buildWorldState({ ...current, seasonYear: 4, towerFloor: 1, yearStartingBestTowerFloor: 3 });
    expect(yearEndReflection(behind)?.lines.map(line => line.text).join('\n')).toContain('lost sight of the next shift');
    expect(yearEndReflection(buildWorldState({ ...current, towerFloor: 3, yearStartingBestTowerFloor: 3 }))).toBeUndefined();
    expect(yearEndReflection(buildWorldState({ ...current, towerFloor: 4, yearStartingBestTowerFloor: 3 }))).toBeUndefined();
  });

  it('keeps ordinary island openings silent and limits each authored beat to one line', () => {
    expect(islandOpening('HAUNTED RINKS', 2)).toEqual([]);
    expect(yearOpening(1).lines).toHaveLength(1);
    expect(abyssFirstVisit()).toHaveLength(1);
    expect(secondCoastalBossVictory()).toHaveLength(1);
  });

  it('has dedicated save-wide first-Abyss and second-Coastal-boss dialogue', () => {
    expect(abyssFirstVisit().map(line => line.text).join('\n')).toContain('fog moves against the wind');
    expect(secondCoastalBossVictory().map(line => line.text).join('\n')).toContain('we knew what to do');
    expect(bossVictory('Coastal Circuit', 'Tideglass', 2, 'resource')[0].text).toContain('The resource is yours');
    expect(bossVictory('Coastal Circuit', 'Tideglass', 2, 'recruit')[0].text).toContain('You took one of theirs');
    expect(bossVictory('Coastal Circuit', 'Tideglass', 2, 'skipped')[0].text).toContain('You left the Tideglass');
  });
});
