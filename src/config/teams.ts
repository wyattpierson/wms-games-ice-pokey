import type { BaseStats } from '../core/stats';

/**
 * Team / roster data. Stat values are DUMMY — the user will remap Pokémon to
 * real base-stat-style values later (same deal as pokemon-bowl's teams.ts).
 *
 * Roster = 4 Pokémon: 3 field + 1 goalie (the `goalie: true` entry).
 * The user's team always defends left / attacks right.
 */

export interface PlayerDef {
  name: string;
  /** Pokédex number — sprite loads from the PokeAPI sprite mirror. */
  sprite: number;
  goalie?: boolean;
  stats: BaseStats;
}

export interface Team {
  name: string;
  color: number; // body color
  colorDark: number; // outline / goalie tint
  players: [PlayerDef, PlayerDef, PlayerDef, PlayerDef];
}

const s = (
  hp: number, attack: number, specialAttack: number,
  defense: number, specialDefense: number, speed: number,
): BaseStats => ({ hp, attack, specialAttack, defense, specialDefense, speed });

export const USER_TEAM: Team = {
  name: 'Frost Pack',
  color: 0x3b82f6,
  colorDark: 0x1d4ed8,
  players: [
    { name: 'Pikachu', sprite: 25, stats: s(35, 45, 55, 40, 50, 120) },
    { name: 'Charizard', sprite: 6, stats: s(78, 84, 85, 79, 85, 100) },
    { name: 'Machamp', sprite: 68, stats: s(90, 130, 65, 80, 85, 55) },
    { name: 'Snorlax', sprite: 143, goalie: true, stats: s(160, 75, 43, 110, 65, 30) },
  ],
};

export const OPPONENTS: Team[] = [
  {
    name: 'Tidal Wave',
    color: 0x14b8a6,
    colorDark: 0x0f766e,
    players: [
      { name: 'Squirtle', sprite: 7, stats: s(44, 48, 58, 65, 64, 80) },
      { name: 'Lapras', sprite: 131, stats: s(130, 85, 85, 80, 85, 60) },
      { name: 'Gyarados', sprite: 130, stats: s(95, 125, 70, 79, 100, 81) },
      { name: 'Wigglytuff', sprite: 40, goalie: true, stats: s(140, 70, 85, 90, 80, 45) },
    ],
  },
  {
    name: 'Ember Blitz',
    color: 0xef4444,
    colorDark: 0xb91c1c,
    players: [
      { name: 'Charmeleon', sprite: 5, stats: s(58, 64, 80, 58, 65, 80) },
      { name: 'Arcanine', sprite: 59, stats: s(90, 110, 100, 90, 80, 95) },
      { name: 'Magmar', sprite: 126, stats: s(72, 95, 100, 57, 87, 93) },
      { name: 'Clefable', sprite: 35, goalie: true, stats: s(150, 80, 95, 95, 90, 60) },
    ],
  },
  {
    name: 'Tundra Kings',
    color: 0x8b5cf6,
    colorDark: 0x6d28d9,
    players: [
      { name: 'Weavile', sprite: 471, stats: s(70, 80, 70, 70, 75, 125) },
      { name: 'Mamoswine', sprite: 496, stats: s(110, 130, 70, 80, 65, 80) },
      { name: 'Froslass', sprite: 477, stats: s(70, 80, 80, 70, 75, 110) },
      { name: 'Avalugg', sprite: 611, goalie: true, stats: s(170, 100, 50, 140, 95, 28) },
    ],
  },
];
