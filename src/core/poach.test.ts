import { describe, expect, it } from 'vitest';
import { CAMPAIGN_TEAMS, type PlayerDef } from '../config/teams';
import { compareStats, netUpgrade, overall, averageOverall, rosterEntries, suggestDrop, type StatDelta } from './poach';
import { applyPoach, newRun, recordResult, startMatch } from './campaign';

const KNUCKLE_TEAM = CAMPAIGN_TEAMS.find((t) => t.id === 'knuckle-club')!;

function p(name: string, hp: number, atk: number, spa: number, def: number, sdf: number, spd: number, goalie?: boolean): PlayerDef {
  return { name, sprite: 1, goalie, stats: { hp, attack: atk, specialAttack: spa, defense: def, specialDefense: sdf, speed: spd } };
}

describe('compareStats', () => {
  it('lists all six stats with taken, dropped and diff', () => {
    const taken = p('A', 100, 90, 80, 70, 60, 50);
    const dropped = p('B', 80, 90, 60, 70, 60, 70);
    const deltas = compareStats(taken, dropped);
    expect(deltas.map((d) => d.key)).toEqual(['hp', 'attack', 'specialAttack', 'defense', 'specialDefense', 'speed']);
    expect(deltas.map((d) => d.label)).toEqual(['HP', 'ATK', 'SPA', 'DEF', 'SDF', 'SPD']);
    const hp = deltas[0];
    expect(hp.taken).toBe(100);
    expect(hp.dropped).toBe(80);
    expect(hp.diff).toBe(20);
    // attack is even, speed got worse
    expect(deltas[1].diff).toBe(0);
    expect(deltas[5].diff).toBe(-20);
  });
});

describe('netUpgrade', () => {
  it('counts improved stats +1, worsened -1, even 0', () => {
    const d = (key: string, diff: number): StatDelta => ({ key: key as StatDelta['key'], label: key, taken: 0, dropped: 0, diff });
    expect(netUpgrade([d('hp', 5), d('attack', 5), d('specialAttack', 5), d('defense', 5), d('specialDefense', 5), d('speed', 5)])).toBe(6);
    expect(netUpgrade([d('hp', -5), d('attack', -5), d('specialAttack', -5), d('defense', -5), d('specialDefense', -5), d('speed', -5)])).toBe(-6);
    expect(netUpgrade([d('hp', 0), d('attack', 0), d('specialAttack', 0), d('defense', 0), d('specialDefense', 0), d('speed', 0)])).toBe(0);
    // mixed: 3 up, 2 down, 1 even
    expect(netUpgrade([d('hp', 1), d('attack', 1), d('specialAttack', 1), d('defense', -1), d('specialDefense', -1), d('speed', 0)])).toBe(1);
  });

  it('works on real players (Hitmonchan vs a Charizard-like)', () => {
    // Hitmonchan (50,105,35,79,110,76) vs (78,84,85,79,85,100):
    // HP -28 down, ATK +21 up, SPA -50 down, DEF 0 even, SDF +25 up, SPD -24 down -> net -1
    const taken = KNUCKLE_TEAM.players[1];
    const dropped = { name: 'X', sprite: 2, stats: { hp: 78, attack: 84, specialAttack: 85, defense: 79, specialDefense: 85, speed: 100 } } as PlayerDef;
    expect(netUpgrade(compareStats(taken, dropped))).toBe(-1);
  });
});

describe('overall', () => {
  it('is the rounded mean of the six stats', () => {
    // 35+45+55+40+50+120 = 345; 345/6 = 57.5 -> 58
    expect(overall(p('Pikachu', 35, 45, 55, 40, 50, 120))).toBe(58);
    // 130+85+85+80+85+60 = 525; 525/6 = 87.5 -> 88
    expect(overall(p('Lapras', 130, 85, 85, 80, 85, 60))).toBe(88);
  });
});

describe('averageOverall', () => {
  it('is 0 for an empty group', () => {
    expect(averageOverall([])).toBe(0);
  });

  it('averages the members\' overalls (Knuckle Club)', () => {
    // Pawmot 82, Hitmonchan 76, Grapploct 80, Hariyama 79 -> 317/4 = 79.25 -> 79
    expect(averageOverall(KNUCKLE_TEAM.players)).toBe(79);
  });
});

describe('rosterEntries', () => {
  it('lists the field players first and the goalie last, with per-side indices', () => {
    const entries = rosterEntries(KNUCKLE_TEAM);
    expect(entries.map((e) => e.side)).toEqual(['field', 'field', 'field', 'goalie']);
    expect(entries.map((e) => e.sideIdx)).toEqual([0, 1, 2, 0]);
    expect(entries[3].player.goalie).toBe(true);
  });

  it('even when the goalie is NOT last in the roster tuple', () => {
    const [a, b, c, d] = KNUCKLE_TEAM.players;
    const shuffled = { ...KNUCKLE_TEAM, players: [d, a, b, c] as typeof KNUCKLE_TEAM.players };
    const entries = rosterEntries(shuffled);
    expect(entries.map((e) => e.player.name)).toEqual([a.name, b.name, c.name, d.name]);
    expect(entries.map((e) => e.sideIdx)).toEqual([0, 1, 2, 0]);
  });

  it('sideIdx is the index applyPoach() takes: picking an entry takes THAT player', () => {
    let state = newRun();
    state = recordResult(startMatch(state, 'knuckle-club'), 'knuckle-club', 'win');
    const take = rosterEntries(KNUCKLE_TEAM)[2]; // Grapploct
    const drop = rosterEntries(state.userTeam)[1]; // Pikachu
    const next = applyPoach(state, take.side, 'knuckle-club', take.sideIdx, drop.sideIdx);
    expect(next.userTeam.players.map((pl) => pl.name)).toContain(take.player.name);
    expect(next.userTeam.players.map((pl) => pl.name)).not.toContain(drop.player.name);
  });
});

describe('suggestDrop', () => {
  const own = rosterEntries({
    ...KNUCKLE_TEAM,
    players: [p('Mid', 60, 60, 60, 60, 60, 60), p('Weak', 10, 10, 10, 10, 10, 10), p('Strong', 90, 90, 90, 90, 90, 90), p('Keeper', 50, 50, 50, 50, 50, 50, true)],
  });

  it('suggests the weakest player of the same side', () => {
    expect(own[suggestDrop(own, 'field')].player.name).toBe('Weak');
  });

  it('only ever suggests from the requested side (goalie ↔ goalie)', () => {
    expect(own[suggestDrop(own, 'goalie')].player.name).toBe('Keeper');
  });

  it('breaks ties toward the first, and returns -1 when the side is empty', () => {
    const tie = rosterEntries({ ...KNUCKLE_TEAM, players: [p('A', 50, 50, 50, 50, 50, 50), p('B', 50, 50, 50, 50, 50, 50), p('C', 90, 90, 90, 90, 90, 90), p('K', 50, 50, 50, 50, 50, 50, true)] });
    expect(tie[suggestDrop(tie, 'field')].player.name).toBe('A');
    expect(suggestDrop([], 'goalie')).toBe(-1);
  });
});
