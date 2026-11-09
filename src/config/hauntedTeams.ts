import type { Team } from './teams';

/** Haunted Rinks — the third region: rare Ghost/Dark recruits and deceptive defenders. */
const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({hp,attack,specialAttack,defense,specialDefense,speed});
export const TEAMS_HAUNTED: Team[] = [
  {
    id: 'knuckle-club-haunted', name: 'Phantom Force', color: 0x8b5cf6, colorDark: 0x5b21b6, role: 'regular',
    players: [
      { name: 'Mimikyu', sprite: 778, stats: s(55, 90, 50, 80, 105, 96) },
      { name: 'Marshadow', sprite: 802, stats: s(90, 125, 90, 80, 90, 125) },
      { name: 'Annihilape', sprite: 979, stats: s(110, 115, 50, 80, 90, 90) },
      { name: 'Cofagrigus', sprite: 563, goalie: true, stats: s(58, 50, 95, 145, 105, 30) },
    ],
  },
  {
    id: 'grave-diggers-haunted', name: 'Dark Pulse', color: 0x6366f1, colorDark: 0x3730a3, role: 'regular',
    players: [
      { name: 'Zoroark', sprite: 571, stats: s(60, 105, 120, 60, 60, 105) },
      { name: 'Weavile', sprite: 461, stats: s(70, 120, 45, 65, 85, 125) },
      { name: 'Darkrai', sprite: 491, stats: s(70, 90, 135, 90, 90, 125) },
      // Dusknoir is a slow, excellent CPU defender; its OVR alone doesn't tell the story.
      { name: 'Dusknoir', sprite: 477, goalie: true, stats: s(45, 100, 65, 135, 135, 45) },
    ],
  },
  {
    id: 'sparkle-squad-haunted', name: 'Trick Room', color: 0xa855f7, colorDark: 0x6b21a8, role: 'regular',
    players: [
      { name: 'Chandelure', sprite: 609, stats: s(60, 55, 145, 90, 90, 80) },
      { name: 'Grimmsnarl', sprite: 861, stats: s(95, 120, 95, 65, 75, 60) },
      { name: 'Hoopa', sprite: 720, stats: s(80, 110, 150, 60, 130, 70) },
      { name: 'Spiritomb', sprite: 442, goalie: true, stats: s(50, 92, 92, 108, 108, 35) },
    ],
  },
  {
    id: 'sky-raiders-haunted', name: 'The Legendary Beasts', color: 0x64748b, colorDark: 0x334155, role: 'boss',
    players: [
      { name: 'Raikou', sprite: 243, stats: s(90, 85, 115, 75, 100, 115) },
      { name: 'Entei', sprite: 244, stats: s(115, 115, 90, 85, 75, 100) },
      { name: 'Suicune', sprite: 245, stats: s(100, 75, 90, 115, 115, 85) },
      { name: 'Umbreon', sprite: 197, goalie: true, stats: s(95, 65, 60, 110, 130, 65) },
    ],
  },
];
