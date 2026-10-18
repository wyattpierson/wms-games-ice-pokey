import type { BaseStats } from '../core/stats';

/**
 * Team / roster data. Rosters are themed squads; stats are real Pokémon base
 * stats (the user may remap them later, same deal as pokemon-bowl's teams.ts).
 *
 * Roster = 4 Pokémon: 3 field + 1 goalie (the `goalie: true` entry).
 * The user's team always defends left / attacks right.
 */

export interface PlayerDef {
  name: string;
  /**
   * Sprite file id on the PokeAPI sprite mirror — the National Pokédex number
   * for default forms, but regional forms (e.g. Marowak-Alola 10115,
   * Articuno-Galar 10169) have their own file ids.
   */
  sprite: number;
  goalie?: boolean;
  stats: BaseStats;
}

export interface Team {
  /** Stable id — used by the campaign state machine and save files. */
  id: string;
  name: string;
  color: number; // body color
  colorDark: number; // outline / goalie tint
  players: [PlayerDef, PlayerDef, PlayerDef, PlayerDef];
}

const s = (
  hp: number, attack: number, specialAttack: number,
  defense: number, specialDefense: number, speed: number,
): BaseStats => ({ hp, attack, specialAttack, defense, specialDefense, speed });

/**
 * The user's starting team — deliberately the weakest on paper: a scrappy
 * water/electric trio behind a soft goalie. Beating the league is what makes
 * the poaches matter.
 */
export const USER_TEAM: Team = {
  id: 'hydro-voltz',
  name: 'Hydro Voltz',
  color: 0x3b82f6,
  colorDark: 0x1d4ed8,
  players: [
    { name: 'Psyduck', sprite: 54, stats: s(50, 52, 65, 48, 50, 55) },
    { name: 'Pikachu', sprite: 25, stats: s(35, 55, 50, 40, 50, 90) },
    { name: 'Pachirisu', sprite: 417, stats: s(60, 45, 45, 70, 90, 95) },
    { name: 'Clefairy', sprite: 35, goalie: true, stats: s(70, 45, 60, 48, 65, 35) },
  ],
};

export const OPPONENTS: Team[] = [
  {
    id: 'knuckle-club',
    name: 'Knuckle Club',
    color: 0xef4444,
    colorDark: 0xb91c1c,
    players: [
      { name: 'Pawmot', sprite: 923, stats: s(70, 115, 70, 70, 60, 105) },
      { name: 'Hitmonchan', sprite: 107, stats: s(50, 105, 35, 79, 110, 76) },
      { name: 'Grapploct', sprite: 853, stats: s(80, 118, 70, 90, 80, 42) },
      { name: 'Hariyama', sprite: 297, goalie: true, stats: s(144, 120, 40, 60, 60, 50) },
    ],
  },
  {
    id: 'grave-diggers',
    name: 'Grave Diggers',
    color: 0x22c55e,
    colorDark: 0x166534,
    players: [
      { name: 'Gengar', sprite: 94, stats: s(60, 65, 130, 60, 75, 110) },
      { name: 'Marowak (Alolan)', sprite: 10115, stats: s(60, 80, 50, 110, 80, 45) },
      { name: 'Mimikyu', sprite: 778, stats: s(55, 90, 50, 80, 105, 96) },
      { name: 'Golurk', sprite: 623, goalie: true, stats: s(89, 124, 55, 80, 80, 55) },
    ],
  },
  {
    id: 'sparkle-squad',
    name: 'Sparkle Squad',
    color: 0xec4899,
    colorDark: 0xbe185d,
    players: [
      { name: 'Togekiss', sprite: 468, stats: s(85, 50, 120, 95, 115, 80) },
      { name: 'Gardevoir', sprite: 282, stats: s(68, 65, 125, 65, 115, 80) },
      { name: 'Tapu Koko', sprite: 785, stats: s(70, 115, 95, 85, 75, 130) },
      { name: 'Comfey', sprite: 764, goalie: true, stats: s(51, 52, 82, 90, 110, 100) },
    ],
  },
];

/**
 * The champion: the gauntlet's finale. Always available (you can rush it), and
 * clearly the best team in the league — a flyer skyline on top of the highest
 * AI level. Beating it ends the run (victory); it grants no poach.
 */
export const CHAMPION_TEAM: Team = {
  id: 'sky-raiders',
  name: 'Sky Raiders',
  color: 0xf59e0b,
  colorDark: 0xb45309,
  players: [
    { name: 'Thundurus', sprite: 642, stats: s(79, 115, 125, 70, 80, 111) },
    { name: 'Articuno (Galarian)', sprite: 10169, stats: s(90, 85, 125, 85, 100, 95) },
    { name: 'Rayquaza', sprite: 384, stats: s(105, 150, 150, 90, 90, 95) },
    { name: 'Regice', sprite: 378, goalie: true, stats: s(80, 50, 100, 100, 200, 50) },
  ],
};

/** Every team you can face this run: the 3 regulars + the champion. */
export const CAMPAIGN_TEAMS: Team[] = [...OPPONENTS, CHAMPION_TEAM];
