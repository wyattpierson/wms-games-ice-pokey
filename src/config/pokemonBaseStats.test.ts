import { describe, expect, it } from 'vitest';
import reference from './pokemonBaseStats.fixture.json';
import { ALL_TEAMS, USER_TEAM } from './teams';
import { STARTER_EVOLUTIONS, ITEM_IDS } from './progression';
import { WORLD_EVENTS } from './worldEvents';
import { applyPermanentSpeciesEvolution, MEGA_STARTER_FORMS } from '../core/permanentItems';

// Independent PokeAPI snapshot, verified 2026-10-27. Look up by form name:
// https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon.csv
// https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_stats.csv
// Named stat keys catch the easy-to-miss Defense / Special Attack swap.
const definitions = [
  ...USER_TEAM.players,
  ...ALL_TEAMS.flatMap(team => team.players),
  ...WORLD_EVENTS.flatMap(event => event.teamOverrides?.flatMap(team => team.players ?? []) ?? []),
  ...Object.values(STARTER_EVOLUTIONS).flat(),
  ...Object.values(MEGA_STARTER_FORMS),
  ...USER_TEAM.players.map(player => applyPermanentSpeciesEvolution(player, [ITEM_IDS.evolvePikachu, ITEM_IDS.evolvePsyduck])),
];

describe('canonical Pokémon base stats', () => {
  for (const [index, player] of definitions.entries()) {
    it(`${player.name} definition ${index} matches its species/form`, () => {
      const entry = reference[player.name as keyof typeof reference];
      expect(entry, `${player.name} needs a verified reference entry`).toBeDefined();
      expect(player.stats).toEqual(entry.stats);
    });
  }
});
