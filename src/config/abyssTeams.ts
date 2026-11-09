import type { Team } from './teams';

/** The Abyss — high-ceiling attackers plus a few deliberately oppressive CPU defenders. */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_ABYSS: Team[] = [
  {
    id: 'knuckle-club-abyss', name: 'Dragon Rush', color: 0x0891b2, colorDark: 0x164e63, role: 'regular',
    players: [
      { name: 'Kingdra', sprite: 230, stats: s(75, 95, 95, 95, 95, 85) },
      { name: 'Dragalge', sprite: 691, stats: s(65, 75, 97, 90, 123, 44) },
      { name: 'Gyarados', sprite: 130, stats: s(95, 125, 60, 79, 100, 81) },
      // Dondozo is slow and not especially threatening as a skater, but a miserable CPU goalie.
      { name: 'Dondozo', sprite: 977, goalie: true, stats: s(150, 100, 65, 115, 65, 35) },
    ],
  },
  {
    id: 'grave-diggers-abyss', name: 'Ultra Breakers', color: 0x0f766e, colorDark: 0x134e4a, role: 'regular',
    players: [
      { name: 'Kartana', sprite: 798, stats: s(59, 181, 59, 131, 31, 109) },
      { name: 'Iron Valiant', sprite: 1006, stats: s(74, 130, 120, 90, 60, 116) },
      { name: 'Hydreigon', sprite: 635, stats: s(92, 105, 125, 90, 90, 98) },
      { name: 'Goodra', sprite: 706, goalie: true, stats: s(90, 100, 110, 70, 150, 80) },
    ],
  },
  {
    id: 'sparkle-squad-abyss', name: 'Quiver Dance', color: 0x06b6d4, colorDark: 0x155e75, role: 'regular',
    players: [
      { name: 'Tapu Koko', sprite: 785, stats: s(70, 115, 95, 85, 75, 130) },
      { name: 'Dragapult', sprite: 887, stats: s(88, 120, 100, 75, 75, 142) },
      { name: 'Volcarona', sprite: 637, stats: s(85, 60, 135, 65, 105, 100) },
      { name: 'Toxapex', sprite: 748, goalie: true, stats: s(50, 63, 53, 152, 142, 35) },
    ],
  },
  {
    id: 'sky-raiders-abyss', name: 'The Forces of Nature', color: 0x7c3aed, colorDark: 0x4c1d95, role: 'boss',
    players: [
      { name: 'Tornadus', sprite: 641, stats: s(79, 115, 125, 70, 80, 111) },
      { name: 'Thundurus', sprite: 642, stats: s(79, 115, 125, 70, 80, 111) },
      { name: 'Landorus', sprite: 645, stats: s(89, 125, 115, 90, 80, 101) },
      { name: 'Lugia', sprite: 249, goalie: true, stats: s(106, 90, 90, 130, 154, 110) },
    ],
  },
];
