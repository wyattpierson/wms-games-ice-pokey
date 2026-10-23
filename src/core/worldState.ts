import { STARTER_EVOLUTIONS, ZONES, type ZoneDefinition } from '../config/progression';
import { WORLD_EVENTS, applyZoneOverride, clonePlayerOverride, type WorldConditionState } from '../config/worldEvents';
import type { Team } from '../config/teams';
import { getMeta, type MetaState } from '../state/metaStore';

export interface WorldStateSnapshot extends WorldConditionState {
  activeEventIds: string[];
}

/** Build the save-derived world state without mutating persistent save data. */
export function buildWorldState(meta: MetaState): WorldStateSnapshot {
  const starterStages = meta.starter ? STARTER_EVOLUTIONS[meta.starter] : undefined;
  const xp = meta.starter ? (meta.starterXp[meta.starter] || 0) : 0;
  const stageIndex = starterStages ? Math.max(0, starterStages.reduce((best, stage, index) => xp >= stage.at ? index : best, 0)) : 0;
  const starterStage = starterStages && meta.starter ? stageIndex : 0;
  const starterName = starterStages?.[starterStage]?.name || null;
  const zonesClearedEver = ZONES.filter(zone => (meta.zoneBossWins[zone.id] || 0) > 0).map(zone => zone.id);
  const base: WorldConditionState = {
    year: meta.seasonYear,
    towerFloor: meta.towerFloor || 0,
    bestTowerFloor: meta.bestTowerFloor || 0,
    previousYearTowerFloor: meta.previousYearTowerFloor || 0,
    yearStartingBestTowerFloor: meta.yearStartingBestTowerFloor || 0,
    starterStage,
    starterName,
    everEnteredZones: [...(meta.everEnteredZones || [])],
    zoneBossWins: { ...(meta.zoneBossWins || {}) },
    zonesClearedEver,
    allZonesClearedEver: ZONES.every(zone => (meta.zoneBossWins[zone.id] || 0) > 0),
    flags: [...(meta.flags || [])],
  };
  const activeEventIds = WORLD_EVENTS.filter(event => worldEventMatches(base, event.when)).map(event => event.id);
  return { ...base, activeEventIds };
}

export function getWorldState(meta: MetaState = getMeta()): WorldStateSnapshot {
  return buildWorldState(meta);
}

/** Evaluate the declarative conditions used by world events. */
export function worldEventMatches(state: WorldConditionState, condition: import('../config/worldEvents').WorldEventCondition): boolean {
  if (condition.minYear !== undefined && state.year < condition.minYear) return false;
  if (condition.maxYear !== undefined && state.year > condition.maxYear) return false;
  if (condition.minTowerFloor !== undefined && state.towerFloor < condition.minTowerFloor) return false;
  if (condition.minBestTowerFloor !== undefined && state.bestTowerFloor < condition.minBestTowerFloor) return false;
  if (condition.minPreviousYearTowerFloor !== undefined && state.previousYearTowerFloor < condition.minPreviousYearTowerFloor) return false;
  if (condition.minYearStartingBestTowerFloor !== undefined && state.yearStartingBestTowerFloor < condition.minYearStartingBestTowerFloor) return false;
  if (condition.minStarterStage !== undefined && state.starterStage < condition.minStarterStage) return false;
  if (condition.requireAllZonesCleared && !state.allZonesClearedEver) return false;
  if (condition.requireZonesCleared?.some(id => !state.zonesClearedEver.includes(id))) return false;
  if (condition.requireZonesEntered?.some(id => !state.everEnteredZones.includes(id))) return false;
  if (condition.requireFlags?.some(flag => !state.flags.includes(flag))) return false;
  if (condition.forbidFlags?.some(flag => state.flags.includes(flag))) return false;
  if (condition.minBossWins && Object.entries(condition.minBossWins).some(([zoneId, count]) => (state.zoneBossWins[zoneId] || 0) < count)) return false;
  return true;
}

/** Return a world-aware copy of a team, keeping its stable ID for save compatibility. */
export function resolveWorldTeam(baseTeam: Team, meta: MetaState = getMeta()): Team {
  const state = getWorldState(meta);
  let team: Team = { ...baseTeam, players: baseTeam.players.map(player => ({ ...player, stats: { ...player.stats } })) as Team['players'] };
  for (const event of WORLD_EVENTS) {
    if (!state.activeEventIds.includes(event.id)) continue;
    for (const override of event.teamOverrides || []) {
      if (override.teamId !== team.id) continue;
      team = {
        ...team,
        ...(override.name ? { name: override.name } : {}),
        ...(override.color !== undefined ? { color: override.color } : {}),
        ...(override.colorDark !== undefined ? { colorDark: override.colorDark } : {}),
        ...(override.players ? { players: override.players.map(clonePlayerOverride) as Team['players'] } : {}),
      };
    }
  }
  return team;
}

/** Resolve display/progression data too, so future events can rename or retune a zone without scene rewrites. */
export function resolveWorldZone(zoneId: string, meta: MetaState = getMeta()): ZoneDefinition | undefined {
  const baseZone = ZONES.find(zone => zone.id === zoneId);
  if (!baseZone) return undefined;
  const state = getWorldState(meta);
  let zone = { ...baseZone, opponents: [...baseZone.opponents] };
  for (const event of WORLD_EVENTS) {
    if (!state.activeEventIds.includes(event.id)) continue;
    for (const override of event.zoneOverrides || []) {
      if (override.zoneId === zone.id) zone = applyZoneOverride(zone, override);
    }
  }
  return zone;
}

/** Story helper: one-time persistent story flag for each named world event. */
export function worldEventSeenFlag(eventId: string): string {
  return `world-event-seen-${eventId}`;
}
