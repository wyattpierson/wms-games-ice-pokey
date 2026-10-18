import { describe, expect, it } from 'vitest';
import { CAMPAIGN_TEAMS, type PlayerDef } from '../config/teams';
import { compareStats, netUpgrade, overall, averageOverall, type StatDelta } from './poach';

const TIDAL_TEAM = CAMPAIGN_TEAMS.find((t) => t.id === 'tidal-wave')!;

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

  it('works on real players (Lapras vs a Charizard-like)', () => {
    // Lapras (130,85,85,80,85,60) vs (78,84,85,79,85,100):
    // HP +52 up, ATK +1 up, SPA 0 even, DEF +1 up, SDF 0 even, SPD -40 down -> net +2
    const taken = TIDAL_TEAM.players[1];
    const dropped = { name: 'X', sprite: 2, stats: { hp: 78, attack: 84, specialAttack: 85, defense: 79, specialDefense: 85, speed: 100 } } as PlayerDef;
    expect(netUpgrade(compareStats(taken, dropped))).toBe(2);
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

  it('averages the members\' overalls (Tidal Wave)', () => {
    // Squirtle 60, Lapras 88, Gyarados 92, Wigglytuff 85 -> 325/4 = 81.25 -> 81
    expect(averageOverall(TIDAL_TEAM.players)).toBe(81);
  });
});
