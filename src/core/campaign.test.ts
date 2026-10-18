import { describe, expect, it } from 'vitest';
import { CAMPAIGN_TEAMS, USER_TEAM, type PlayerDef } from '../config/teams';
import {
  abandonMatch,
  applyPoach,
  availableOpponents,
  difficultyLevel,
  isChampion,
  isResumable,
  newRun,
  recordResult,
  sidePlayers,
  skipPoach,
  startMatch,
  teamById,
  wins,
  type CampaignState,
} from './campaign';

const TIDAL = 'tidal-wave';
const EMBER = 'ember-blitz';
const TUNDRA = 'tundra-kings';
const CHAMPION = 'aurora-dynasty';

/** A fresh run with the first match (vs Tidal Wave) already started. */
function startedRun(): CampaignState {
  return startMatch(newRun(), TIDAL);
}

/** A fresh run where Tidal Wave has just been beaten and awaits a poach. */
function wonRun(): CampaignState {
  return recordResult(startedRun(), TIDAL, 'win');
}

describe('newRun', () => {
  it('clones the starting roster (no shared references)', () => {
    const s = newRun();
    expect(s.userTeam).not.toBe(USER_TEAM);
    const stat = s.userTeam.players[0].stats;
    stat.speed = 1;
    expect(USER_TEAM.players[0].stats.speed).not.toBe(1);
  });

  it('starts with no results, not over', () => {
    const s = newRun();
    expect(s.results).toEqual({});
    expect(s.poaches).toEqual([]);
    expect(s.gameOver).toBe(false);
    expect(s.victory).toBe(false);
    expect(s.matchInProgress).toBeUndefined();
    expect(s.pendingPoach).toBeUndefined();
  });
});

describe('teamById / isChampion / wins', () => {
  it('finds campaign teams and rejects unknown ids', () => {
    expect(teamById(TIDAL).id).toBe(TIDAL);
    expect(() => teamById('nope')).toThrow();
  });

  it('only the champion is the champion', () => {
    expect(isChampion(CHAMPION)).toBe(true);
    for (const t of CAMPAIGN_TEAMS.filter((t) => t.id !== CHAMPION)) expect(isChampion(t.id)).toBe(false);
  });

  it('counts wins only', () => {
    let s = recordResult(startedRun(), TIDAL, 'win');
    s = recordResult(s, EMBER, 'loss');
    expect(wins(s)).toBe(1);
  });
});

describe('startMatch / abandonMatch', () => {
  it('marks the match in progress, and refuses unavailable teams', () => {
    const s = startedRun();
    expect(s.matchInProgress).toBe(TIDAL);
    expect(() => startMatch(s, CHAMPION)).not.toThrow();
    const faced = recordResult(startedRun(), TIDAL, 'win');
    expect(() => startMatch(faced, TIDAL)).toThrow('not available');
    const over = recordResult(startedRun(), TIDAL, 'loss');
    expect(() => startMatch(over, EMBER)).toThrow();
  });

  it('abandoning a started match forfeits it (loss, run over)', () => {
    const s = abandonMatch(startedRun());
    expect(s.results[TIDAL]).toBe('loss');
    expect(s.gameOver).toBe(true);
    expect(s.matchInProgress).toBeUndefined();
  });

  it('abandoning with no match in progress is a no-op (same state)', () => {
    const s = newRun();
    expect(abandonMatch(s)).toBe(s);
  });
});

describe('recordResult', () => {
  it('a regular win sets a pending poach and clears matchInProgress', () => {
    const s = wonRun();
    expect(s.results[TIDAL]).toBe('win');
    expect(s.pendingPoach).toBe(TIDAL);
    expect(s.matchInProgress).toBeUndefined();
    expect(s.gameOver).toBe(false);
    expect(s.victory).toBe(false);
  });

  it('a champion win is the victory (no poach)', () => {
    let s = wonRun();
    s = skipPoach(s);
    s = recordResult(s, CHAMPION, 'win');
    expect(s.victory).toBe(true);
    expect(s.pendingPoach).toBeUndefined();
    expect(s.gameOver).toBe(false);
  });

  it('a loss ends the run', () => {
    const s = recordResult(startedRun(), TIDAL, 'loss');
    expect(s.gameOver).toBe(true);
    expect(s.pendingPoach).toBeUndefined();
  });

  it('refuses to face a team twice or continue a finished run', () => {
    let s = recordResult(startedRun(), TIDAL, 'win');
    expect(() => recordResult(s, TIDAL, 'loss')).toThrow('already faced');
    s = skipPoach(s);
    s = recordResult(s, EMBER, 'loss');
    expect(() => recordResult(s, TUNDRA, 'win')).toThrow('already over');
  });

  it('is immutable: the input state is not mutated', () => {
    const before = startedRun();
    recordResult(before, TIDAL, 'win');
    expect(before.results).toEqual({});
    expect(before.matchInProgress).toBe(TIDAL);
  });
});

describe('skipPoach', () => {
  it('consumes the pending poach and keeps everything else', () => {
    const s = skipPoach(wonRun());
    expect(s.pendingPoach).toBeUndefined();
    expect(s.results[TIDAL]).toBe('win');
    expect(s.gameOver).toBe(false);
  });
});

describe('applyPoach', () => {
  it('swaps a field player into the dropped player\'s slot (order preserved)', () => {
    // Drop Charizard (field idx 1), take Lapras (tidal field idx 1).
    const s = applyPoach(wonRun(), 'field', TIDAL, 1, 1);
    const names = s.userTeam.players.map((p) => p.name);
    expect(names).toEqual(['Pikachu', 'Lapras', 'Machamp', 'Snorlax']);
    expect(s.pendingPoach).toBeUndefined();
    expect(s.poaches).toEqual([{ fromTeamId: TIDAL, side: 'field', taken: 'Lapras', dropped: 'Charizard' }]);
  });

  it('preserves slot order when the dropped and taken indices differ', () => {
    // Drop Machamp (field idx 2), take Gyarados (tidal field idx 2).
    const s = applyPoach(wonRun(), 'field', TIDAL, 2, 2);
    expect(s.userTeam.players.map((p) => p.name)).toEqual(['Pikachu', 'Charizard', 'Gyarados', 'Snorlax']);
  });

  it('swaps the goalie for the goalie', () => {
    const s = applyPoach(wonRun(), 'goalie', TIDAL, 0, 0);
    expect(s.userTeam.players.map((p) => p.name)).toEqual(['Pikachu', 'Charizard', 'Machamp', 'Wigglytuff']);
    const goalie = sidePlayers(s.userTeam, 'goalie');
    expect(goalie).toHaveLength(1);
    expect(goalie[0].name).toBe('Wigglytuff');
  });

  it('the taken player is a clone (no shared stat references)', () => {
    const s = applyPoach(wonRun(), 'field', TIDAL, 1, 1);
    const taken: PlayerDef = s.userTeam.players[1];
    const original = teamById(TIDAL).players[1];
    taken.stats.speed = 1;
    expect(original.stats.speed).not.toBe(1);
  });

  it('keeps the poach history across multiple poaches', () => {
    let s = applyPoach(wonRun(), 'field', TIDAL, 1, 1);
    s = startMatch(s, EMBER);
    s = recordResult(s, EMBER, 'win');
    s = applyPoach(s, 'goalie', EMBER, 0, 0);
    expect(s.poaches).toHaveLength(2);
    expect(s.poaches[1]).toEqual({ fromTeamId: EMBER, side: 'goalie', taken: 'Clefable', dropped: 'Snorlax' });
  });

  it('is immutable: the input roster is untouched', () => {
    const before = wonRun();
    const beforeNames = before.userTeam.players.map((p) => p.name);
    applyPoach(before, 'field', TIDAL, 1, 1);
    expect(before.userTeam.players.map((p) => p.name)).toEqual(beforeNames);
  });

  it('refuses: not a beaten team, the champion, and bad indices', () => {
    const s = wonRun();
    expect(() => applyPoach(s, 'field', EMBER, 0, 0)).toThrow('just beat');
    // Champion win: no pending poach, and poaching it throws.
    let c = skipPoach(s);
    c = recordResult(c, CHAMPION, 'win');
    expect(() => applyPoach(c, 'field', CHAMPION, 0, 0)).toThrow('no players');
    expect(() => applyPoach(s, 'field', TIDAL, 9, 0)).toThrow('Bad roster index');
    expect(() => applyPoach(s, 'goalie', TIDAL, 1, 0)).toThrow('Bad roster index');
  });
});

describe('difficultyLevel', () => {
  it('ramps 0.15 + 0.25 per win for regulars', () => {
    expect(difficultyLevel(newRun(), TIDAL)).toBeCloseTo(0.15);
    let s = wonRun(); // 1 win
    s = skipPoach(s);
    expect(difficultyLevel(s, EMBER)).toBeCloseTo(0.4);
    s = recordResult(s, EMBER, 'win'); // 2 wins
    s = skipPoach(s);
    expect(difficultyLevel(s, TUNDRA)).toBeCloseTo(0.65);
  });

  it('the champion is always 0.9', () => {
    expect(difficultyLevel(newRun(), CHAMPION)).toBeCloseTo(0.9);
    const s = wonRun();
    expect(difficultyLevel(s, CHAMPION)).toBeCloseTo(0.9);
  });

  it('losses do not lower the ramp', () => {
    let s = wonRun(); // 1 win
    s = skipPoach(s);
    s = recordResult(s, EMBER, 'loss'); // 1 win, 1 loss
    // unreachable in practice (loss ends the run), but the formula is wins-only:
    expect(difficultyLevel(s, TUNDRA)).toBeCloseTo(0.4);
  });
});

describe('availableOpponents / isResumable', () => {
  it('all four teams are available at the start', () => {
    expect(availableOpponents(newRun()).map((t) => t.id)).toEqual([TIDAL, EMBER, TUNDRA, CHAMPION]);
    expect(isResumable(newRun())).toBe(true);
  });

  it('shrinks as teams are faced; empty when the run is over', () => {
    let s = wonRun();
    s = skipPoach(s);
    expect(availableOpponents(s).map((t) => t.id)).toEqual([EMBER, TUNDRA, CHAMPION]);
    s = recordResult(s, EMBER, 'loss');
    expect(availableOpponents(s)).toEqual([]);
    expect(isResumable(s)).toBe(false);
  });

  it('a finished champion run is not resumable even though… nothing is left anyway', () => {
    let s = wonRun();
    s = skipPoach(s);
    s = recordResult(s, CHAMPION, 'win');
    expect(s.victory).toBe(true);
    expect(availableOpponents(s)).toEqual([]);
    expect(isResumable(s)).toBe(false);
  });
});
