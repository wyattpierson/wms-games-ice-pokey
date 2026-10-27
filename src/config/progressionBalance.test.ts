import { describe, expect, it } from 'vitest';
import { averageOverall, overall } from '../core/poach';
import { ISLAND_TEAMS, ALL_TEAMS, USER_TEAM } from './teams';
import { ITEM_IDS, SHOP_OFFERS, TOWER_STAGES, TIME_COSTS, YEAR_LENGTH_DAYS, ZONES, zoneThreatLevel } from './progression';
import { TOWER_TEAMS } from './towerTeams';
import { WORLD_EVENTS } from './worldEvents';

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
      for (const regularOverall of regularValues) {
        expect(averageOverall(boss.players), `${zone.name} boss should be exactly 5 OVR above every regular team`).toBe(regularOverall + 5);
      }
    }
  });

  it('offers one fast Coastal recruit per team with slower supporting players', () => {
    for (const team of zoneTeams('coastal').filter(team => team.role === 'regular')) {
      const recruits = team.players.filter(player => !player.goalie && player.stats.speed >= 100);
      expect(recruits, team.name).toHaveLength(1);
      expect(recruits[0].stats.attack, team.name).toBeGreaterThanOrEqual(100);
      expect(averageOverall(team.players)).toBeLessThanOrEqual(72);
    }
  });

  it('preserves the boss OVR gap when world events replace a roster', () => {
    for (const event of WORLD_EVENTS) {
      for (const override of event.teamOverrides ?? []) {
        const zone = ZONES.find(zone => zone.bossId === override.teamId);
        if (!zone || !override.players) continue;
        for (const team of zoneTeams(zone.id).filter(team => team.role === 'regular')) {
          expect(averageOverall(override.players), event.id).toBe(averageOverall(team.players) + 5);
        }
      }
    }
  });

  it('makes the Summit boss skaters appealing speed recruits', () => {
    const boss = zoneTeams('summit').find(team => team.role === 'boss')!;
    for (const player of boss.players.filter(player => !player.goalie)) {
      expect(player.stats.speed, player.name).toBeGreaterThanOrEqual(110);
    }
  });

  it('gives boss goalies strong defense without making them elite in every stat', () => {
    for (const zone of ZONES) {
      const goalie = zoneTeams(zone.id).find(team => team.role === 'boss')!.players.find(player => player.goalie)!;
      expect(goalie.stats.defense, goalie.name).toBeGreaterThanOrEqual(90);
      expect(goalie.stats.specialDefense, goalie.name).toBeGreaterThanOrEqual(100);
      expect(goalie.stats.attack, goalie.name).toBeLessThanOrEqual(90);
      expect(goalie.stats.speed, goalie.name).toBeLessThan(100);
    }
  });

  it('has five tower floors with one unique, valid team per floor and increasing AI difficulty', () => {
    expect(TOWER_STAGES).toHaveLength(5);
    expect(new Set(TOWER_STAGES.map(stage => stage.opponentId)).size).toBe(5);
    expect(TOWER_STAGES.map(stage => stage.opponentId)).toEqual(TOWER_TEAMS.map(team => team.id));
    for (let i = 1; i < TOWER_STAGES.length; i++) {
      expect(TOWER_STAGES[i].difficulty).toBeGreaterThan(TOWER_STAGES[i - 1].difficulty);
    }
    expect(TOWER_STAGES[4].difficulty).toBe(1);
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


describe('year calendar costs', () => {
  it('charges island bosses 100 days and regular matches 20 days', () => {
    expect(TIME_COSTS.bossMatch).toBe(100);
    expect(TIME_COSTS.match).toBe(20);
    expect(TIME_COSTS.islandVisit).toBe(60);
    expect(YEAR_LENGTH_DAYS).toBe(365);
  });
});


describe('Item Shop region-resource requirements', () => {
  it('requires the matching realm resource for special evolution, Mega, and Super Shot items', () => {
    const byId = new Map(SHOP_OFFERS.map(offer => [offer.id, offer]));
    expect(byId.get(ITEM_IDS.evolvePikachu)?.requiresResource).toEqual({ zoneId: 'coastal', amount: 1 });
    expect(byId.get(ITEM_IDS.evolvePsyduck)?.requiresResource).toEqual({ zoneId: 'haunted', amount: 1 });
    expect(byId.get(ITEM_IDS.superShot)?.requiresResource).toEqual({ zoneId: 'summit', amount: 1 });
    expect(byId.get(ITEM_IDS.megaEvolution)?.requiresResource).toEqual({ zoneId: 'abyss', amount: 1 });
    for (const id of [ITEM_IDS.evolvePikachu, ITEM_IDS.evolvePsyduck, ITEM_IDS.superShot, ITEM_IDS.megaEvolution]) {
      expect(byId.get(id)?.cost).toBeGreaterThan(0);
    }
  });
});
