import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveCareerRun,
  beginCareerMatch,
  beginCareerRun,
  clearCareerStats,
  getCareerStats,
  recordCareerGoal,
  rollbackCareerMatch,
} from './careerStatsStore';

const starter = { name: 'Larvitar', sprite: 246, isStarter: true };
const winger = { name: 'Pawmot', sprite: 923, isStarter: false };
const goalie = { name: 'Lapras', sprite: 131, goalie: true, isStarter: false };

beforeEach(() => clearCareerStats());

describe('career stats storage', () => {
  it('records goals and assists per Pokémon, while keeping opponent goals as team totals only', () => {
    beginCareerRun('Puck Masters', 2, [starter, winger, goalie]);
    beginCareerMatch('Puck Masters', 2, [starter, winger, goalie]);

    recordCareerGoal(0, { name: 'Tyranitar', sprite: 248, isStarter: true }, winger);
    recordCareerGoal(1);

    const stats = getCareerStats();
    expect(stats.currentRun?.goalsFor).toBe(1);
    expect(stats.currentRun?.goalsAgainst).toBe(1);
    expect(Object.values(stats.currentRun!.playerStats).find(p => p.isStarter)?.goals).toBe(1);
    expect(Object.values(stats.currentRun!.playerStats).find(p => p.name === 'Pawmot')?.assists).toBe(1);
    expect(Object.values(stats.allTime).find(p => p.isStarter)?.goals).toBe(1);
    expect(Object.values(stats.allTime).find(p => p.name === 'Pawmot')?.assists).toBe(1);
  });

  it('adds newly recruited active players even before they score', () => {
    beginCareerRun('Puck Masters', 1, [starter, goalie]);
    beginCareerMatch('Puck Masters', 1, [starter, winger, goalie]);
    const stats = getCareerStats();
    expect(stats.currentRun?.lineup.some(p => p.name === 'Pawmot')).toBe(true);
    expect(Object.values(stats.currentRun!.playerStats).some(p => p.name === 'Pawmot' && p.goals === 0 && p.assists === 0)).toBe(true);
    expect(Object.values(stats.allTime).some(p => p.name === 'Pawmot')).toBe(true);
  });

  it('aggregates the same starter through evolution forms', () => {
    beginCareerRun('Puck Masters', 1, [starter]);
    beginCareerMatch('Puck Masters', 1, [{ name: 'Tyranitar', sprite: 248, isStarter: true }]);
    recordCareerGoal(0, { name: 'Tyranitar', sprite: 248, isStarter: true });
    const rows = Object.values(getCareerStats().allTime).filter(p => p.isStarter);
    expect(rows).toHaveLength(1);
    expect(rows[0].goals).toBe(1);
    expect(rows[0].name).toBe('Tyranitar');
  });

  it('rolls back a failed attempt and its history when Second Chance is used', () => {
    beginCareerRun('Puck Masters', 1, [starter, winger]);
    beginCareerMatch('Puck Masters', 1, [starter, winger]);
    recordCareerGoal(0, starter, winger);
    archiveCareerRun({ outcome: 'loss', teamName: 'Puck Masters', year: 1, lineup: [starter, winger], lostTo: 'Ghost Squad', score: { for: 1, against: 3 }, winsBeforeEnd: 2 });

    rollbackCareerMatch();
    const stats = getCareerStats();
    expect(stats.currentRun?.outcome).toBeUndefined();
    expect(stats.currentRun?.goalsFor).toBe(0);
    expect(Object.values(stats.allTime).find(p => p.isStarter)?.goals).toBe(0);
    expect(stats.history).toHaveLength(0);
  });

  it('archives a loss with the active lineup and avoids duplicate history entries', () => {
    beginCareerRun('Puck Masters', 3, [starter, winger]);
    archiveCareerRun({ outcome: 'loss', teamName: 'Puck Masters', year: 3, lineup: [starter, winger], lostTo: 'Summit', score: { for: 0, against: 3 }, winsBeforeEnd: 4 });
    archiveCareerRun({ outcome: 'loss', teamName: 'Puck Masters', year: 3, lineup: [starter, winger], lostTo: 'Summit', score: { for: 0, against: 3 }, winsBeforeEnd: 4 });
    const stats = getCareerStats();
    expect(stats.history).toHaveLength(1);
    expect(stats.history[0].lostTo).toBe('Summit');
    expect(stats.history[0].lineup.map(p => p.name)).toEqual(['Larvitar', 'Pawmot']);
  });
});
