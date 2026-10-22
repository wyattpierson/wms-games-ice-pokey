import type { Team } from './teams';

/** Haunted Rinks — roughly even with a well-recruited Coastal lineup. */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_HAUNTED: Team[] = [
  {
    id: 'knuckle-club-haunted', name: 'The Graveyard Shift', color: 0x8b5cf6, colorDark: 0x5b21b6, role: 'regular',
    players: [
      { name: 'Mimikyu', sprite: 778, stats: s(60,95,55,90,110,96) },
      { name: 'Houndstone', sprite: 972, stats: s(80,100,55,105,90,75) },
      { name: 'Annihilape', sprite: 979, stats: s(90,115,70,85,90,90) },
      { name: 'Cofagrigus', sprite: 563, goalie: true, stats: s(60,45,80,120,110,25) },
    ],
  },
  {
    id: 'grave-diggers-haunted', name: 'Midnight Masquerade', color: 0x6366f1, colorDark: 0x3730a3, role: 'regular',
    players: [
      { name: 'Zoroark', sprite: 571, stats: s(60,100,110,65,65,105) },
      { name: 'Froslass', sprite: 478, stats: s(70,75,85,70,75,105) },
      { name: 'Banette', sprite: 354, stats: s(65,100,80,70,70,65) },
      // Dusknoir is a slow, excellent CPU defender; its OVR alone doesn't tell the story.
      { name: 'Dusknoir', sprite: 477, goalie: true, stats: s(55,90,65,120,120,45) },
    ],
  },
  {
    id: 'sparkle-squad-haunted', name: 'Dark Arts Academy', color: 0xa855f7, colorDark: 0x6b21a8, role: 'regular',
    players: [
      { name: 'Chandelure', sprite: 609, stats: s(60,55,120,85,95,80) },
      { name: 'Grimmsnarl', sprite: 861, stats: s(95,115,85,75,80,70) },
      { name: 'Spiritomb', sprite: 442, stats: s(60,90,90,110,110,45) },
      { name: 'Sableye', sprite: 302, goalie: true, stats: s(60,75,65,95,85,55) },
    ],
  },
  {
    id: 'sky-raiders-haunted', name: 'The Roaming Legends', color: 0x64748b, colorDark: 0x334155, role: 'boss',
    players: [
      { name: 'Raikou', sprite: 243, stats: s(90,85,100,75,90,110) },
      { name: 'Entei', sprite: 244, stats: s(110,110,85,85,75,95) },
      { name: 'Suicune', sprite: 245, stats: s(100,75,85,110,110,80) },
      { name: 'Umbreon', sprite: 197, goalie: true, stats: s(100,65,60,110,120,55) },
    ],
  },
];
