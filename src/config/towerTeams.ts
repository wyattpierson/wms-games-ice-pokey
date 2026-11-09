import type { Team } from './teams';

/**
 * Tower-only rosters. These species are selected for the elite island ladder:
 * the player's first tournament visit is a lesson in coming back stronger,
 * not a final match they should be expected to win on their first year.
 */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});

export const TOWER_TEAMS: Team[] = [
  {
    id: 'tower-warden', name: "Paldea All-Stars", color: 0x7f1d1d, colorDark: 0x450a0a, role: 'tower',
    players: [
      { name: 'Flutter Mane', sprite: 987, stats: s(55, 55, 135, 55, 135, 135) },
      { name: 'Iron Hands', sprite: 992, stats: s(154, 140, 50, 108, 68, 50) },
      { name: 'Chien-Pao', sprite: 1002, stats: s(80, 120, 90, 80, 65, 135) },
      { name: 'Ting-Lu', sprite: 1003, goalie: true, stats: s(155, 110, 55, 125, 80, 45) },
    ],
  },
  {
    id: 'tower-phalanx', name: 'Iron Defense', color: 0x64748b, colorDark: 0x334155, role: 'tower',
    players: [
      { name: 'Archaludon', sprite: 1018, stats: s(90, 105, 125, 130, 65, 85) },
      { name: 'Gholdengo', sprite: 1000, stats: s(87, 60, 133, 95, 91, 84) },
      { name: 'Iron Crown', sprite: 1023, stats: s(90, 72, 122, 100, 108, 98) },
      // Blissey trades very low physical Defense for huge HP and Special Defense.
      { name: 'Blissey', sprite: 242, goalie: true, stats: s(255, 10, 75, 10, 135, 55) },
    ],
  },
  {
    id: 'tower-aces', name: 'Crowned Legends', color: 0xdc2626, colorDark: 0x7f1d1d, role: 'tower',
    players: [
      { name: 'Spectrier', sprite: 897, stats: s(100, 65, 145, 60, 80, 130) },
      { name: 'Glastrier', sprite: 896, stats: s(100, 145, 65, 130, 110, 30) },
      { name: 'Urshifu', sprite: 892, stats: s(100, 130, 63, 100, 60, 97) },
      { name: 'Zamazenta', sprite: 889, goalie: true, stats: s(92, 120, 80, 115, 115, 138) },
    ],
  },
  {
    id: 'tower-celestial', name: 'Alola Eclipse', color: 0x818cf8, colorDark: 0x312e81, role: 'tower',
    players: [
      { name: 'Solgaleo', sprite: 791, stats: s(137, 137, 113, 107, 89, 97) },
      { name: 'Lunala', sprite: 792, stats: s(137, 113, 137, 89, 107, 97) },
      { name: 'Deoxys', sprite: 386, stats: s(50, 150, 150, 50, 50, 150) },
      { name: 'Cresselia', sprite: 488, goalie: true, stats: s(120, 70, 75, 110, 120, 85) },
    ],
  },
  {
    id: 'tower-origin', name: 'Sinnoh Origins', color: 0xe2e8f0, colorDark: 0x475569, role: 'tower',
    players: [
      { name: 'Dialga', sprite: 483, stats: s(100, 120, 150, 120, 100, 90) },
      { name: 'Palkia', sprite: 484, stats: s(90, 120, 150, 100, 120, 100) },
      { name: 'Arceus', sprite: 493, stats: s(120, 120, 120, 120, 120, 120) },
      { name: 'Giratina', sprite: 487, goalie: true, stats: s(150, 100, 100, 120, 120, 90) },
    ],
  },
];

/** Story opponents use stable IDs; the rival roster is resolved from the save. */
TOWER_TEAMS.push(
  { id: 'story-rival', name: 'Rival', role: 'tower', color: 0xf59e0b, colorDark: 0x78350f, players: [
    { name: 'Garchomp', sprite: 445, stats: s(108,130,80,95,85,102) },
    { name: 'Scizor', sprite: 212, stats: s(70,130,55,100,80,65) },
    { name: 'Gengar', sprite: 94, stats: s(60,65,130,60,75,110) },
    { name: 'Snorlax', sprite: 143, goalie: true, stats: s(160,110,65,65,110,30) },
  ] },
  { id: 'story-villain', name: 'Eclipse Court', role: 'tower', color: 0xba2457, colorDark: 0x320c25, players: [
    { name: 'Yveltal', sprite: 717, stats: s(126,131,131,95,98,99) },
    { name: 'Darkrai', sprite: 491, stats: s(70,90,135,90,90,125) },
    { name: 'Giratina', sprite: 487, stats: s(150,100,100,120,120,90) },
    { name: 'Zygarde (Complete)', sprite: 10120, goalie: true, stats: s(216,100,91,121,95,85) },
  ] },
  { id: 'story-arceus', name: 'Arceus — Judgment', role: 'tower', color: 0xfff3be, colorDark: 0x625530, players: [
    { name: 'Arceus (Fire)', sprite: 493, stats: s(120,120,120,120,120,120) },
    { name: 'Arceus (Dragon)', sprite: 493, stats: s(120,120,120,120,120,120) },
    { name: 'Arceus (Ghost)', sprite: 493, stats: s(120,120,120,120,120,120) },
    { name: 'Arceus (Steel)', sprite: 493, goalie: true, stats: s(120,120,120,120,120,120) },
  ] },
);
