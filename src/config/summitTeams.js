/** Summit League — roster OVR rises into the mid/high 90s; not meant for an unupgraded lineup. */
const s = (hp, attack, specialAttack, defense, specialDefense, speed) => ({ hp, attack, specialAttack, defense, specialDefense, speed });
export const TEAMS_SUMMIT = [
    {
        id: 'knuckle-club-summit', name: 'High Altitude Flyers', color: 0x38bdf8, colorDark: 0x0369a1, role: 'regular',
        players: [
            { name: 'Noivern', sprite: 715, stats: s(85, 95, 115, 85, 90, 120) },
            { name: 'Corviknight', sprite: 823, stats: s(100, 90, 70, 120, 105, 75) },
            { name: 'Hawlucha', sprite: 701, stats: s(85, 110, 80, 85, 75, 120) },
            { name: 'Altaria', sprite: 334, goalie: true, stats: s(90, 75, 80, 115, 120, 80) },
        ],
    },
    {
        id: 'grave-diggers-summit', name: 'Stone Cold', color: 0x78716c, colorDark: 0x44403c, role: 'regular',
        players: [
            { name: 'Cetitan', sprite: 975, stats: s(110, 120, 65, 95, 80, 90) },
            { name: 'Glimmora', sprite: 970, stats: s(90, 65, 120, 100, 90, 90) },
            { name: 'Garganacl', sprite: 934, stats: s(130, 100, 70, 120, 120, 50) },
            { name: 'Avalugg', sprite: 713, goalie: true, stats: s(140, 115, 70, 120, 100, 40) },
        ],
    },
    {
        id: 'sparkle-squad-summit', name: 'The Steel Dojo', color: 0x94a3b8, colorDark: 0x475569, role: 'regular',
        players: [
            { name: 'Lucario', sprite: 448, stats: s(85, 120, 120, 80, 80, 95) },
            { name: 'Gallade', sprite: 475, stats: s(80, 120, 80, 85, 120, 90) },
            { name: 'Kommo-o', sprite: 784, stats: s(80, 115, 100, 120, 110, 85) },
            { name: 'Aggron', sprite: 306, goalie: true, stats: s(105, 115, 80, 120, 110, 50) },
        ],
    },
    {
        id: 'sky-raiders-summit', name: 'The Three Titans', color: 0x64748b, colorDark: 0x1e293b, role: 'boss',
        players: [
            { name: 'Regirock', sprite: 377, stats: s(110, 120, 60, 120, 110, 45) },
            { name: 'Registeel', sprite: 379, stats: s(110, 100, 100, 120, 120, 55) },
            { name: 'Regice', sprite: 378, stats: s(110, 65, 115, 115, 120, 55) },
            { name: 'Metagross', sprite: 376, goalie: true, stats: s(100, 120, 100, 120, 100, 75) },
        ],
    },
];
