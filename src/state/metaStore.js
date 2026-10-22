import { YEAR_LENGTH_DAYS } from '../config/progression';
/** Persistent, cross-run progression. Deliberately separate from the disposable run save. */
const KEY = 'ice-pokey:meta:v1';
const fresh = () => ({ starter: null, starterXp: { larvitar: 0, gible: 0, bagon: 0 }, currency: 0, unlocked: [], flags: [], totalRuns: 0, totalMatches: 0, towerFloor: 0, selectedZoneId: 'coastal', starterBonusHp: 0, daysRemaining: YEAR_LENGTH_DAYS, seasonYear: 1, yearStarted: false, islandResources: { coastal: 0, haunted: 0, summit: 0, abyss: 0 } });
function load() { try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.starterXp && Array.isArray(v.unlocked) && Array.isArray(v.flags))
        return { ...fresh(), ...v, islandResources: { ...fresh().islandResources, ...(v.islandResources || {}) } };
}
catch { } return fresh(); }
let meta = load();
function save() { try {
    localStorage.setItem(KEY, JSON.stringify(meta));
}
catch { } }
export const getMeta = () => ({ ...meta, starterXp: { ...meta.starterXp }, unlocked: [...meta.unlocked], flags: [...meta.flags], islandResources: { ...meta.islandResources } });
export function updateMeta(patch) { meta = { ...meta, ...patch }; save(); return getMeta(); }
export function chooseStarter(starter) { if (meta.starter)
    return getMeta(); meta = { ...meta, starter, totalRuns: meta.totalRuns + 1 }; save(); return getMeta(); }
export function awardMatch(won, boss = false, starterOnBench = false) { meta.totalMatches++; if (meta.starter) {
    meta.starterXp[meta.starter] += boss ? 20 : 10;
    meta.starterBonusHp += boss ? (starterOnBench ? 2 : 4) : (starterOnBench ? 1 : 2);
} if (won)
    meta.currency += boss ? 10 : 3; save(); }
export function awardOpponentResource() { meta.currency += 3; save(); }
export function buyUnlock(id, cost) { if (meta.unlocked.includes(id))
    return false; if (meta.currency < cost)
    return false; meta.currency -= cost; meta.unlocked.push(id); save(); return true; }
export function setStoryFlag(flag) { if (!meta.flags.includes(flag)) {
    meta.flags.push(flag);
    save();
} }
export function addRun() { meta.totalRuns++; save(); }
/** Begin a new roguelike run/year. The tournament countdown is run-scoped, while its current value is saved persistently. */
export function beginNewYear() {
    meta = { ...meta, seasonYear: meta.yearStarted ? meta.seasonYear + 1 : Math.max(1, meta.seasonYear), yearStarted: true, daysRemaining: YEAR_LENGTH_DAYS, towerFloor: 0 };
    save();
}
/** Award one permanent island-specific resource after defeating that island's boss. */
export function awardIslandResource(zoneId, amount = 1) {
    if (!zoneId || amount <= 0)
        return;
    meta.islandResources = { ...meta.islandResources, [zoneId]: (meta.islandResources[zoneId] || 0) + Math.floor(amount) };
    save();
}
/** Purchase a permanent unlock using credits and, optionally, island resources. */
export function buyShopOffer(id, creditCost, resource) {
    if (meta.unlocked.includes(id) || meta.currency < creditCost)
        return false;
    if (resource && (meta.islandResources[resource.zoneId] || 0) < resource.amount)
        return false;
    meta.currency -= creditCost;
    if (resource)
        meta.islandResources = { ...meta.islandResources, [resource.zoneId]: (meta.islandResources[resource.zoneId] || 0) - resource.amount };
    meta.unlocked = [...meta.unlocked, id];
    save();
    return true;
}
/** Advance the calendar; the countdown never goes below zero. Returns remaining days. */
export function spendDays(days) {
    const cost = Math.max(0, Math.floor(days));
    meta = { ...meta, daysRemaining: Math.max(0, meta.daysRemaining - cost) };
    save();
    return meta.daysRemaining;
}
export function isTournamentDue() { return meta.daysRemaining <= 0; }
/** Reset every persistent meta-progression field to a fresh save. */
export function resetMetaState() {
    meta = fresh();
    save();
}
