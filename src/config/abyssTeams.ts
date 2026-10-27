import type { Team } from './teams';

/** The Abyss — high-ceiling attackers plus a few deliberately oppressive CPU defenders. */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_ABYSS: Team[] = [
  {
    id: 'knuckle-club-abyss', name: 'Deep Current', color: 0x0891b2, colorDark: 0x164e63, role: 'regular',
    players: [
      { name: 'Kingdra', sprite: 230, stats: s(90,109,114,104,109,95) },
      { name: 'Dragalge', sprite: 691, stats: s(84,94,120,104,120,55) },
      { name: 'Gyarados', sprite: 130, stats: s(104,120,84,104,114,100) },
      // Dondozo is slow and not especially threatening as a skater, but a miserable CPU goalie.
      { name: 'Dondozo', sprite: 977, goalie: true, stats: s(170,105,65,120,120,30) },
    ],
  },
  {
    id: 'grave-diggers-abyss', name: 'Ancient Pressure', color: 0x0f766e, colorDark: 0x134e4a, role: 'regular',
    players: [
      { name: 'Kartana', sprite: 798, stats: s(74,120,74,120,48,120) },
      { name: 'Iron Valiant', sprite: 1006, stats: s(84,120,120,99,78,120) },
      { name: 'Hydreigon', sprite: 635, stats: s(104,119,120,98,103,105) },
      { name: 'Goodra', sprite: 706, goalie: true, stats: s(100,105,120,85,120,75) },
    ],
  },
  {
    id: 'sparkle-squad-abyss', name: 'Abyssal All-Stars', color: 0x06b6d4, colorDark: 0x155e75, role: 'regular',
    players: [
      { name: 'Tapu Koko', sprite: 785, stats: s(75,120,120,90,90,120) },
      { name: 'Dragapult', sprite: 887, stats: s(90,120,115,85,85,120) },
      { name: 'Volcarona', sprite: 637, stats: s(100,90,120,85,120,115) },
      { name: 'Toxapex', sprite: 748, goalie: true, stats: s(120,85,80,120,120,45) },
    ],
  },
  {
    id: 'sky-raiders-abyss', name: 'The Forces of Nature', color: 0x7c3aed, colorDark: 0x4c1d95, role: 'boss',
    players: [
      { name: 'Tornadus', sprite: 641, stats: s(92,112,120,87,96,120) },
      { name: 'Thundurus', sprite: 642, stats: s(92,117,120,86,91,120) },
      { name: 'Landorus', sprite: 645, stats: s(102,120,117,106,96,110) },
      { name: 'Enamorus', sprite: 905, goalie: true, stats: s(115,90,110,115,120,95) },
    ],
  },
];
