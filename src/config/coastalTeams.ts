import type { Team } from './teams';

/**
 * Coastal Circuit — the friendly on-ramp. Regular teams are 72 OVR, with a 77 OVR boss;
 * each squad has one fast recruit and weaker supporting players. Pawmot is deliberately the first
 * truly exciting offensive pickup; defensive specialists have lower OVR but can
 * still feel threatening when the CPU uses them.
 */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_COASTAL: Team[] = [
  {
    id: 'knuckle-club-coastal', name: 'Boardwalk Blitz', color: 0x0ea5e9, colorDark: 0x075985, role: 'regular',
    players: [
      { name: 'Pawmot', sprite: 923, stats: s(70,115,70,70,60,105) },
      { name: 'Buizel', sprite: 418, stats: s(69,74,64,59,53,80) },
      { name: 'Wattrel', sprite: 940, stats: s(64,59,69,53,58,80) },
      { name: 'Pelipper', sprite: 279, goalie: true, stats: s(74,54,84,93,73,60) },
    ],
  },
  {
    id: 'grave-diggers-coastal', name: 'Shell Shockers', color: 0x14b8a6, colorDark: 0x0f766e, role: 'regular',
    players: [
      // Cloyster is the early CPU-defense lesson: hard to get past, but not fast.
      { name: 'Cloyster', sprite: 91, stats: s(43,68,59,114,44,65) },
      { name: 'Dewgong', sprite: 87, stats: s(83,58,64,69,89,65) },
      { name: 'Wugtrio', sprite: 961, stats: s(60,100,65,60,65,115) },
      { name: 'Slowbro', sprite: 80, goalie: true, stats: s(88,59,79,99,84,35) },
    ],
  },
  {
    id: 'sparkle-squad-coastal', name: 'Pocket-Sized Powerhouses', color: 0xf472b6, colorDark: 0xbe185d, role: 'regular',
    players: [
      { name: 'Scyther', sprite: 123, stats: s(70,100,50,75,80,100) },
      { name: 'Parasect', sprite: 47, stats: s(72,81,61,71,71,40) },
      { name: 'Cutiefly', sprite: 742, stats: s(57,51,66,56,66,80) },
      { name: 'Forretress', sprite: 205, goalie: true, stats: s(82,86,66,120,71,40) },
    ],
  },
  {
    id: 'sky-raiders-coastal', name: 'The Legendary Flyers', color: 0xf59e0b, colorDark: 0xb45309, role: 'boss',
    players: [
      { name: 'Zapdos', sprite: 145, stats: s(74,74,84,64,69,100) },
      { name: 'Moltres', sprite: 146, stats: s(79,84,84,64,69,90) },
      { name: 'Articuno', sprite: 144, stats: s(74,59,79,79,85,75) },
      { name: 'Mantine', sprite: 226, goalie: true, stats: s(95,50,70,90,100,65) },
    ],
  },
];
