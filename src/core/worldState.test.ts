import { describe, expect, it } from 'vitest';
import { ALL_TEAMS } from '../config/teams';
import { getMeta } from '../state/metaStore';
import { buildWorldState, resolveWorldTeam, worldEventMatches } from './worldState';

describe('world state event rules', () => {
  it('changes the Coastal boss to Galarian Legendary Birds in Year 6 after a two-floor Tower run', () => {
    const meta = {
      ...getMeta(),
      seasonYear: 6,
      bestTowerFloor: 2,
      towerFloor: 0,
    };
    const state = buildWorldState(meta);
    expect(state.activeEventIds).toContain('galarian-legendary-flyers');
    const base = ALL_TEAMS.find(team => team.id === 'sky-raiders-coastal')!;
    const changed = resolveWorldTeam(base, meta);
    expect(changed.name).toBe('The Galarian Flyers');
    expect(changed.players.map(player => player.name)).toEqual([
      'Zapdos (Galarian)', 'Moltres (Galarian)', 'Articuno (Galarian)', 'Lapras',
    ]);
    expect(changed.players.map(player => player.sprite)).toEqual([10170, 10171, 10169, 131]);
  });

  it('does not activate the Galarian event before Year 6 or before two Tower floors are cleared', () => {
    const base = ALL_TEAMS.find(team => team.id === 'sky-raiders-coastal')!;
    expect(buildWorldState({ ...getMeta(), seasonYear: 5, bestTowerFloor: 12 }).activeEventIds).not.toContain('galarian-legendary-flyers');
    expect(resolveWorldTeam(base, { ...getMeta(), seasonYear: 6, bestTowerFloor: 1 }).name).toBe('The Legendary Flyers');
  });

  it('derives save-wide progression facts without requiring the current run to contain those wins', () => {
    const meta = {
      ...getMeta(),
      zoneBossWins: { coastal: 1, haunted: 1, summit: 1, abyss: 1 },
      everEnteredZones: ['coastal', 'haunted', 'summit', 'abyss'],
    };
    const state = buildWorldState(meta);
    expect(state.allZonesClearedEver).toBe(true);
    expect(state.zonesClearedEver).toHaveLength(4);
  });

  it('supports conditions based on previous-year progress and starter evolution', () => {
    const current = getMeta();
    const state = buildWorldState({
      ...current,
      seasonYear: 7,
      previousYearTowerFloor: 2,
      yearStartingBestTowerFloor: 3,
      starter: 'bagon',
      starterXp: { ...current.starterXp, bagon: 100 },
    });
    expect(worldEventMatches(state, { minPreviousYearTowerFloor: 2, minYearStartingBestTowerFloor: 3, minStarterStage: 2 })).toBe(true);
    expect(worldEventMatches(state, { minPreviousYearTowerFloor: 3 })).toBe(false);
  });
});
