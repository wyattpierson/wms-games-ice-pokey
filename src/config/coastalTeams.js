/**
 * Coastal Circuit — the friendly on-ramp. The average roster is in the mid-70s,
 * but each squad has a useful specialist. Pawmot is deliberately the first
 * truly exciting offensive pickup; defensive specialists have lower OVR but can
 * still feel threatening when the CPU uses them.
 */
const s = (hp, attack, specialAttack, defense, specialDefense, speed) => ({ hp, attack, specialAttack, defense, specialDefense, speed });
export const TEAMS_COASTAL = [
    {
        id: 'knuckle-club-coastal', name: 'Boardwalk Blitz', color: 0x0ea5e9, colorDark: 0x075985, role: 'regular',
        players: [
            { name: 'Pawmot', sprite: 923, stats: s(70, 115, 70, 70, 60, 105) },
            { name: 'Floatzel', sprite: 419, stats: s(75, 95, 70, 60, 55, 105) },
            { name: 'Kilowattrel', sprite: 941, stats: s(65, 65, 85, 55, 60, 110) },
            { name: 'Pelipper', sprite: 279, goalie: true, stats: s(70, 50, 80, 90, 70, 60) },
        ],
    },
    {
        id: 'grave-diggers-coastal', name: 'Shell Shockers', color: 0x14b8a6, colorDark: 0x0f766e, role: 'regular',
        players: [
            // Cloyster is the early CPU-defense lesson: hard to get past, but not fast.
            { name: 'Cloyster', sprite: 91, stats: s(50, 75, 65, 120, 50, 65) },
            { name: 'Dewgong', sprite: 87, stats: s(90, 65, 70, 75, 95, 65) },
            { name: 'Wugtrio', sprite: 961, stats: s(45, 85, 50, 45, 65, 115) },
            { name: 'Slowbro', sprite: 80, goalie: true, stats: s(95, 65, 85, 105, 90, 35) },
        ],
    },
    {
        id: 'sparkle-squad-coastal', name: 'Pocket-Sized Powerhouses', color: 0xf472b6, colorDark: 0xbe185d, role: 'regular',
        players: [
            { name: 'Scyther', sprite: 123, stats: s(70, 100, 50, 75, 80, 100) },
            { name: 'Heracross', sprite: 214, stats: s(80, 115, 40, 75, 90, 85) },
            { name: 'Ribombee', sprite: 743, stats: s(60, 50, 90, 60, 70, 120) },
            { name: 'Forretress', sprite: 205, goalie: true, stats: s(75, 80, 60, 120, 65, 40) },
        ],
    },
    {
        id: 'sky-raiders-coastal', name: 'The Legendary Flyers', color: 0xf59e0b, colorDark: 0xb45309, role: 'boss',
        players: [
            { name: 'Zapdos', sprite: 145, stats: s(80, 80, 90, 70, 75, 100) },
            { name: 'Moltres', sprite: 146, stats: s(85, 90, 90, 70, 75, 90) },
            { name: 'Articuno', sprite: 144, stats: s(80, 65, 85, 85, 90, 75) },
            { name: 'Lapras', sprite: 131, goalie: true, stats: s(100, 65, 75, 80, 90, 55) },
        ],
    },
];
