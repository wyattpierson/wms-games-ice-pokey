/** Edit these rows to change starter evolution names, sprites, XP thresholds, and base stats. */
export const STARTER_EVOLUTIONS = {
    larvitar: [{ name: 'Larvitar', sprite: 246, at: 0, stats: { hp: 50, attack: 64, specialAttack: 45, defense: 50, specialDefense: 50, speed: 41 } }, { name: 'Pupitar', sprite: 247, at: 40, stats: { hp: 70, attack: 84, specialAttack: 65, defense: 70, specialDefense: 70, speed: 51 } }, { name: 'Tyranitar', sprite: 248, at: 100, stats: { hp: 100, attack: 134, specialAttack: 95, defense: 110, specialDefense: 100, speed: 61 } }],
    gible: [{ name: 'Gible', sprite: 443, at: 0, stats: { hp: 58, attack: 70, specialAttack: 40, defense: 45, specialDefense: 45, speed: 42 } }, { name: 'Gabite', sprite: 444, at: 40, stats: { hp: 68, attack: 90, specialAttack: 50, defense: 65, specialDefense: 55, speed: 82 } }, { name: 'Garchomp', sprite: 445, at: 100, stats: { hp: 108, attack: 130, specialAttack: 80, defense: 95, specialDefense: 85, speed: 102 } }],
    bagon: [{ name: 'Bagon', sprite: 371, at: 0, stats: { hp: 45, attack: 75, specialAttack: 40, defense: 60, specialDefense: 30, speed: 50 } }, { name: 'Shelgon', sprite: 372, at: 40, stats: { hp: 65, attack: 95, specialAttack: 60, defense: 100, specialDefense: 50, speed: 50 } }, { name: 'Salamence', sprite: 373, at: 100, stats: { hp: 95, attack: 135, specialAttack: 110, defense: 80, specialDefense: 80, speed: 100 } }]
};
/** Data-first campaign progression. Add zones, tower stages, dialogue beats and shop offers here. */
export const YEAR_LENGTH_DAYS = 365;
/** Tune these costs to control how many activities fit before tournament day. */
export const TIME_COSTS = { islandVisit: 60, match: 20, towerFloor: 0 };
export const ZONES = [
    { id: 'coastal', name: 'COASTAL CIRCUIT', theme: 'Wind, salt, and speed', description: 'An approachable opener with fast skaters, scrappy bruisers, and the Legendary Birds waiting at the end.', difficulty: 0.05, opponents: ['knuckle-club-coastal', 'grave-diggers-coastal', 'sparkle-squad-coastal'], bossId: 'sky-raiders-coastal', resourceName: 'Tideglass', resourceDescription: 'Polished fragments charged by the island tides.' },
    { id: 'haunted', name: 'HAUNTED RINKS', theme: 'Cold lights. Colder ghosts.', description: 'Ghosts and dark types trade speed for tricks, special attack, and sturdy defenses.', difficulty: 0.30, opponents: ['knuckle-club-haunted', 'grave-diggers-haunted', 'sparkle-squad-haunted'], bossId: 'sky-raiders-haunted', resourceName: 'Echo Shards', resourceDescription: 'Crystallized echoes found beneath the haunted rinks.' },
    { id: 'summit', name: 'SUMMIT LEAGUE', theme: 'Thin air, elite teams', description: 'High-altitude specialists hit harder and defend better; the ancient Titans rule the summit.', difficulty: 0.56, opponents: ['knuckle-club-summit', 'grave-diggers-summit', 'sparkle-squad-summit'], bossId: 'sky-raiders-summit', resourceName: 'Summit Crests', resourceDescription: 'Rare crests awarded by the high-altitude circuits.' },
    { id: 'abyss', name: 'THE ABYSS', theme: 'The end of the line', description: 'Late-game favorites, elite speedsters, and legendary forces push every stat to its limit.', difficulty: 0.76, opponents: ['knuckle-club-abyss', 'grave-diggers-abyss', 'sparkle-squad-abyss'], bossId: 'sky-raiders-abyss', resourceName: 'Abyss Cores', resourceDescription: 'Dense cores recovered from the deepest waters.' },
];
/**
 * Each island's difficulty is the starting AI level for that realm. Wins inside
 * a realm add a small local ramp; wins elsewhere in the year do not silently
 * turn an easy island boss into a max-difficulty opponent.
 */
export function zoneThreatLevel(zoneDifficulty, completedRegularWins, isBoss) {
    return Math.max(0, Math.min(1, zoneDifficulty + Math.max(0, completedRegularWins) * 0.045 + (isBoss ? 0.10 : 0)));
}
/**
 * The tower is a deliberately sharp difficulty cliff. A tuned, high-stat team
 * and elite AI should normally defeat a strong first-year roster on floor one.
 */
const towerOpponents = ['tower-warden', 'tower-phalanx', 'tower-aces'];
const towerDifficulty = [0.97, 0.98, 0.985, 0.99, 0.992, 0.994, 0.996, 0.997, 0.998, 0.999, 1, 1];
export const TOWER_STAGES = Array.from({ length: 12 }, (_, i) => ({
    id: `tower-${i + 1}`,
    name: `FLOOR ${String(i + 1).padStart(2, '0')}`,
    difficulty: towerDifficulty[i],
    opponentId: towerOpponents[i % towerOpponents.length],
}));
export const SHOP_OFFERS = [
    { id: 'power-shot', name: 'POWER SHOT', kind: 'ability', cost: 12, description: 'A permanent unlock slot for a future shot modifier.', unlock: 'power-shot' },
    { id: 'tape', name: 'STICK TAPE', kind: 'item', cost: 5, description: 'Prototype item; effect hook reserved for later.' },
    { id: 'tideglass-charm', name: 'TIDEGLASS CHARM', kind: 'item', cost: 8, description: 'Prototype island-gated offer; its gameplay effect is a placeholder.', requiresResource: { zoneId: 'coastal', amount: 1 } },
    { id: 'echo-lining', name: 'ECHO LINING', kind: 'item', cost: 8, description: 'Prototype island-gated offer; its gameplay effect is a placeholder.', requiresResource: { zoneId: 'haunted', amount: 1 } },
    { id: 'summit-lace', name: 'SUMMIT LACE', kind: 'item', cost: 8, description: 'Prototype island-gated offer; its gameplay effect is a placeholder.', requiresResource: { zoneId: 'summit', amount: 1 } },
    { id: 'abyss-core', name: 'ABYSS CORE', kind: 'item', cost: 8, description: 'Prototype island-gated offer; its gameplay effect is a placeholder.', requiresResource: { zoneId: 'abyss', amount: 1 } },
];
