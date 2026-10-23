import type { BaseStats } from '../core/stats';

/** Edit these rows to change starter evolution names, sprites, XP thresholds, and base stats. */
export const STARTER_EVOLUTIONS: Record<'larvitar'|'gible'|'bagon', { name: string; sprite: number; at: number; stats: BaseStats }[]> = {
  larvitar: [{name:'Larvitar',sprite:246,at:0,stats:{hp:50,attack:64,specialAttack:45,defense:50,specialDefense:50,speed:41}},{name:'Pupitar',sprite:247,at:40,stats:{hp:70,attack:84,specialAttack:65,defense:70,specialDefense:70,speed:51}},{name:'Tyranitar',sprite:248,at:100,stats:{hp:100,attack:134,specialAttack:95,defense:110,specialDefense:100,speed:61}}],
  gible: [{name:'Gible',sprite:443,at:0,stats:{hp:58,attack:70,specialAttack:40,defense:45,specialDefense:45,speed:42}},{name:'Gabite',sprite:444,at:40,stats:{hp:68,attack:90,specialAttack:50,defense:65,specialDefense:55,speed:82}},{name:'Garchomp',sprite:445,at:100,stats:{hp:108,attack:130,specialAttack:80,defense:95,specialDefense:85,speed:102}}],
  bagon: [{name:'Bagon',sprite:371,at:0,stats:{hp:45,attack:75,specialAttack:40,defense:60,specialDefense:30,speed:50}},{name:'Shelgon',sprite:372,at:40,stats:{hp:65,attack:95,specialAttack:60,defense:100,specialDefense:50,speed:50}},{name:'Salamence',sprite:373,at:100,stats:{hp:95,attack:135,specialAttack:110,defense:80,specialDefense:80,speed:100}}]
};
/** Data-first campaign progression. Add zones, tower stages, dialogue beats and shop offers here. */
export const YEAR_LENGTH_DAYS = 365;
/** Tune these costs to control how many activities fit before tournament day. */
export const TIME_COSTS = { islandVisit: 60, match: 20, bossMatch: 100, towerFloor: 0 } as const;

export interface ZoneDefinition { id: string; name: string; theme: string; description: string; difficulty: number; opponents: string[]; bossId: string; resourceName: string; resourceUnitName: string; resourceDescription: string }
export const ZONES: ZoneDefinition[] = [
  { id: 'coastal', name: 'COASTAL CIRCUIT', theme: 'Wind, salt, and speed', description: 'An approachable opener with fast skaters, scrappy bruisers, and the Legendary Birds waiting at the end.', difficulty: 0.05, opponents: ['knuckle-club-coastal','grave-diggers-coastal','sparkle-squad-coastal'], bossId: 'sky-raiders-coastal', resourceName: 'Tideglass', resourceUnitName: 'Tideglass', resourceDescription: 'Polished fragments charged by the island tides.' },
  { id: 'haunted', name: 'HAUNTED RINKS', theme: 'Cold lights. Colder ghosts.', description: 'Ghosts and dark types trade speed for tricks, special attack, and sturdy defenses.', difficulty: 0.30, opponents: ['knuckle-club-haunted','grave-diggers-haunted','sparkle-squad-haunted'], bossId: 'sky-raiders-haunted', resourceName: 'Echo Shards', resourceUnitName: 'Echo Shard', resourceDescription: 'Crystallized echoes found beneath the haunted rinks.' },
  { id: 'summit', name: 'SUMMIT LEAGUE', theme: 'Thin air, elite teams', description: 'High-altitude specialists hit harder and defend better; the ancient Titans rule the summit.', difficulty: 0.56, opponents: ['knuckle-club-summit','grave-diggers-summit','sparkle-squad-summit'], bossId: 'sky-raiders-summit', resourceName: 'Summit Crests', resourceUnitName: 'Summit Crest', resourceDescription: 'Rare crests awarded by the high-altitude circuits.' },
  { id: 'abyss', name: 'THE ABYSS', theme: 'The end of the line', description: 'Late-game favorites, elite speedsters, and legendary forces push every stat to its limit.', difficulty: 0.76, opponents: ['knuckle-club-abyss','grave-diggers-abyss','sparkle-squad-abyss'], bossId: 'sky-raiders-abyss', resourceName: 'Abyss Cores', resourceUnitName: 'Abyss Core', resourceDescription: 'Dense cores recovered from the deepest waters.' },
];
/**
 * Each island's difficulty is the starting AI level for that realm. Wins inside
 * a realm add a small local ramp; wins elsewhere in the year do not silently
 * turn an easy island boss into a max-difficulty opponent.
 */
export function zoneThreatLevel(zoneDifficulty: number, completedRegularWins: number, isBoss: boolean): number {
  return Math.max(0, Math.min(1, zoneDifficulty + Math.max(0, completedRegularWins) * 0.045 + (isBoss ? 0.10 : 0)));
}

/**
 * The tower is a deliberately sharp difficulty cliff. A tuned, high-stat team
 * and elite AI should normally defeat a strong first-year roster on floor one.
 */
const towerOpponents = ['tower-warden', 'tower-phalanx', 'tower-aces'];
const towerDifficulty = [0.97, 0.98, 0.985, 0.99, 0.992, 0.994, 0.996, 0.997, 0.998, 0.999, 1, 1];
export const TOWER_STAGES = Array.from({ length: 12 }, (_, i) => ({
  id: `tower-${i+1}`,
  name: `FLOOR ${String(i+1).padStart(2,'0')}`,
  difficulty: towerDifficulty[i],
  opponentId: towerOpponents[i % towerOpponents.length],
}));
export interface ShopOffer {
  id: string;
  name: string;
  kind: 'item'|'ability';
  cost: number;
  description: string;
  unlock?: string;
  requiresResource?: { zoneId: string; amount: number };
  /** Keep this offer mysterious until the selected starter reaches its final evolution. */
  requiresStarterFinalEvolution?: boolean;
}

/** Stable save-file IDs for the permanent Item Shop unlocks. */
export const ITEM_IDS = {
  evolvePikachu: 'evolve-pikachu',
  evolvePsyduck: 'evolve-psyduck',
  secondChance: 'second-chance-charm',
  megaEvolution: 'mega-band',
  superParry: 'super-parry',
  superJuke: 'super-juke',
  superShot: 'super-shot',
} as const;

export const SHOP_OFFERS: ShopOffer[] = [
  { id: ITEM_IDS.evolvePikachu, name: 'THUNDER STONE', kind: 'item', cost: 12, unlock: ITEM_IDS.evolvePikachu, requiresResource: { zoneId: 'coastal', amount: 1 },
    description: 'Permanently evolves your starting Pikachu into Raichu in this save and every future run.' },
  { id: ITEM_IDS.evolvePsyduck, name: 'GOLDUCK TRAINING KIT', kind: 'item', cost: 12, unlock: ITEM_IDS.evolvePsyduck, requiresResource: { zoneId: 'haunted', amount: 1 },
    description: 'Permanently evolves your starting Psyduck into Golduck in this save and every future run.' },
  { id: ITEM_IDS.secondChance, name: 'SECOND CHANCE CHARM', kind: 'item', cost: 20, unlock: ITEM_IDS.secondChance,
    description: 'Once per run, retry a match after a loss. The rematch is your one use for that run.' },
  { id: ITEM_IDS.megaEvolution, name: 'MEGA BAND', kind: 'item', cost: 26, unlock: ITEM_IDS.megaEvolution, requiresStarterFinalEvolution: true, requiresResource: { zoneId: 'abyss', amount: 1 },
    description: 'In a match, press M to Mega Evolve your fully evolved starter. Its Mega form and stats last until the next goal.' },
  { id: ITEM_IDS.superParry, name: 'SUPER PARRY MANUAL', kind: 'item', cost: 16, unlock: ITEM_IDS.superParry,
    description: 'A successful parry still steals the puck, and now knocks the attacker out for 5 seconds.' },
  { id: ITEM_IDS.superJuke, name: 'AFTERIMAGE CLEATS', kind: 'item', cost: 16, unlock: ITEM_IDS.superJuke,
    description: 'A close defender who fails to stop your juke gets knocked behind you and left staggered.' },
  { id: ITEM_IDS.superShot, name: 'SNIPER’S SIGHT', kind: 'item', cost: 16, unlock: ITEM_IDS.superShot, requiresResource: { zoneId: 'summit', amount: 1 },
    description: 'A shorter SUPER SHOT window appears inside the goalie’s regular shot flash for a much stronger shot.' },
];
