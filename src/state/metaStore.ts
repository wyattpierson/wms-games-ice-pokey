import { YEAR_LENGTH_DAYS } from '../config/progression';
/** Persistent, cross-run progression. Deliberately separate from the disposable run save. */
const KEY = 'ice-pokey:meta:v1';
export type StarterId = 'larvitar'|'gible'|'bagon';
export interface MetaState {
  starter: StarterId|null; starterXp: Record<StarterId, number>; currency: number;
  unlocked: string[]; flags: string[]; totalRuns: number; totalMatches: number; starterBonusHp: number;
  towerFloor: number; selectedZoneId: string;
  daysRemaining: number; seasonYear: number; yearStarted: boolean;
  /** The realm visit is a commitment: cannot travel elsewhere until its boss is beaten. */
  activeIslandId: string | null;
  /** Permanent crafting/shop resources, awarded for island boss victories. */
  islandResources: Record<string, number>;
  /** Zones visited at least once in this save. */
  everEnteredZones: string[];
  /** Boss victories across all years, keyed by zone ID. */
  zoneBossWins: Record<string, number>;
  /** Best Battle Tower progress in any year, measured as floors cleared. */
  bestTowerFloor: number;
  /** Previous season's final tower progress, used for opening-story callbacks. */
  previousYearTowerFloor: number;
  /** Best tower record when the current season began, used by year-end reflection. */
  yearStartingBestTowerFloor: number;
}
const fresh = (): MetaState => ({ starter: null, starterXp: { larvitar: 0, gible: 0, bagon: 0 }, currency: 0, unlocked: [], flags: [], totalRuns: 0, totalMatches: 0, towerFloor: 0, selectedZoneId: 'coastal', starterBonusHp: 0, daysRemaining: YEAR_LENGTH_DAYS, seasonYear: 1, yearStarted: false, activeIslandId: null, islandResources: { coastal: 0, haunted: 0, summit: 0, abyss: 0 }, everEnteredZones: [], zoneBossWins: { coastal: 0, haunted: 0, summit: 0, abyss: 0 }, bestTowerFloor: 0, previousYearTowerFloor: 0, yearStartingBestTowerFloor: 0 });
function load(): MetaState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.starterXp && Array.isArray(v.unlocked) && Array.isArray(v.flags)) {
      const defaults = fresh();
      const flags = v.flags as string[];
      // Migrate old per-year story flags into save-wide history where the old save
      // contained enough information to infer the milestone safely.
      const zoneIds = Object.keys(defaults.zoneBossWins);
      const inferredEntered = new Set<string>(Array.isArray(v.everEnteredZones) ? v.everEnteredZones : []);
      const inferredBossWins: Record<string, number> = { ...defaults.zoneBossWins };
      for (const flag of flags) {
        const entered = /^story-year-\d+-island-(coastal|haunted|summit|abyss)$/.exec(flag);
        if (entered) inferredEntered.add(entered[1]);
        const beaten = /^story-year-(\d+)-boss-(coastal|haunted|summit|abyss)$/.exec(flag);
        if (beaten) inferredBossWins[beaten[2]] = (inferredBossWins[beaten[2]] || 0) + 1;
      }
      const savedBossWins = v.zoneBossWins || {};
      const zoneBossWins = Object.fromEntries(zoneIds.map(id => [id, Math.max(Number(savedBossWins[id] || 0), inferredBossWins[id] || 0)]));
      return {
        ...defaults, ...v,
        flags: [...flags],
        islandResources: { ...defaults.islandResources, ...(v.islandResources || {}) },
        everEnteredZones: [...inferredEntered],
        zoneBossWins,
        bestTowerFloor: Math.max(Number(v.bestTowerFloor || 0), Number(v.towerFloor || 0)),
        previousYearTowerFloor: Number(v.previousYearTowerFloor || 0),
        yearStartingBestTowerFloor: Number(v.yearStartingBestTowerFloor ?? Math.max(Number(v.bestTowerFloor || 0), Number(v.towerFloor || 0))),
      };
    }
  } catch {}
  return fresh();
}
let meta = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch {} }
export const getMeta = (): MetaState => ({ ...meta, starterXp: { ...meta.starterXp }, unlocked: [...meta.unlocked], flags: [...meta.flags], islandResources: { ...meta.islandResources }, everEnteredZones: [...meta.everEnteredZones], zoneBossWins: { ...meta.zoneBossWins } });
export function updateMeta(patch: Partial<MetaState>): MetaState { meta = { ...meta, ...patch }; save(); return getMeta(); }
export function chooseStarter(starter: StarterId): MetaState { if (meta.starter) return getMeta(); meta = { ...meta, starter, totalRuns: meta.totalRuns + 1 }; save(); return getMeta(); }
export function awardMatch(won: boolean, boss = false, starterOnBench = false): void { meta.totalMatches++; if (meta.starter) { meta.starterXp[meta.starter] += boss ? 20 : 10; meta.starterBonusHp += boss ? (starterOnBench ? 2 : 4) : (starterOnBench ? 1 : 2); } if (won) meta.currency += boss ? 10 : 3; save(); }
export function awardOpponentResource(): void { meta.currency += 3; save(); }
export function buyUnlock(id: string, cost: number): boolean { if (meta.unlocked.includes(id)) return false; if (meta.currency < cost) return false; meta.currency -= cost; meta.unlocked.push(id); save(); return true; }
export function setStoryFlag(flag: string): void { if (!meta.flags.includes(flag)) { meta.flags.push(flag); save(); } }
export function addRun(): void { meta.totalRuns++; save(); }

/** Begin a new roguelike run/year. The tournament countdown is run-scoped, while its current value is saved persistently. */
export function beginNewYear(): void {
  const previousYearTowerFloor = meta.yearStarted ? meta.towerFloor : 0;
  const yearStartingBestTowerFloor = Math.max(meta.bestTowerFloor || 0, meta.towerFloor || 0);
  meta = { ...meta, seasonYear: meta.yearStarted ? meta.seasonYear + 1 : Math.max(1, meta.seasonYear), yearStarted: true, daysRemaining: YEAR_LENGTH_DAYS, towerFloor: 0, activeIslandId: null, previousYearTowerFloor, yearStartingBestTowerFloor };
  save();
}

/** Mark a zone as ever entered. Returns true only on the first visit in this save. */
export function markZoneEntered(zoneId: string): boolean {
  if (!zoneId || meta.everEnteredZones.includes(zoneId)) return false;
  meta.everEnteredZones = [...meta.everEnteredZones, zoneId];
  save();
  return true;
}

/** Persist a boss victory across years. Call only once per newly recorded boss win. */
export function recordZoneBossWin(zoneId: string): number {
  if (!zoneId) return 0;
  meta.zoneBossWins = { ...meta.zoneBossWins, [zoneId]: (meta.zoneBossWins[zoneId] || 0) + 1 };
  save();
  return meta.zoneBossWins[zoneId];
}

/** Claim an island resource at most once for a given year. Resource + flag save atomically. */
export function claimIslandResource(zoneId: string, year = meta.seasonYear): boolean {
  if (!zoneId) return false;
  const claimFlag = `reward-year-${year}-island-resource-${zoneId}`;
  if (meta.flags.includes(claimFlag)) return false;
  meta.islandResources = { ...meta.islandResources, [zoneId]: (meta.islandResources[zoneId] || 0) + 1 };
  meta.flags = [...meta.flags, claimFlag];
  save();
  return true;
}

/** Award one permanent island-specific resource after defeating that island's boss. */
export function awardIslandResource(zoneId: string, amount = 1): void {
  if (!zoneId || amount <= 0) return;
  meta.islandResources = { ...meta.islandResources, [zoneId]: (meta.islandResources[zoneId] || 0) + Math.floor(amount) };
  save();
}

/** Purchase a permanent unlock using credits and, optionally, island resources. */
export function buyShopOffer(id: string, creditCost: number, resource?: { zoneId: string; amount: number }): boolean {
  if (meta.unlocked.includes(id) || meta.currency < creditCost) return false;
  if (resource && (meta.islandResources[resource.zoneId] || 0) < resource.amount) return false;
  meta.currency -= creditCost;
  if (resource) meta.islandResources = { ...meta.islandResources, [resource.zoneId]: (meta.islandResources[resource.zoneId] || 0) - resource.amount };
  meta.unlocked = [...meta.unlocked, id];
  save();
  return true;
}

/** Advance the calendar; the countdown never goes below zero. Returns remaining days. */
export function spendDays(days: number): number {
  const cost = Math.max(0, Math.floor(days));
  meta = { ...meta, daysRemaining: Math.max(0, meta.daysRemaining - cost) };
  save();
  return meta.daysRemaining;
}

export function isTournamentDue(): boolean { return meta.daysRemaining <= 0; }

/** Reset every persistent meta-progression field to a fresh save. */
export function resetMetaState(): void {
  meta = fresh();
  save();
}
