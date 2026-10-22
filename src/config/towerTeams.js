/**
 * Tower-only rosters. These are intentionally tuned above the island ladder:
 * the player's first tournament visit is a lesson in coming back stronger,
 * not a final match they should be expected to win on their first year.
 */
const s = (hp, attack, specialAttack, defense, specialDefense, speed) => ({ hp, attack, specialAttack, defense, specialDefense, speed });
export const TOWER_TEAMS = [
    {
        id: 'tower-warden', name: "The Warden's Four", color: 0x7f1d1d, colorDark: 0x450a0a, role: 'tower',
        players: [
            { name: 'Flutter Mane', sprite: 987, stats: s(100, 95, 120, 80, 120, 120) },
            { name: 'Iron Hands', sprite: 992, stats: s(160, 120, 105, 120, 80, 60) },
            { name: 'Chien-Pao', sprite: 1002, stats: s(100, 120, 120, 95, 85, 120) },
            { name: 'Ting-Lu', sprite: 1003, goalie: true, stats: s(170, 120, 70, 120, 100, 50) },
        ],
    },
    {
        id: 'tower-phalanx', name: 'Iron Phalanx', color: 0x64748b, colorDark: 0x334155, role: 'tower',
        players: [
            { name: 'Archaludon', sprite: 1018, stats: s(90, 110, 120, 120, 90, 90) },
            { name: 'Gholdengo', sprite: 1000, stats: s(100, 80, 120, 110, 105, 90) },
            { name: 'Iron Crown', sprite: 1023, stats: s(90, 95, 120, 110, 120, 90) },
            // Blissey is tuned as a defensive CPU wall rather than a fast skater.
            { name: 'Blissey', sprite: 242, goalie: true, stats: s(200, 60, 100, 110, 120, 55) },
        ],
    },
    {
        id: 'tower-aces', name: 'The Crown Aces', color: 0xdc2626, colorDark: 0x7f1d1d, role: 'tower',
        players: [
            { name: 'Spectrier', sprite: 897, stats: s(110, 80, 120, 90, 100, 120) },
            { name: 'Glastrier', sprite: 896, stats: s(110, 120, 70, 120, 120, 35) },
            { name: 'Urshifu', sprite: 892, stats: s(100, 120, 75, 105, 90, 115) },
            { name: 'Zamazenta', sprite: 889, goalie: true, stats: s(130, 120, 85, 120, 120, 120) },
        ],
    },
];
