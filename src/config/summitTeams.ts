import type { Team } from './teams';

/** Summit League — the second region, with mountain specialists and the Legendary Birds. */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_SUMMIT: Team[] = [
  {
    id: 'knuckle-club-summit', name: 'Tailwind Talons', color: 0x38bdf8, colorDark: 0x0369a1, role: 'regular',
    players: [
      { name: 'Noivern', sprite: 715, stats: s(85, 70, 97, 80, 80, 123) },
      { name: 'Corviknight', sprite: 823, stats: s(98, 87, 53, 105, 85, 67) },
      { name: 'Hawlucha', sprite: 701, stats: s(78, 92, 74, 75, 63, 118) },
      { name: 'Altaria', sprite: 334, goalie: true, stats: s(75, 70, 70, 90, 105, 80) },
    ],
  },
  {
    id: 'grave-diggers-summit', name: 'Regice Guard', color: 0x78716c, colorDark: 0x44403c, role: 'regular',
    players: [
      { name: 'Cetitan', sprite: 975, stats: s(170, 113, 45, 65, 55, 73) },
      { name: 'Glimmora', sprite: 970, stats: s(83, 55, 130, 90, 81, 86) },
      { name: 'Naclstack', sprite: 933, stats: s(60, 60, 35, 100, 65, 35) },
      { name: 'Regice', sprite: 378, goalie: true, stats: s(80, 50, 100, 100, 200, 50) },
    ],
  },
  {
    id: 'sparkle-squad-summit', name: 'Aura Guardians', color: 0x94a3b8, colorDark: 0x475569, role: 'regular',
    players: [
      { name: 'Lucario', sprite: 448, stats: s(70, 110, 115, 70, 70, 90) },
      { name: 'Gallade', sprite: 475, stats: s(68, 125, 65, 65, 115, 80) },
      { name: 'Hakamo-o', sprite: 783, stats: s(55, 75, 65, 90, 70, 65) },
      { name: 'Aggron', sprite: 306, goalie: true, stats: s(70, 110, 60, 180, 60, 50) },
    ],
  },
  {
    id: 'sky-raiders-summit', name: 'The Legendary Birds', color: 0x64748b, colorDark: 0x1e293b, role: 'boss',
    players: [
      { name: 'Zapdos', sprite: 145, stats: s(90, 90, 125, 85, 90, 100) },
      { name: 'Moltres', sprite: 146, stats: s(90, 100, 125, 90, 85, 90) },
      { name: 'Articuno', sprite: 144, stats: s(90, 85, 95, 100, 125, 85) },
      { name: 'Mantine', sprite: 226, goalie: true, stats: s(85, 40, 80, 70, 140, 70) },
    ],
  },
];
