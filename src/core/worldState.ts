import { RIVAL_STARTER, STORY_CHARACTERS, STORY_RULES } from '../config/storyCampaign';
import { coastalMissing, summitCursed } from './storyCampaign';
import { TOWER_TEAMS } from '../config/towerTeams';
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
    catastrophe: meta.story.catastrophe,
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
  if (condition.requireCatastrophe && !state.catastrophe) return false;
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
  if (team.id === 'story-rival') {
    const starter = STARTER_EVOLUTIONS[RIVAL_STARTER[meta.starter || 'larvitar']][2];
    const upgraded = meta.bracket?.rivalUpgraded ?? meta.story.rivalBeaten;
    if (upgraded) team.players = TOWER_TEAMS.find(t => t.id === 'tower-warden')!.players.map(p => ({ ...p, stats: { ...p.stats } })) as Team['players'];
    team.players[0] = { name: starter.name, sprite: starter.sprite, stats: { ...starter.stats } };
    team.name = `${STORY_CHARACTERS.rival.name}'s ${upgraded ? 'All-Stars' : 'Aces'}`;
  }
  if (team.id === 'story-arceus') team.players = team.players.map(p => ({ ...p, stats: Object.fromEntries(Object.entries(p.stats).map(([key, value]) => [key, Math.round(value * STORY_RULES.finalBossStatMultiplier)])) as unknown as typeof p.stats })) as Team['players'];
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
  if (zone.id === 'coastal') {
    zone.theme = coastalMissing(meta.story) ? 'An empty sea' : 'Sunshine, salt air, and friendly competition';
    zone.description = coastalMissing(meta.story) ? 'The island is gone. Win the championship to bring it home.' : 'Bright beaches and laid-back teams welcome a new season on the ice.';
  }
  if (zone.id === 'summit') {
    zone.theme = summitCursed(meta.story) ? 'A crown twisted by the Tower' : 'Grand halls and regal champions';
    zone.description = summitCursed(meta.story) ? 'The royal rinks rage without rest. Even the legendary birds have changed.' : 'Proud teams uphold the mountain league’s traditions beneath its soaring banners.';
    if (summitCursed(meta.story)) zone.difficulty = Math.min(1, zone.difficulty + .15);
  }
  return zone;
}

/** Story helper: one-time persistent story flag for each named world event. */
export function worldEventSeenFlag(eventId: string): string {
  return `world-event-seen-${eventId}`;
}

export function isZoneAvailable(id: string): boolean { return id !== "coastal" || !coastalMissing(getMeta().story); }
