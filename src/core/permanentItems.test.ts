import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../config/progression';
import { USER_TEAM } from '../config/teams';
import { applyPermanentSpeciesEvolution, isStarterAtFinalEvolution } from './permanentItems';

describe('permanent species items', () => {
  it('evolves the starting Pikachu into Raichu when unlocked', () => {
    const pikachu = USER_TEAM.players.find(p => p.name === 'Pikachu');
    expect(pikachu).toBeDefined();
    const evolved = applyPermanentSpeciesEvolution(pikachu!, [ITEM_IDS.evolvePikachu]);
    expect(evolved.name).toBe('Raichu');
    expect(evolved.sprite).toBe(26);
  });

  it('evolves the starting Psyduck into Golduck when unlocked', () => {
    const psyduck = USER_TEAM.players.find(p => p.name === 'Psyduck');
    expect(psyduck).toBeDefined();
    const evolved = applyPermanentSpeciesEvolution(psyduck!, [ITEM_IDS.evolvePsyduck]);
    expect(evolved.name).toBe('Golduck');
    expect(evolved.sprite).toBe(55);
  });

  it('keeps Mega Band hidden until the starter reaches its final evolution threshold', () => {
    const xp = { larvitar: 99, gible: 100, bagon: 0 };
    expect(isStarterAtFinalEvolution('gible', xp)).toBe(true);
    expect(isStarterAtFinalEvolution('larvitar', xp)).toBe(false);
    expect(isStarterAtFinalEvolution(null, xp)).toBe(false);
  });
});
