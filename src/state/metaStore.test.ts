import { afterEach, describe, expect, it } from 'vitest';
import { beginNewYear, getMeta, resetMetaState, updateMeta } from './metaStore';
import { YEAR_LENGTH_DAYS } from '../config/progression';

afterEach(() => resetMetaState());

describe('active island commitment', () => {
  it('persists while in a year and clears when a new year begins', () => {
    updateMeta({ activeIslandId: 'coastal', daysRemaining: 0 });
    expect(getMeta().activeIslandId).toBe('coastal');
    beginNewYear();
    expect(getMeta().activeIslandId).toBeNull();
    expect(getMeta().daysRemaining).toBe(YEAR_LENGTH_DAYS);
  });
});

describe('persistent campaign world history', () => {
  it('remembers the first-ever zone visit only once', async () => {
    const { markZoneEntered } = await import('./metaStore');
    expect(markZoneEntered('abyss')).toBe(true);
    expect(markZoneEntered('abyss')).toBe(false);
    expect(getMeta().everEnteredZones).toContain('abyss');
  });

  it('counts boss wins across years and claims a resource once per year', async () => {
    const { claimIslandResource, recordZoneBossWin } = await import('./metaStore');
    expect(recordZoneBossWin('coastal')).toBe(1);
    expect(recordZoneBossWin('coastal')).toBe(2);
    expect(claimIslandResource('coastal', 3)).toBe(true);
    expect(claimIslandResource('coastal', 3)).toBe(false);
    expect(getMeta().islandResources.coastal).toBe(1);
  });

  it('keeps the prior-season tower result and current season baseline when advancing', async () => {
    const { updateMeta } = await import('./metaStore');
    updateMeta({ yearStarted: true, seasonYear: 4, towerFloor: 3, bestTowerFloor: 5 });
    beginNewYear();
    expect(getMeta().previousYearTowerFloor).toBe(3);
    expect(getMeta().yearStartingBestTowerFloor).toBe(5);
    expect(getMeta().towerFloor).toBe(0);
    expect(getMeta().seasonYear).toBe(5);
  });
});


describe('Item Shop purchases', () => {
  it('charges credits and the required realm resource atomically', async () => {
    const { buyShopOffer } = await import('./metaStore');
    updateMeta({ currency: 20, islandResources: { coastal: 1, haunted: 0, summit: 0, abyss: 0 } });
    expect(buyShopOffer('evolve-pikachu', 12, { zoneId: 'coastal', amount: 1 })).toBe(true);
    expect(getMeta().currency).toBe(8);
    expect(getMeta().islandResources.coastal).toBe(0);
    expect(getMeta().unlocked).toContain('evolve-pikachu');
  });

  it('does not spend credits if the required realm resource is missing', async () => {
    const { buyShopOffer } = await import('./metaStore');
    updateMeta({ currency: 50, islandResources: { coastal: 0, haunted: 0, summit: 0, abyss: 0 } });
    expect(buyShopOffer('mega-band', 26, { zoneId: 'abyss', amount: 1 })).toBe(false);
    expect(getMeta().currency).toBe(50);
    expect(getMeta().unlocked).not.toContain('mega-band');
  });
});
