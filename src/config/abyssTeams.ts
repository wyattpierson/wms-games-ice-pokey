import type { Team } from './teams';

/** The Abyss — high-ceiling attackers plus a few deliberately oppressive CPU defenders. */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_ABYSS: Team[] = [
  {
    id: 'knuckle-club-abyss', name: 'Deep Current', color: 0x0891b2, colorDark: 0x164e63, role: 'regular',
    players: [
      { name: 'Kingdra', sprite: 230, stats: s(85,105,110,100,105,95) },
      { name: 'Dragalge', sprite: 691, stats: s(80,90,120,100,120,55) },
      { name: 'Gyarados', sprite: 130, stats: s(100,120,80,100,110,100) },
      // Dondozo is slow and not especially threatening as a skater, but a miserable CPU goalie.
      { name: 'Dondozo', sprite: 977, goalie: true, stats: s(170,105,65,120,120,30) },
    ],
  },
  {
    id: 'grave-diggers-abyss', name: 'Ancient Pressure', color: 0x0f766e, colorDark: 0x134e4a, role: 'regular',
    players: [
      { name: 'Kartana', sprite: 798, stats: s(70,120,70,120,45,120) },
      { name: 'Iron Valiant', sprite: 1006, stats: s(80,120,120,95,75,120) },
      { name: 'Hydreigon', sprite: 635, stats: s(100,115,120,95,100,105) },
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
      { name: 'Tornadus', sprite: 641, stats: s(90,110,120,85,95,120) },
      { name: 'Thundurus', sprite: 642, stats: s(90,115,120,85,90,120) },
      { name: 'Landorus', sprite: 645, stats: s(100,120,115,105,95,110) },
      { name: 'Milotic', sprite: 350, goalie: true, stats: s(120,90,120,100,120,90) },
    ],
  },
];
