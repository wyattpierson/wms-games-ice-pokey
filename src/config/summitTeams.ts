import type { Team } from './teams';

/** Summit League — roster OVR rises into the mid/high 90s; not meant for an unupgraded lineup. */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_SUMMIT: Team[] = [
  {
    id: 'knuckle-club-summit', name: 'High Altitude Flyers', color: 0x38bdf8, colorDark: 0x0369a1, role: 'regular',
    players: [
      { name: 'Noivern', sprite: 715, stats: s(87,97,117,86,91,120) },
      { name: 'Corviknight', sprite: 823, stats: s(102,92,72,120,106,75) },
      { name: 'Hawlucha', sprite: 701, stats: s(87,112,81,86,76,120) },
      { name: 'Altaria', sprite: 334, goalie: true, stats: s(90,75,80,115,120,80) },
    ],
  },
  {
    id: 'grave-diggers-summit', name: 'Stone Cold', color: 0x78716c, colorDark: 0x44403c, role: 'regular',
    players: [
      { name: 'Cetitan', sprite: 975, stats: s(110,120,65,95,80,90) },
      { name: 'Glimmora', sprite: 970, stats: s(90,65,120,100,90,90) },
      { name: 'Garganacl', sprite: 934, stats: s(130,100,70,120,120,50) },
      { name: 'Avalugg', sprite: 713, goalie: true, stats: s(140,115,70,120,100,40) },
    ],
  },
  {
    id: 'sparkle-squad-summit', name: 'The Steel Dojo', color: 0x94a3b8, colorDark: 0x475569, role: 'regular',
    players: [
      { name: 'Lucario', sprite: 448, stats: s(82,117,117,77,78,95) },
      { name: 'Gallade', sprite: 475, stats: s(77,117,77,83,118,90) },
      { name: 'Kommo-o', sprite: 784, stats: s(77,112,97,118,108,85) },
      { name: 'Aggron', sprite: 306, goalie: true, stats: s(105,115,80,120,110,50) },
    ],
  },
  {
    id: 'sky-raiders-summit', name: 'The Swords of Justice', color: 0x64748b, colorDark: 0x1e293b, role: 'boss',
    players: [
      { name: 'Terrakion', sprite: 639, stats: s(101,120,76,106,90,110) },
      { name: 'Virizion', sprite: 640, stats: s(91,101,101,86,120,115) },
      { name: 'Keldeo', sprite: 647, stats: s(91,91,120,91,95,115) },
      { name: 'Cobalion', sprite: 638, goalie: true, stats: s(100,90,80,120,110,90) },
    ],
  },
];
