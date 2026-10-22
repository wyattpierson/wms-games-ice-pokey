import { describe, expect, it } from 'vitest';
import { averageOverall, overall } from '../core/poach';
import { ISLAND_TEAMS, ALL_TEAMS, USER_TEAM } from './teams';
import { TOWER_STAGES, ZONES, zoneThreatLevel } from './progression';
import { TOWER_TEAMS } from './towerTeams';

function zoneTeams(zoneId: string) {
  return ISLAND_TEAMS[zoneId];
}

describe('realm roster progression', () => {
  it('steps island team overall ranges upward from realm to realm', () => {
    const zones = ZONES.map(zone => ({
      zone,
      regularValues: zoneTeams(zone.id).filter(team => team.id !== zone.bossId).map(team => averageOverall(team.players)),
    }));
    for (let i = 1; i < zones.length; i++) {
      const previousMax = Math.max(...zones[i - 1].regularValues);
      const currentMin = Math.min(...zones[i].regularValues);
      expect(currentMin, `${zones[i].zone.name} regular teams should be a clear step up`).toBeGreaterThan(previousMax);
    }
    for (const { zone, regularValues } of zones) {
      const boss = zoneTeams(zone.id).find(team => team.id === zone.bossId)!;
      expect(averageOverall(boss.players), `${zone.name} boss should be stronger than its regular teams`).toBeGreaterThan(Math.max(...regularValues));
    }
  });

  it('keeps normalized gameplay stats within their effective ceiling', () => {
    const activeTeams = [...ZONES.flatMap(zone => zoneTeams(zone.id)), ...TOWER_TEAMS];
    for (const team of activeTeams) {
      for (const player of team.players) {
        for (const [key, value] of Object.entries(player.stats)) {
          if (key !== 'hp') expect(value, `${team.name}: ${player.name} ${key} exceeds the effective cap`).toBeLessThanOrEqual(120);
        }
      }
    }
  });

  it('keeps the best regular recruit improving across realms', () => {
    const bestRecruitByZone = ZONES.map(zone => Math.max(...zone.opponents
      .flatMap(id => ALL_TEAMS.find(team => team.id === id)!.players)
      .map(overall)));
    for (let i = 1; i < bestRecruitByZone.length; i++) {
      expect(bestRecruitByZone[i]).toBeGreaterThan(bestRecruitByZone[i - 1]);
    }
  });

  it('does not reuse Pokémon across the configured player, realm, legacy, and tower teams', () => {
    const seen = new Set<string>();
    for (const player of USER_TEAM.players) seen.add(player.name);
    for (const team of ALL_TEAMS) {
      for (const player of team.players) {
        expect(seen.has(player.name), `${player.name} is duplicated across team definitions`).toBe(false);
        seen.add(player.name);
      }
    }
    for (const starterEvolution of ['Tyranitar', 'Garchomp', 'Salamence']) {
      expect(seen.has(starterEvolution), `${starterEvolution} is reserved for starter evolution`).toBe(false);
    }
  });

  it('uses a local AI ramp and reserves an elite opening for the tower', () => {
    expect(zoneThreatLevel(ZONES[0].difficulty, 3, true)).toBeCloseTo(0.285);
    expect(zoneThreatLevel(ZONES[1].difficulty, 0, false)).toBeCloseTo(0.30);
    expect(TOWER_STAGES[0].difficulty).toBe(0.97);
    expect(TOWER_STAGES[0].opponentId).toBe('tower-warden');
    expect(ALL_TEAMS.some(team => team.id === TOWER_STAGES[0].opponentId)).toBe(true);
  });
});
