import type { Team } from './teams';

/**
 * Coastal Circuit — the friendly on-ramp. Regular teams use real base stats;
 * each squad has one fast recruit and weaker supporting players. Pawmot is deliberately the first
 * truly exciting offensive pickup; defensive specialists have lower OVR but can
 * still feel threatening when the CPU uses them.
 */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_COASTAL: Team[] = [
  {
    id: 'knuckle-club-coastal', name: 'Pelipper Post', color: 0x0ea5e9, colorDark: 0x075985, role: 'regular',
    players: [
      { name: 'Pawmot', sprite: 923, stats: s(70, 115, 70, 70, 60, 105) },
      { name: 'Buizel', sprite: 418, stats: s(55, 65, 60, 35, 30, 85) },
      { name: 'Dartrix', sprite: 723, stats: s(78, 75, 70, 75, 70, 52) },
      { name: 'Pelipper', sprite: 279, goalie: true, stats: s(60, 50, 95, 100, 70, 65) },
    ],
  },
  {
    id: 'grave-diggers-coastal', name: 'Shell Smash', color: 0x14b8a6, colorDark: 0x0f766e, role: 'regular',
    players: [
      // Shellder introduces checking without a fully evolved defensive wall.
      { name: 'Shellder', sprite: 90, stats: s(30, 65, 45, 100, 25, 40) },
      { name: 'Dewgong', sprite: 87, stats: s(90, 70, 70, 80, 95, 70) },
      { name: 'Wugtrio', sprite: 961, stats: s(35, 100, 50, 50, 70, 120) },
      { name: 'Slowbro', sprite: 80, goalie: true, stats: s(95, 75, 100, 110, 80, 30) },
    ],
  },
  {
    id: 'sparkle-squad-coastal', name: 'Bug Buzz', color: 0xf472b6, colorDark: 0xbe185d, role: 'regular',
    players: [
      { name: 'Scyther', sprite: 123, stats: s(70, 110, 55, 80, 80, 105) },
      { name: 'Parasect', sprite: 47, stats: s(60, 95, 60, 80, 80, 30) },
      { name: 'Cutiefly', sprite: 742, stats: s(40, 45, 55, 40, 40, 84) },
      { name: 'Forretress', sprite: 205, goalie: true, stats: s(75, 90, 60, 140, 60, 40) },
    ],
  },
  {
    id: 'sky-raiders-coastal', name: 'The Kanto Captains', color: 0xf59e0b, colorDark: 0xb45309, role: 'boss',
    players: [
      { name: 'Charizard', sprite: 6, stats: s(78, 84, 109, 78, 85, 100) },
      { name: 'Blastoise', sprite: 9, stats: s(79, 83, 85, 100, 105, 78) },
      { name: 'Venusaur', sprite: 3, stats: s(80, 82, 100, 83, 100, 80) },
      { name: 'Corsola', sprite: 222, goalie: true, stats: s(65, 55, 65, 95, 95, 35) },
    ],
  },
];
