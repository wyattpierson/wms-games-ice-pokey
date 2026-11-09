import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function freshCareer() {
  const meta = await import('./metaStore');
  meta.chooseStarter('gible');
  meta.beginNewYear();
  const run = await import('./runStore');
  run.resetRun();
  run.setRun({ ...run.getRun(), userTeam: { ...run.getRun().userTeam, name: 'Our Team' } });
  return { meta, run, onboarding: await import('./onboarding') };
}

describe('first career entry', () => {
  it('starts the real Coastal opponent, charges normal days once, and preserves the named roster', async () => {
    const { meta, run, onboarding } = await freshCareer();
    const { TIME_COSTS, ZONES } = await import('../config/progression');
    expect(onboarding.needsFirstRunIntro()).toBe(true);
    const before = meta.getMeta();
    const config = onboarding.prepareFirstCoastalMatch();
    expect(config?.opponent.id).toBe(ZONES[0].opponents[0]);
    expect(config?.level).toBe(ZONES[0].difficulty);
    expect(config?.userTeam.name).toBe('Our Team');
    expect(run.getRun().matchInProgress).toBe(ZONES[0].opponents[0]);
    expect(meta.getMeta().daysRemaining).toBe(before.daysRemaining - TIME_COSTS.islandVisit - TIME_COSTS.match);
    expect(meta.getMeta().activeIslandId).toBe('coastal');
    expect(meta.getMeta().everEnteredZones).toEqual(['coastal']);
    expect(onboarding.prepareFirstCoastalMatch()).toBeNull();
    expect(meta.getMeta().daysRemaining).toBe(285);
    expect(meta.getMeta().currency).toBe(0);
    expect(meta.getMeta().totalMatches).toBe(0);
  });
  it('does not force established saves, visited islands, or later years back through training', async () => {
    const { meta, onboarding } = await freshCareer();
    meta.updateMeta({ totalMatches: 3 });
    expect(onboarding.needsFirstRunIntro()).toBe(false);
    meta.updateMeta({ totalMatches: 0, seasonYear: 2 });
    expect(onboarding.prepareFirstCoastalMatch()).toBeNull();
    meta.updateMeta({ seasonYear: 1, activeIslandId: 'coastal' });
    expect(onboarding.needsFirstRunIntro()).toBe(false);
    meta.updateMeta({ activeIslandId: null, everEnteredZones: ['haunted'] });
    expect(onboarding.needsFirstRunIntro()).toBe(false);
  });
  it('never replaces a pending reward or an existing match', async () => {
    const { run, onboarding } = await freshCareer();
    run.setRun({ ...run.getRun(), pendingPoach: 'knuckle-club-coastal' });
    expect(onboarding.prepareFirstCoastalMatch()).toBeNull();
    run.setRun({ ...run.getRun(), pendingPoach: undefined, matchInProgress: 'grave-diggers-coastal' });
    expect(onboarding.prepareFirstCoastalMatch()).toBeNull();
  });
});
