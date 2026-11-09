import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER_TEAM } from '../config/teams';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('team identity across seasons', () => {
  it('preserves the chosen name through new seasons and saved-game reloads', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const store = await import('./runStore');
    const run = store.getRun();
    store.setRun({ ...run, userTeam: { ...run.userTeam, name: 'Ice Owls' }, gameOver: true });

    const next = store.resetRun();
    expect(next.userTeam.name).toBe('Ice Owls');
    expect(next.gameOver).toBe(false);
    expect(next.userTeam).not.toBe(run.userTeam);
    expect(USER_TEAM.name).toBe('Team Volt Tackle');

    vi.resetModules();
    const restored = await import('./runStore');
    expect(restored.getRun().userTeam.name).toBe('Ice Owls');
    expect(restored.resetRun().userTeam.name).toBe('Ice Owls');

    restored.clearRunSave();
    expect(restored.getRun().userTeam.name).toBe(USER_TEAM.name);
    expect(storage.has('ice-pokey:run')).toBe(false);
  });
});
