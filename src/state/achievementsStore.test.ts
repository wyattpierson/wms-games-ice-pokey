import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  });
});
afterEach(() => vi.unstubAllGlobals());
const noHistory = { starterGoals: 0, zoneBossWins: {}, tournamentWon: false };

describe('sticky achievements', () => {
  it('unlocks at 10, 20 and 50 starter goals, one popup per trophy', async () => {
    const a = await import('./achievementsStore');
    a.migrateAchievements(noHistory);
    for (let i = 0; i < 9; i++) a.recordAchievementStarterGoal();
    expect(a.getAchievements().earned).toEqual({});
    a.recordAchievementStarterGoal();
    expect(a.takeAchievementPopup()?.id).toBe('starter-goals-10');
    expect(a.takeAchievementPopup()).toBeUndefined();
    for (let i = 10; i < 50; i++) a.recordAchievementStarterGoal();
    expect(Object.keys(a.getAchievements().earned)).toHaveLength(3);
    expect(a.takeAchievementPopup()?.id).toBe('starter-goals-20');
    expect(a.takeAchievementPopup()?.id).toBe('starter-goals-50');
  });

  it('credits all island bosses and a tournament win through gameplay hooks, without duplicate unlocks', async () => {
    const a = await import('./achievementsStore');
    const meta = await import('./metaStore');
    for (const id of ['coastal', 'summit', 'haunted', 'abyss']) meta.recordZoneBossWin(id);
    meta.recordZoneBossWin('coastal');
    meta.settleSeason(false);
    expect(a.getAchievements().earned['tournament-champion']).toBeUndefined();
    meta.settleSeason(true);
    meta.settleSeason(true);
    expect(Object.keys(a.getAchievements().earned)).toHaveLength(5);
    const popups = [];
    for (let p = a.takeAchievementPopup(); p; p = a.takeAchievementPopup()) popups.push(p.id);
    expect(new Set(popups).size).toBe(5);
    expect(popups).toHaveLength(5);
  });

  it('counts starter goals through evolution, but excludes teammates, opponents and goalies; retries keep trophies', async () => {
    const a = await import('./achievementsStore');
    const career = await import('./careerStatsStore');
    a.migrateAchievements({ ...noHistory, starterGoals: 9 });
    career.beginCareerRun('Team', 1);
    career.beginCareerMatch();
    career.recordCareerGoal(1);
    career.recordCareerGoal(0, { name: 'Pawmot', sprite: 923 });
    career.recordCareerGoal(0, { name: 'Goalie', sprite: 131, goalie: true, isStarter: true });
    expect(a.getAchievements().starterGoals).toBe(9);
    career.recordCareerGoal(0, { name: 'Tyranitar', sprite: 248, isStarter: true });
    career.rollbackCareerMatch();
    expect(a.getAchievements().starterGoals).toBe(10);
    expect(a.getAchievements().earned['starter-goals-10']).toBeTruthy();
  });

  it('imports old progress once and retains trophies and partial progress through the real wipe and reload', async () => {
    let a = await import('./achievementsStore');
    a.migrateAchievements({ starterGoals: 19, zoneBossWins: { coastal: 2 }, tournamentWon: true });
    const { wipeSaveData } = await import('./resetSaveData');
    localStorage.setItem('ice-pokey:balance-lab:v1', 'history');
    localStorage.setItem('unrelated', 'keep');
    wipeSaveData();
    expect(localStorage.getItem('ice-pokey:balance-lab:v1')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(localStorage.getItem(a.ACHIEVEMENTS_STORAGE_KEY)).toBeTruthy();
    vi.resetModules();
    a = await import('./achievementsStore');
    expect(a.takeAchievementPopup()).toBeUndefined();
    a.migrateAchievements({ ...noHistory, starterGoals: 100 });
    expect(a.getAchievements().starterGoals).toBe(19);
    expect(Object.keys(a.getAchievements().earned)).toHaveLength(3);
    a.recordAchievementStarterGoal();
    expect(a.takeAchievementPopup()?.id).toBe('starter-goals-20');
  });

  it('handles malformed storage and blocked persistence', async () => {
    localStorage.setItem('ice-pokey:achievements:v1', '{broken');
    const a = await import('./achievementsStore');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => a.recordAchievementTournamentWin()).not.toThrow();
    expect(a.getAchievements().earned['tournament-champion']).toBeTruthy();
  });
});
