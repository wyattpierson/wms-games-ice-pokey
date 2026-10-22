const s = (hp, attack, specialAttack, defense, specialDefense, speed) => ({ hp, attack, specialAttack, defense, specialDefense, speed });
/**
 * The user's starting team — deliberately the weakest on paper: a scrappy
 * water/electric trio behind a soft goalie. Beating the league is what makes
 * the poaches matter.
 */
export const USER_TEAM = {
    id: 'hydro-voltz',
    name: 'Hydro Voltz',
    color: 0x3b82f6,
    colorDark: 0x1d4ed8,
    players: [
        { name: 'Psyduck', sprite: 54, stats: s(50, 52, 65, 48, 50, 55) },
        { name: 'Pikachu', sprite: 25, stats: s(35, 55, 50, 40, 50, 90) },
        { name: 'Pachirisu', sprite: 417, stats: s(60, 45, 45, 70, 90, 95) },
        { name: 'Clefairy', sprite: 35, goalie: true, stats: s(70, 45, 60, 48, 65, 35) },
    ],
};
export const OPPONENTS = [
    {
        id: 'knuckle-club',
        name: 'Knuckle Club',
        color: 0xef4444,
        colorDark: 0xb91c1c,
        players: [
            { name: 'Hitmontop', sprite: 237, stats: s(60, 100, 60, 95, 110, 70) },
            { name: 'Hitmonchan', sprite: 107, stats: s(50, 105, 35, 79, 110, 76) },
            { name: 'Grapploct', sprite: 853, stats: s(80, 118, 70, 90, 80, 42) },
            { name: 'Hariyama', sprite: 297, goalie: true, stats: s(144, 120, 40, 60, 60, 50) },
        ],
    },
    {
        id: 'grave-diggers',
        name: 'Grave Diggers',
        color: 0x22c55e,
        colorDark: 0x166534,
        players: [
            { name: 'Gengar', sprite: 94, stats: s(60, 65, 130, 60, 75, 110) },
            { name: 'Marowak (Alolan)', sprite: 10115, stats: s(60, 80, 50, 110, 80, 45) },
            { name: 'Trevenant', sprite: 709, stats: s(85, 110, 65, 76, 82, 56) },
            { name: 'Golurk', sprite: 623, goalie: true, stats: s(89, 124, 55, 80, 80, 55) },
        ],
    },
    {
        id: 'sparkle-squad',
        name: 'Sparkle Squad',
        color: 0xec4899,
        colorDark: 0xbe185d,
        players: [
            { name: 'Togekiss', sprite: 468, stats: s(85, 50, 120, 95, 115, 80) },
            { name: 'Gardevoir', sprite: 282, stats: s(68, 65, 125, 65, 115, 80) },
            { name: 'Electivire', sprite: 466, stats: s(80, 115, 100, 75, 80, 110) },
            { name: 'Comfey', sprite: 764, goalie: true, stats: s(51, 52, 82, 90, 110, 100) },
        ],
    },
];
/**
 * The champion: the gauntlet's finale. Always available (you can rush it), and
 * clearly the best team in the league — a flyer skyline on top of the highest
 * AI level. Beating it ends the run (victory); it grants no poach.
 */
export const CHAMPION_TEAM = {
    id: 'sky-raiders',
    name: 'Sky Raiders',
    color: 0xf59e0b,
    colorDark: 0xb45309,
    players: [
        { name: 'Zekrom', sprite: 644, stats: s(100, 120, 120, 120, 100, 90) },
        { name: 'Articuno (Galarian)', sprite: 10169, stats: s(90, 85, 125, 85, 100, 95) },
        { name: 'Rayquaza', sprite: 384, stats: s(105, 150, 150, 90, 90, 95) },
        { name: 'Aegislash', sprite: 681, goalie: true, stats: s(95, 90, 105, 120, 120, 65) },
    ],
};
/** Island rosters live in separate files so each island can be edited independently. */
import { TEAMS_COASTAL } from './coastalTeams';
import { TEAMS_HAUNTED } from './hauntedTeams';
import { TEAMS_SUMMIT } from './summitTeams';
import { TEAMS_ABYSS } from './abyssTeams';
import { TOWER_TEAMS } from './towerTeams';
export const ISLAND_TEAMS = {
    coastal: TEAMS_COASTAL,
    haunted: TEAMS_HAUNTED,
    summit: TEAMS_SUMMIT,
    abyss: TEAMS_ABYSS,
};
/** Legacy opponents remain for compatibility; the year-end tower uses dedicated tuned teams. */
export const CAMPAIGN_TEAMS = [...OPPONENTS, CHAMPION_TEAM];
/** All known teams, including the independently editable island rosters. */
export const ALL_TEAMS = [...CAMPAIGN_TEAMS, ...TEAMS_COASTAL, ...TEAMS_HAUNTED, ...TEAMS_SUMMIT, ...TEAMS_ABYSS, ...TOWER_TEAMS];
